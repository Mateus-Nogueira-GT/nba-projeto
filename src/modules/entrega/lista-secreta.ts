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
import type { Apito, Atributo, Metodo, Nivel, NivelApito } from '../motor/tipos'
import type { Ruleset } from '../motor/ruleset/schema'
import { janelaNoBanco } from '../dominio/janela'
import { calendarioDoRuleset, temporadaDe } from '../dominio/temporada'
import { colunaMedia, jogosRecentes, naLinha } from './historico-na-linha'

/**
 * Item já pronto para a tela.
 *
 * O feed é MATERIALIZADO: o motor roda uma vez por evento, não uma vez por
 * usuário. Com 10k conectados, é essa diferença que decide se a conta fecha.
 * Ver docs/01-arquitetura.md > "10.000 simultâneos".
 */
export type ItemFeed = {
  chave: string
  jogoId: string
  jogadorId: string
  nome: string
  timeSigla: string
  timeNome: string
  /** Foto do jogador, quando o provedor tem uma. Ausente em snapshot antigo. */
  fotoUrl: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  turbo: boolean
  modoFire: boolean
  opdOrigemNivel: NivelApito | null
  linha: number | null
  /** Nota de confiança da análise do CJ. Nunca "probabilidade". */
  confianca: number | null
  /**
   * Faixa VISUAL da nota (1..5), calculada UMA vez aqui, na materialização.
   *
   * Não é conveniência: `faixaDaConfianca` é função do MOTOR, e a tela não
   * executa o motor — a avaliação acontece uma vez por evento, não uma vez
   * por usuário (`tela-nao-chama-o-motor`, docs/01-arquitetura.md). O grau
   * viaja no feed pelo mesmo motivo que o resto do item viaja.
   *
   * Calculado sobre o valor ARREDONDADO, que é o que a tela imprime: com 85,5
   * a pílula mostra "86%" e a régua de /como-funciona promete grau 3 para 86.
   * Graduar o valor bruto daria grau 2 e a contradição apareceria em duas
   * telas. Null em snapshot anterior a este campo.
   */
  grauConfianca: 1 | 2 | 3 | 4 | 5 | null
  alvo1Q: number | null
  /**
   * Método que produziu o apito. Viaja no feed porque o documento do CJ pede
   * filtragem por método. Null em snapshot anterior à spec 08.
   */
  metodo: Metodo | null
  /** G/F/C — dado canônico do jogador, usado só como recorte de leitura. */
  posicao: string | null
  /**
   * Últimos 5 jogos conferidos contra a linha do apito, mais recente primeiro
   * — as barrinhas do card. MESMO cálculo do detalhe (historico-na-linha.ts).
   * Vazio em snapshot antigo ou sem linha/alvo para conferir.
   */
  ultimos5: { valor: number; bateu: boolean }[]
  /** Média da temporada que o motor usou — o card mostra sem chamar o motor. */
  mediaTemporada: number | null
  /**
   * Faixa de odds entre casas para a linha do apito, da última coleta.
   * `media` chega com a spec da lógica de dados; o card já sabe renderizar os
   * dois estados. Null sem coleta — o rodapé então omite a odd.
   */
  oddFaixa: { min: number; max: number; qtdCasas: number; media?: number } | null
}

export type ConteudoFeed = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  itens: ItemFeed[]
}

export type ResultadoPublicacao =
  | { publicou: false; motivo: 'ainda-cedo' | 'sem-jogos' | 'sem-lista-ativa' }
  | { publicou: true; mudou: boolean; hash: string; itens: number; apitosNovos: number }

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
  opcoes: { dataReferencia: string; agora: Date; ignorarAntecedencia?: boolean },
): Promise<ResultadoPublicacao> {
  const primeiro = await primeiroJogoDoDia(db, opcoes.dataReferencia, ruleset.rodada.fuso)
  if (primeiro === null) return { publicou: false, motivo: 'sem-jogos' }

  if (opcoes.ignorarAntecedencia !== true) {
    const antecedenciaMs = ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000
    if (opcoes.agora.getTime() < primeiro.getTime() - antecedenciaMs) {
      return { publicou: false, motivo: 'ainda-cedo' }
    }
  }

  const fatos = await montarFatos(db, opcoes.dataReferencia, calendarioDoRuleset(ruleset))
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

  if (mudou) {
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
  }

  return { publicou: true, mudou, hash, itens: conteudo.itens.length, apitosNovos: gravados.length }
}

/** Junta ao apito o que a tela precisa mostrar: nome, time, sigla. */
async function enriquecer(db: Db, ruleset: Ruleset, apitos: Apito[]): Promise<ItemFeed[]> {
  if (apitos.length === 0) return []

  const idsJogos = [...new Set(apitos.map((a) => a.jogoId))]
  const idsJogadores = [...new Set(apitos.map((a) => a.jogadorId))]
  const [elenco, listaTimes, vinculos, jogosDaLista, medias, oddsLinhas] = await Promise.all([
    db.select().from(jogadores),
    db.select().from(times),
    db.select().from(niveis),
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
  // O time vem da LISTA do CJ, não de jogadores.time_id — elencos projetados.
  const timeDoJogador = new Map(vinculos.map((v) => [v.jogadorId, v.timeId] as const))

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
    const time = timePorId.get(timeDoJogador.get(a.jogadorId) ?? '')
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
  return { conteudo: linha.conteudoJson as ConteudoFeed, geradoEm: linha.geradoEm }
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
  opcoes: { dataReferencia: string; agora: Date },
): Promise<ResultadoPublicacao> {
  return publicarListaSecreta(db, ruleset, { ...opcoes, ignorarAntecedencia: true })
}
