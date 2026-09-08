import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

import { montarFatos, primeiroJogoDoDia } from '../dominio/fatos'
import {
  feedSnapshot,
  jogadores,
  jogos,
  mediasJogador,
  niveis,
  niveisVersao,
  oddsAgregada,
  times,
} from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { gravarApitos } from '../dominio/repositorios/apitos'
import { avaliar } from '../motor'
import { arredondar } from '../motor/arredondamento'
import { faixaDaConfianca } from '../motor/confianca'
import type { Apito, Atributo, Nivel } from '../motor/tipos'
import type { Ruleset } from '../motor/ruleset/schema'
import { janelaNoBanco } from '../dominio/janela'
import { calendarioDoRuleset, temporadaDe } from '../dominio/temporada'
import { colunaMedia, jogosRecentes, naLinha } from './historico-na-linha'
import type { PortaLLM } from '../ingestao/llm'
import { enriquecerComNarrativas } from './narrativa'
import type { ConteudoFeed, ItemFeed } from './tipos-feed'

// `ItemFeed`/`ConteudoFeed` moram em `tipos-feed.ts` — ver o comentário lá
// para o porquê (evita ciclo de import com `narrativa.ts`). Reexportados
// aqui porque este é o ponto de importação público de sempre.
export type { ItemFeed, ConteudoFeed } from './tipos-feed'

export type ResultadoPublicacao =
  | { publicou: false; motivo: 'ainda-cedo' | 'sem-jogos' | 'sem-lista-ativa' }
  | {
      publicou: true
      mudou: boolean
      hash: string
      itens: number
      apitosNovos: number
      /** Quantas narrativas passaram pelo validador nesta publicação. */
      narrativas?: number
      /**
       * Quantas o validador RECUSOU. Anda junto com `narrativas` porque
       * "geradas: 0" sozinho não diz se o provedor caiu ou se o texto foi
       * recusado — e é o número que a spec §4.2 manda contar.
       */
      narrativasReprovadas?: number
    }

function hashDe(conteudo: ConteudoFeed): string {
  // O horário de geração fica FORA do hash de propósito: senão toda execução
  // pareceria uma mudança, e o reprocessamento perderia o sentido. Ele mora em
  // `conteudo.geradoEm`, e não no item — então hashear os ITENS INTEIROS já o
  // exclui, sem precisar escolher campos a dedo.
  //
  // E escolher a dedo era o bug: a tupla antiga cobria cinco campos, `fotoUrl`
  // não era um deles. A foto entrava em `jogadores`, a republicação concluía
  // "nada mudou" e o feed seguia servindo monograma. Todo campo novo de
  // `ItemFeed` herdava o mesmo silêncio. Nenhum campo do item é volátil, então
  // o item inteiro é o hash certo.
  const estavel = JSON.stringify(conteudo.itens)
  return createHash('sha256').update(estavel).digest('hex').slice(0, 16)
}

/**
 * Publica a Lista Secreta do dia.
 *
 * Reexecutável de propósito: escalação muda até 1h antes do jogo, e a OPD
 * depende inteiramente dela. Chamar de novo recalcula, e o snapshot só é
 * regravado quando o conteúdo realmente mudou.
 */
export async function publicarListaSecreta(
  db: Db,
  ruleset: Ruleset,
  opcoes: {
    dataReferencia: string
    agora: Date
    ignorarAntecedencia?: boolean
    /** Ausente = sem narrativas. A publicação nunca depende da LLM. */
    llm?: PortaLLM
  },
): Promise<ResultadoPublicacao> {
  const primeiro = await primeiroJogoDoDia(db, opcoes.dataReferencia, ruleset.rodada.fuso)
  if (primeiro === null) return { publicou: false, motivo: 'sem-jogos' }

  if (opcoes.ignorarAntecedencia !== true) {
    const antecedenciaMs = ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000
    if (opcoes.agora.getTime() < primeiro.getTime() - antecedenciaMs) {
      return { publicou: false, motivo: 'ainda-cedo' }
    }
  }

  const fatos = await montarFatos(db, opcoes.dataReferencia, calendarioDoRuleset(ruleset), ruleset.media.janela)
  if (fatos.times.length === 0) return { publicou: false, motivo: 'sem-lista-ativa' }

  const apitos = avaliar(fatos, ruleset).filter((a) => a.estrategia === 'LISTA_SECRETA')

  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  const rulesetVersao = `v${ruleset.version}`

  const gravados = await gravarApitos(db, rulesetVersao, apitos)

  const conteudo: ConteudoFeed = {
    dataReferencia: opcoes.dataReferencia,
    geradoEm: opcoes.agora.toISOString(),
    rulesetVersao: versao ? `${rulesetVersao}+${versao.versao}` : rulesetVersao,
    itens: await enriquecer(db, ruleset, apitos),
  }

  const hash = hashDe(conteudo)

  const [existente] = await db
    .select()
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, opcoes.dataReferencia),
        eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
      ),
    )
    .limit(1)

  const mudou = existente?.hash !== hash

  let narrativas = 0
  let narrativasReprovadas = 0

  /**
   * Grava SÓ o `conteudo_json` da linha da Lista Secreta.
   *
   * Mesmo predicado do SELECT de `existente` acima — dataReferencia +
   * estrategia identificam a linha (jogoId é sempre NULL nela). `hash` e
   * `geradoEm` ficam de fora: o hash é a impressão digital da ESTRATÉGIA, e
   * nada nela mudou por causa de texto.
   */
  const gravarConteudo = async (parcial: ConteudoFeed): Promise<void> => {
    await db
      .update(feedSnapshot)
      .set({ conteudoJson: parcial })
      .where(
        and(
          eq(feedSnapshot.dataReferencia, opcoes.dataReferencia),
          eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
        ),
      )
  }

  if (mudou) {
    // A NARRATIVA É ANEXADA DEPOIS DO HASH, e só quando algo mudou.
    //
    // O hash é a impressão digital do conteúdo de ESTRATÉGIA. Texto de LLM não
    // é determinístico: se entrasse no hash, cada execução do cron veria
    // "mudou" e republicaria o snapshot — push repetido e conta de LLM a cada
    // minuto. Gerando aqui, reexecutar com os mesmos fatos não chama a LLM.
    //
    // A PUBLICAÇÃO NUNCA ESPERA A LLM: o insert abaixo grava `conteudo` SEM
    // narrativa primeiro — a lista já está no ar a partir daqui. Só depois é
    // que o enriquecimento roda, e o resultado vai para o banco com um UPDATE
    // que toca só `conteudo_json`; `hash` e `geradoEm` não mudam, porque nada
    // na estratégia mudou. Se o provedor de LLM travar ou estourar o timeout,
    // essa segunda etapa morre e a lista fica publicada sem narrativa — que a
    // spec já trata como estado normal (o campo é opcional). O inverso —
    // atrasar ou perder a publicação esperando a LLM — não é aceitável: o
    // cron tem `maxDuration` finito, e sem essa ordem um provedor lento faz a
    // função morrer ANTES do insert, e a lista simplesmente não sai.
    await db
      .insert(feedSnapshot)
      .values({
        dataReferencia: opcoes.dataReferencia,
        estrategia: 'LISTA_SECRETA',
        conteudoJson: conteudo,
        geradoEm: opcoes.agora,
        hash,
      })
      .onConflictDoUpdate({
        // A UNIQUE passou a incluir jogo_id (spec 05); NULL colide via nullsNotDistinct.
        target: [feedSnapshot.dataReferencia, feedSnapshot.estrategia, feedSnapshot.jogoId],
        set: { conteudoJson: conteudo, geradoEm: opcoes.agora, hash },
      })

    if (opcoes.llm) {
      // O enriquecimento GRAVA PROGRESSO enquanto anda (ver `LOTE_DE_GRAVACAO`
      // em `narrativa.ts`). Com o `maxDuration` do cron e um provedor lento,
      // a função morre no meio da lista — e antes disso o que já foi gerado
      // (e pago) se perdia inteiro, para nunca mais ser tentado, porque o
      // hash não muda no ciclo seguinte.
      const enriquecido = await enriquecerComNarrativas(db, opcoes.llm, conteudo, {
        gravarParcial: gravarConteudo,
        // O snapshot que este está substituindo: item igual reaproveita a
        // narrativa. Sem isto a republicação depois das odds — que muda o
        // hash, não as entradas — gerava a lista inteira de novo (274
        // chamadas por dia na carga de 07/09, metade delas por nada).
        anterior: (existente?.conteudoJson as ConteudoFeed | undefined) ?? null,
      })
      narrativas = enriquecido.geradas
      narrativasReprovadas = enriquecido.reprovadas

      await gravarConteudo(enriquecido.conteudo)
    }
  }

  return {
    publicou: true,
    mudou,
    hash,
    itens: conteudo.itens.length,
    apitosNovos: gravados.length,
    narrativas,
    narrativasReprovadas,
  }
}

/** Junta ao apito o que a tela precisa mostrar: nome, time, sigla. */
async function enriquecer(db: Db, ruleset: Ruleset, apitos: Apito[]): Promise<ItemFeed[]> {
  if (apitos.length === 0) return []

  const idsJogos = [...new Set(apitos.map((a) => a.jogoId))]
  const idsJogadores = [...new Set(apitos.map((a) => a.jogadorId))]
  const [elenco, listaTimes, vinculos, jogosDaLista, medias, oddsLinhas] = await Promise.all([
    db.select().from(jogadores),
    db.select().from(times),
    db
      .select({ jogadorId: niveis.jogadorId, atributo: niveis.atributo, timeId: niveis.timeId })
      .from(niveis)
      .innerJoin(niveisVersao, eq(niveis.niveisVersaoId, niveisVersao.id))
      .where(and(eq(niveisVersao.ativa, true), inArray(niveis.jogadorId, idsJogadores))),
    db.select().from(jogos).where(inArray(jogos.id, idsJogos)),
    db
      .select()
      .from(mediasJogador)
      .where(
        and(
          // A janela vem do RULESET (regra 1) — a mesma tradução da sincronização.
          eq(mediasJogador.janela, janelaNoBanco(ruleset.media.janela)),
          inArray(mediasJogador.jogadorId, idsJogadores),
        ),
      ),
    db
      .select()
      .from(oddsAgregada)
      .where(and(inArray(oddsAgregada.jogoId, idsJogos), inArray(oddsAgregada.jogadorId, idsJogadores))),
  ])

  const nomePorJogador = new Map(elenco.map((j) => [j.id, j.nomeCompleto] as const))
  const posicaoPorJogador = new Map(elenco.map((j) => [j.id, j.posicao] as const))
  const fotoPorJogador = new Map(elenco.map((j) => [j.id, j.fotoUrl] as const))
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  // O vínculo pertence à versão ativa e ao atributo que gerou o apito.
  // Outra classificação do mesmo jogador pode pertencer a outro time.
  const timeDoJogador = new Map(
    vinculos.map((v) => [`${v.jogadorId}|${v.atributo}`, v.timeId] as const),
  )

  const jogoPorId = new Map(jogosDaLista.map((j) => [j.id, j] as const))
  const calendario = calendarioDoRuleset(ruleset)
  const mediaPorChave = new Map(medias.map((m) => [`${m.jogadorId}|${m.temporada}`, m] as const))
  const oddPorChave = new Map(
    oddsLinhas.map((o) => [`${o.jogoId}|${o.jogadorId}|${o.atributo}|${Number(o.linha)}`, o] as const),
  )

  // Histórico recente — a MESMA consulta do detalhe, rodando na publicação.
  // Deduplicada por (jogador, jogo) e em PARALELO: as várias linhas do mesmo
  // jogador compartilham a consulta em vez de repeti-la em série (errata 25/08).
  const chavesHistorico = new Map<string, { jogadorId: string; corte: Date }>()
  for (const a of apitos) {
    const jogo = jogoPorId.get(a.jogoId)
    if (jogo) chavesHistorico.set(`${a.jogadorId}|${a.jogoId}`, { jogadorId: a.jogadorId, corte: jogo.dataHoraUtc })
  }
  const historicoPorChave = new Map(
    await Promise.all(
      [...chavesHistorico.entries()].map(
        async ([chave, { jogadorId, corte }]) =>
          [chave, await jogosRecentes(db, jogadorId, corte, 5)] as const,
      ),
    ),
  )

  return apitos.map((a) => {
    const jogoDoApito = jogoPorId.get(a.jogoId)
    const temporadaDoApito = jogoDoApito ? temporadaDe(jogoDoApito.dataHoraUtc, calendario) : null
    const mediaRow = temporadaDoApito
      ? mediaPorChave.get(`${a.jogadorId}|${temporadaDoApito}`)
      : undefined
    const valorMedia = mediaRow ? colunaMedia(mediaRow, a.atributo) : null
    const oddRow =
      a.linha !== null
        ? oddPorChave.get(`${a.jogoId}|${a.jogadorId}|${a.atributo}|${a.linha}`)
        : undefined
    const time = timePorId.get(timeDoJogador.get(`${a.jogadorId}|${a.atributo}`) ?? '')
    // Mesma conta que a tela imprime: arredonda primeiro, gradua depois.
    const exibido = a.confianca === null ? null : arredondar(a.confianca, ruleset)
    return {
      chave: a.chaveDeduplicacao,
      jogoId: a.jogoId,
      jogadorId: a.jogadorId,
      nome: nomePorJogador.get(a.jogadorId) ?? a.jogadorId,
      timeSigla: time?.sigla ?? '—',
      timeNome: time?.nome ?? '—',
      fotoUrl: fotoPorJogador.get(a.jogadorId) ?? null,
      atributo: a.atributo,
      nivelJogador: a.nivelJogador,
      nivelApito: a.nivelApito,
      turbo: a.turbo,
      modoFire: a.modoFire,
      opdOrigemNivel: a.opdOrigemNivel,
      linha: a.linha,
      confianca: a.confianca,
      grauConfianca: faixaDaConfianca(exibido, ruleset)?.grau ?? null,
      alvo1Q: a.alvo1Q,
      metodo: a.metodo,
      posicao: posicaoPorJogador.get(a.jogadorId) ?? null,
      ultimos5: naLinha(
        historicoPorChave.get(`${a.jogadorId}|${a.jogoId}`) ?? [],
        a.atributo,
        a.linha ?? a.alvo1Q,
      ),
      mediaTemporada: valorMedia !== null ? Number(valorMedia) : null,
      oddFaixa:
        oddRow && oddRow.oddMin !== null && oddRow.oddMax !== null
          ? {
              min: Number(oddRow.oddMin),
              max: Number(oddRow.oddMax),
              qtdCasas: oddRow.qtdCasas,
              // A média entre casas — SÓ quando o ruleset manda exibi-la
              // (odds.exibicao). A tela não decide; a materialização decide
              // pelo ruleset, e voltar a 'faixa' no yaml religa o antigo.
              ...(ruleset.odds.exibicao === 'media' && oddRow.oddMedia !== null
                ? { media: Number(oddRow.oddMedia) }
                : {}),
            }
          : null,
    }
  })
}

/**
 * As linhas de UM jogador no dia — o que o card resume e a tela de detalhe abre.
 *
 * O motor emite um apito por linha de pontos com a confiança já calculada (a
 * tabela base do nível mais o bônus do nível de apito). Aqui é só recorte de
 * leitura sobre o snapshot: a tela nunca executa o motor.
 */
export type LinhasDoJogador = {
  itens: ItemFeed[]
  geradoEm: Date | null
}

export async function linhasDoJogador(
  db: Db,
  dataReferencia: string,
  jogadorId: string,
  atributo?: Atributo,
): Promise<LinhasDoJogador> {
  const feed = await lerFeed(db, dataReferencia)
  if (feed === null) return { itens: [], geradoEm: null }

  const doJogador = feed.conteudo.itens.filter((i) => i.jogadorId === jogadorId)

  // Sem atributo pedido, mostra o do primeiro apito em vez de misturar linhas
  // de pontos com linhas de rebotes na mesma coluna — 25 e 8 lado a lado não
  // significam nada juntos.
  const escolhido = atributo ?? doJogador[0]?.atributo

  const itens = doJogador
    .filter((i) => i.atributo === escolhido)
    .sort((a, b) => (a.linha ?? 0) - (b.linha ?? 0))

  return { itens, geradoEm: feed.geradoEm }
}

// ---------------------------------------------------------------------------
// FILTROS DA LISTA — recorte de LEITURA, puro. A tela nunca executa o motor.
// ---------------------------------------------------------------------------

/** "TURBO" não é um método do motor: é o destaque que atravessa os dois. */
export type FiltroLista = {
  metodo?: 'OSCILACAO' | 'OPD' | 'TURBO'
  nivel?: Nivel
  time?: string
  posicao?: string
  atributo?: Atributo
}

export function filtrarItens(itens: ItemFeed[], filtro: FiltroLista): ItemFeed[] {
  return itens
    .filter((i) =>
      filtro.metodo === undefined
        ? true
        : filtro.metodo === 'TURBO'
          ? i.turbo
          : i.metodo === filtro.metodo,
    )
    .filter((i) => (filtro.nivel === undefined ? true : i.nivelJogador === filtro.nivel))
    .filter((i) => (filtro.time === undefined ? true : i.timeSigla === filtro.time))
    .filter((i) => (filtro.posicao === undefined ? true : i.posicao === filtro.posicao))
    .filter((i) => (filtro.atributo === undefined ? true : i.atributo === filtro.atributo))
}

/**
 * Um card por JOGADOR E ATRIBUTO, não por linha.
 *
 * O motor emite um apito por linha (20/25/30/35 em pontos). O documento do CJ
 * desenha uma BARRA por jogador com os "quadradinhos" das linhas dentro dela —
 * as linhas restantes vivem em /apito/<jogador>. Sem isso o mesmo nome aparece
 * três ou quatro vezes seguidas na lista.
 *
 * O atributo entra na chave porque um jogador pode apitar em pontos, rebotes e
 * assistências no mesmo dia: são três leituras independentes, e agrupar só por
 * jogador faria duas delas desaparecerem da tela sem aviso.
 *
 * Escolhe a linha de maior confiança; empate resolve pela MENOR linha, para
 * que a ordem não dependa da ordem de chegada.
 */
export function agruparPorJogador(itens: ItemFeed[]): ItemFeed[] {
  const melhor = new Map<string, ItemFeed>()
  for (const item of itens) {
    const chave = `${item.jogadorId}|${item.atributo}`
    const atual = melhor.get(chave)
    if (atual === undefined) {
      melhor.set(chave, item)
      continue
    }
    const c = item.confianca ?? -1
    const cAtual = atual.confianca ?? -1
    if (c > cAtual || (c === cAtual && (item.linha ?? Infinity) < (atual.linha ?? Infinity))) {
      melhor.set(chave, item)
    }
  }
  return [...melhor.values()]
}

/** Lê o feed materializado. É por aqui que a tela entra — nunca pelo motor. */
export async function lerFeed(
  db: Db,
  dataReferencia: string,
): Promise<{ conteudo: ConteudoFeed; geradoEm: Date } | null> {
  const [linha] = await db
    .select()
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, dataReferencia),
        eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
      ),
    )
    .limit(1)

  if (!linha) return null
  const conteudo = await comFotosAoVivo(db, linha.conteudoJson as ConteudoFeed)
  return { conteudo, geradoEm: linha.geradoEm }
}

/**
 * A FOTO É LIDA AO VIVO, não do snapshot.
 *
 * O snapshot continua gravando `fotoUrl` (o hash cobre o item inteiro — ver o
 * teste "trocar a foto REGRAVA o snapshot"), mas a leitura sobrescreve com o
 * que está em `jogadores.foto_url` agora. Motivo, medido na carga de
 * 07/09/2026: `demo:fotos` roda depois da publicação, ninguém republica, e a
 * tela abriu com 0 de 137 cards com rosto embora três apitados tivessem foto.
 * Foto é apresentação; congelá-la dentro de um JSON de estratégia era prender
 * uma coisa dentro da outra. Uma consulta a mais por leitura, sobre ≤ 150 ids
 * por chave primária, na mesma região do banco (ADR-0008) — milissegundos.
 */
async function comFotosAoVivo(db: Db, conteudo: ConteudoFeed): Promise<ConteudoFeed> {
  const ids = [...new Set(conteudo.itens.map((i) => i.jogadorId))]
  if (ids.length === 0) return conteudo
  const fotos = await db
    .select({ id: jogadores.id, fotoUrl: jogadores.fotoUrl })
    .from(jogadores)
    .where(inArray(jogadores.id, ids))
  const porId = new Map(fotos.map((f) => [f.id, f.fotoUrl] as const))
  return {
    ...conteudo,
    itens: conteudo.itens.map((i) => ({ ...i, fotoUrl: porId.get(i.jogadorId) ?? null })),
  }
}

/**
 * Ordena pela escala de confiança, do mais forte para o mais fraco.
 *
 * Turbo primeiro, depois nível do apito, depois a nota. Empate desempata pela
 * chave, para que a ordem seja estável entre execuções.
 */
export function ordenarPorConfianca(itens: ItemFeed[]): ItemFeed[] {
  return [...itens].sort(
    (a, b) =>
      Number(b.turbo) - Number(a.turbo) ||
      b.nivelApito - a.nivelApito ||
      (b.confianca ?? 0) - (a.confianca ?? 0) ||
      a.chave.localeCompare(b.chave),
  )
}

/**
 * Aplica a mudança de escalação e republica.
 *
 * Escalações oficiais saem até 1h antes do jogo, e a OPD é inteiramente
 * dependente delas: um desfalque no topo da hierarquia muda os apitos dos
 * três jogadores seguintes.
 */
export async function reprocessarPorEscalacao(
  db: Db,
  ruleset: Ruleset,
  opcoes: { dataReferencia: string; agora: Date; llm?: PortaLLM },
): Promise<ResultadoPublicacao> {
  return publicarListaSecreta(db, ruleset, { ...opcoes, ignorarAntecedencia: true })
}
