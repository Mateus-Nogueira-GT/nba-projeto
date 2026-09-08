import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'

import {
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { chavesEstrategiaConfirmadas } from '../dominio/fatos-editoriais'
import { identidadesDeApresentacao } from '../dominio/identidade-apresentacao'
import { janelaNoBanco } from '../dominio/janela'
import { entrouEmQuadraSql } from '../dominio/participacao'
import { dataDeReferencia, intervaloDoDia } from '../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../dominio/temporada'
import { deltaOscilacao, nivelMinimoOscilacao } from '../motor/atributos'
import type { Ruleset } from '../motor/ruleset/schema'
import { NIVEIS_APITO } from '../motor/tipos'
import type { Atributo, Nivel } from '../motor/tipos'
import { colunaMedia, jogosRecentes, valorDoJogo } from './historico-na-linha'
import type { ItemFeed } from './lista-secreta'

export type BlocoJogo = {
  adversarioSigla: string
  valor: number
  /** Conferido contra a LINHA do apito. `false` para todos quando não há linha. */
  bateu: boolean
}

/**
 * Um fator do "por que entrou" — identidade 04. Ordem FIXA na tela: nível do
 * jogador, depois o método com o FATO que o sustenta, depois modo fire e turbo
 * quando houver, e o nível do apito por último. Cada texto cita o fato (os
 * jogos abaixo, com os valores; quem do topo está fora), nunca o peso do
 * ruleset: mostrar a fórmula expõe o CJ e faz o % parecer soma de
 * probabilidades. A narrativa da LLM é legenda desta lista, não substituto.
 */
export type Fator = {
  chave: 'NIVEL' | 'OSCILACAO' | 'OPD' | 'FIRE_LIVE' | 'MODO_FIRE' | 'TURBO' | 'NIVEL_APITO'
  titulo: string
  texto: string
  /**
   * O pedaço do texto que a tela põe em negrito — sempre um PREFIXO de
   * `texto`. Fica aqui, e não na página, porque quem sabe qual é o fato é
   * quem montou a frase: fatiar por regex na tela quebraria em silêncio no
   * dia em que a redação mudasse.
   */
  destaque?: string
}

/**
 * O confronto do apito, resolvido UMA vez. A seção "O jogo" da tela lê daqui:
 * recalcular o adversário na página significaria uma segunda regra de "quem é
 * o outro lado" — e o time do apitado vem da curadoria do CJ, nunca de
 * `jogadores.time_id` (elencos projetados, CLAUDE.md).
 */
export type JogoDoApito = {
  casaSigla: string
  visitanteSigla: string
  /** O outro lado, pelo time do apitado na lista do CJ. */
  adversarioSigla: string
  /** O apitado joga em casa? Decide entre "vs" e "@" na linha de apoio. */
  emCasa: boolean
  dataHoraUtc: Date
  /** Nomes de quem está FORA da partida, os dois lados. Vazio = sem desfalques. */
  desfalques: string[]
}

export type DetalheApito = {
  mediaTemporada: number | null
  bateu: { acertos: number; total: number }
  /**
   * A linha contra a qual os blocos foram conferidos — `null` quando o apito
   * não tem linha pré-live. A tela lê daqui em vez de remontar a régua: é o
   * único lugar que sabe se houve conferência.
   */
  linhaConferida: number | null
  minutosRecentes: number | null
  /**
   * Minutos MÉDIOS dos jogos lidos — a caixa "MIN · MÉDIA" do detalhe. Os
   * minutos do último jogo (`minutosRecentes`) continuam existindo para quem
   * já os lia; média e último não são a mesma pergunta.
   */
  minutosMedia: number | null
  jogo: JogoDoApito
  blocos: BlocoJogo[]
  /** O texto plano de sempre — derivado dos fatores do método. */
  porQueEntrou: string[]
  /** Os fatores estruturados (identidade 04). */
  fatores: Fator[]
}

export type OpcoesDetalhe = {
  /** Quantos jogos entram nos blocos e na conferência. Padrão 5 (o card); o detalhe da 04 pede 10. */
  blocos?: number
}

const UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

const ROTULO_NIVEL: Record<Nivel, string> = {
  MVP: 'MVP',
  ALL_STAR: 'All Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}

/** Número no padrão pt-BR: vírgula decimal, uma casa. */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// Leitura DERIVADA: descreve o que o motor já decidiu, não decide nada novo.
// Por isso vive na entrega e não no motor — nenhuma regra nova nasce aqui.
export async function detalheDoApito(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
  opcoes: OpcoesDetalhe = {},
): Promise<DetalheApito> {
  // 1º passo obrigatório: buscar o jogo do item — dele saem a data (para a
  // temporada e para recortar o histórico) e os dois times (para o adversário).
  const [jogo] = await db.select().from(jogos).where(eq(jogos.id, item.jogoId)).limit(1)
  if (!jogo) {
    throw new Error(`detalheDoApito: jogo não encontrado para o item ${item.chave}`)
  }

  const temporada = temporadaDe(jogo.dataHoraUtc, calendarioDoRuleset(ruleset))

  // 1 · A mesma janela configurada para o motor. A média continua móvel;
  // o nome público mediaTemporada é legado e não define a janela consultada.
  const [mediaRow] = await db
    .select()
    .from(mediasJogador)
    .where(
      and(
        eq(mediasJogador.jogadorId, item.jogadorId),
        eq(mediasJogador.janela, janelaNoBanco(ruleset.media.janela)),
        eq(mediasJogador.temporada, temporada),
      ),
    )
    .limit(1)

  const valorMedia = mediaRow ? colunaMedia(mediaRow, item.atributo) : null
  const mediaTemporada = valorMedia !== null ? Number(valorMedia) : null

  // 2 · Últimos 5 jogos anteriores ao do item — a consulta COMPARTILHADA com a
  //     materialização do feed (historico-na-linha.ts): card e detalhe nunca
  //     discordam sobre o que aconteceu nos últimos 5.
  const historico = await jogosRecentes(db, item.jogadorId, jogo.dataHoraUtc, opcoes.blocos ?? 5)

  const minutosRecentes = historico[0]?.minutos != null ? Number(historico[0].minutos) : null
  const minutosLidos = historico
    .map((h) => (h.minutos === null ? Number.NaN : Number(h.minutos)))
    .filter((m) => Number.isFinite(m))
  const minutosMedia =
    minutosLidos.length === 0 ? null : minutosLidos.reduce((a, b) => a + b, 0) / minutosLidos.length

  // 3 · Time do jogador vem de `niveis` (versão ativa) — a curadoria do CJ,
  //     nunca `jogadores.time_id`. Os elencos são projetados: usar o time real
  //     do provedor diria que o jogador enfrentou um adversário contra o qual
  //     ele nunca jogou nesta plataforma.
  const [versaoAtiva] = await db
    .select()
    .from(niveisVersao)
    .where(eq(niveisVersao.ativa, true))
    .limit(1)
  const [vinculo] = versaoAtiva
    ? await db
        .select()
        .from(niveis)
        .where(
          and(
            eq(niveis.niveisVersaoId, versaoAtiva.id),
            eq(niveis.jogadorId, item.jogadorId),
            eq(niveis.atributo, item.atributo),
          ),
        )
        .limit(1)
    : []
  const timeDoJogadorId = vinculo?.timeId ?? null

  // Quem está FORA desta partida — lido UMA vez: a seção "O jogo" mostra os
  // nomes e a OPD peneira deles o prefixo da hierarquia que abre a regra.
  //
  // Ordenada pelo nome de apresentação após resolver identidades em lote.
  const foraCanonicos = await db
    .select({ jogadorId: lesoesEscalacao.jogadorId, nome: jogadores.nomeCompleto })
    .from(lesoesEscalacao)
    .innerJoin(jogadores, eq(jogadores.id, lesoesEscalacao.jogadorId))
    .where(and(eq(lesoesEscalacao.jogoId, item.jogoId), eq(lesoesEscalacao.status, 'FORA')))
  const identidadesFora = await identidadesDeApresentacao(
    db,
    foraCanonicos.map((f) => f.jogadorId),
  )
  const foraDaPartida = foraCanonicos
    .map((f) => ({ ...f, nome: identidadesFora.get(f.jogadorId)?.nome ?? f.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.jogadorId.localeCompare(b.jogadorId))

  const idsTimes = new Set<string>()
  for (const h of historico) {
    idsTimes.add(h.timeCasaId)
    idsTimes.add(h.timeVisitanteId)
  }
  idsTimes.add(jogo.timeCasaId)
  idsTimes.add(jogo.timeVisitanteId)
  const listaTimes =
    idsTimes.size > 0
      ? await db
          .select()
          .from(times)
          .where(inArray(times.id, [...idsTimes]))
      : []
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  const emCasa = timeDoJogadorId === jogo.timeCasaId
  const jogoDoApito: JogoDoApito = {
    casaSigla: timePorId.get(jogo.timeCasaId)?.sigla ?? '—',
    visitanteSigla: timePorId.get(jogo.timeVisitanteId)?.sigla ?? '—',
    adversarioSigla: timePorId.get(emCasa ? jogo.timeVisitanteId : jogo.timeCasaId)?.sigla ?? '—',
    emCasa,
    dataHoraUtc: jogo.dataHoraUtc,
    desfalques: foraDaPartida.map((f) => f.nome),
  }

  // 4 · Blocos: valor conferido contra a LINHA do apito. Mais antigo primeiro
  //     na saída. Sem linha não há o que conferir — não é "0 de 5", é nada.
  //
  //     O alvo do 1º quarto NÃO entra como régua. Os valores do histórico são
  //     de jogo INTEIRO e o alvo é de doze minutos: conferir um contra o outro
  //     produziria um "bateu 8 de 8" que ninguém mediu, e nem a spec (§4.3)
  //     nem o ruleset definem essa conferência (CLAUDE.md, regra 3).
  const linhaConferida = item.linha
  const blocosRecenteParaAntigo: BlocoJogo[] = historico.map((h) => {
    const valor = valorDoJogo(h, item.atributo)
    const adversarioId = timeDoJogadorId === h.timeCasaId ? h.timeVisitanteId : h.timeCasaId
    return {
      adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
      valor,
      bateu: linhaConferida !== null && valor >= linhaConferida,
    }
  })
  const blocos = [...blocosRecenteParaAntigo].reverse()

  const bateu =
    linhaConferida === null
      ? { acertos: 0, total: 0 }
      : {
          acertos: blocosRecenteParaAntigo.filter((b) => b.bateu).length,
          total: blocosRecenteParaAntigo.length,
        }

  // 5 · O porquê — nomeia a regra que disparou, não uma frase genérica. Os
  //     FATOS são levantados uma vez; deles saem o texto plano (o de sempre) e
  //     os fatores estruturados da identidade 04.
  const { inicio: inicioDaRodada } = intervaloDoDia(
    dataDeReferencia(jogo.dataHoraUtc, ruleset.rodada.fuso),
    ruleset.rodada.fuso,
  )
  const fatos = await fatosDoPorque(db, ruleset, item, mediaTemporada, inicioDaRodada, {
    timeDoJogadorId,
    niveisVersaoId: versaoAtiva?.id ?? null,
    foraDaPartida: new Set(foraDaPartida.map((f) => f.jogadorId)),
  })
  const porQueEntrou = textoPlano(item, fatos)
  const fatores = montarFatores(item, fatos)

  return {
    mediaTemporada,
    bateu,
    linhaConferida,
    minutosRecentes,
    minutosMedia,
    jogo: jogoDoApito,
    blocos,
    porQueEntrou,
    fatores,
  }
}

type FatosDoPorque = {
  /** Oscilação: quantos jogos seguidos abaixo, o limiar, a média e os valores desses jogos. */
  oscilacao: {
    n: number
    limiar: number
    media: number
    valores: number[]
    rotuloMedia: string
    nivelMinimo: number
  } | null
  /** OPD: o prefixo da hierarquia que está fora, do topo para baixo. */
  opd: { nomes: string[] } | null
}

async function fatosDoPorque(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
  mediaTemporada: number | null,
  inicioDaRodada: Date,
  /** Time e versão de níveis do apitado — a OPD só existe dentro deles. */
  contexto: {
    timeDoJogadorId: string | null
    niveisVersaoId: string | null
    /** Quem está FORA desta partida, já lido pelo chamador. */
    foraDaPartida: Set<string>
  },
): Promise<FatosDoPorque> {
  const fatos: FatosDoPorque = { oscilacao: null, opd: null }

  if (item.metodo === 'OSCILACAO') {
    // O recorte de 5/10 jogos pertence à forma exibida. A justificativa lê o
    // histórico anterior à rodada, como montarFatos, para que DNPs não
    // consumam a janela e apaguem jogos que sustentaram a sequência.
    const [historico, chavesEstrategia] = await Promise.all([
      db
        .select({
          pontos: estatisticasJogo.pontos,
          rebotesTotal: estatisticasJogo.rebotesTotal,
          assistencias: estatisticasJogo.assistencias,
          jogou: entrouEmQuadraSql('estatisticas_jogo').mapWith(Boolean),
        })
        .from(estatisticasJogo)
        .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
        .where(
          and(
            eq(estatisticasJogo.jogadorId, item.jogadorId),
            lt(jogos.dataHoraUtc, inicioDaRodada),
          ),
        )
        .orderBy(desc(jogos.dataHoraUtc)),
      chavesEstrategiaConfirmadas(db, [item.jogadorId]),
    ])
    const delta = deltaOscilacao(
      item.nivelJogador,
      item.atributo,
      [item.jogadorId, ...(chavesEstrategia.get(item.jogadorId) ?? [])],
      ruleset,
    )
    if (mediaTemporada !== null && delta !== undefined) {
      const limiar =
        ruleset.oscilacao.criterio_sequencia === 'limiar' ? mediaTemporada - delta : mediaTemporada
      const valores: number[] = []
      for (const h of historico) {
        if (!h.jogou) {
          if (ruleset.oscilacao.dnp === 'ignora') continue
          break
        }
        const v = valorDoJogo(h, item.atributo)
        const abaixo = ruleset.oscilacao.criterio_sequencia === 'limiar' ? v <= limiar : v < limiar
        if (!abaixo) break
        valores.push(v)
        if (valores.length >= (NIVEIS_APITO.at(-1) ?? 1)) break
      }
      const rotuloMedia =
        ruleset.media.janela === 'temporada'
          ? 'Média da temporada'
          : `Média dos últimos ${ruleset.media.janela === 'ultimos_5' ? 5 : 10} jogos`
      fatos.oscilacao = {
        n: valores.length,
        limiar,
        media: mediaTemporada,
        valores,
        rotuloMedia,
        nivelMinimo: nivelMinimoOscilacao(item.nivelJogador, item.atributo, ruleset),
      }
    }
  }

  if (
    item.metodo === 'OPD' &&
    contexto.timeDoJogadorId !== null &&
    contexto.niveisVersaoId !== null
  ) {
    // A OPD trabalha sobre a hierarquia do PRÓPRIO time do apitado, e só o
    // PREFIXO contíguo de desfalques a partir do topo abre a regra (motor/
    // lista-secreta/opd.ts). Listar todo mundo que está FORA da partida
    // nomearia jogadores do adversário e desfalques que não participam de
    // nada — o assinante leria uma justificativa que não é a dele.
    const hierarquia = await db
      .select({ jogadorId: niveis.jogadorId, nome: jogadores.nomeCompleto })
      .from(niveis)
      .innerJoin(jogadores, eq(niveis.jogadorId, jogadores.id))
      .where(
        and(
          eq(niveis.niveisVersaoId, contexto.niveisVersaoId),
          eq(niveis.timeId, contexto.timeDoJogadorId),
          eq(niveis.atributo, item.atributo),
        ),
      )
      .orderBy(asc(niveis.posicaoHierarquia))

    const desfalcados = contexto.foraDaPartida
    const identidades = await identidadesDeApresentacao(
      db,
      hierarquia.map((j) => j.jogadorId),
    )

    // Mesmo laço do motor: para no primeiro que NÃO está fora.
    const nomes: string[] = []
    for (const j of hierarquia) {
      if (!desfalcados.has(j.jogadorId)) break
      nomes.push(identidades.get(j.jogadorId)?.nome ?? j.nome)
    }
    fatos.opd = { nomes }
  }

  return fatos
}

/** O texto plano que a tela e o chat já leem — inalterado na forma. */
function textoPlano(item: ItemFeed, fatos: FatosDoPorque): string[] {
  if (item.metodo === 'OSCILACAO') {
    if (!fatos.oscilacao) return []
    const { n, limiar, media, rotuloMedia } = fatos.oscilacao
    const unidade = UNIDADE[item.atributo]
    return [
      `◆ ${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}.`,
      `${rotuloMedia}: ${fmt(media)}.`,
    ]
  }
  if (item.metodo === 'OPD') {
    if (!fatos.opd || fatos.opd.nomes.length === 0) return []
    return [
      `◆ ${fatos.opd.nomes.join(', ')} fora da partida — oportunidade nível ${item.opdOrigemNivel} pela hierarquia do time.`,
    ]
  }
  // metodo null = Fire Live: não nasce de oscilação nem de OPD.
  return [`◆ Cruzou o alvo do 1º quarto (${item.alvo1Q}).`]
}

/**
 * Os fatores da identidade 04, em ordem fixa. Só fatos, nunca pesos: nada de
 * bônus de nível, de "+N do turbo" nem de percentual — o % já está no card e
 * o ruleset é do CJ.
 */
function montarFatores(item: ItemFeed, fatos: FatosDoPorque): Fator[] {
  const unidade = UNIDADE[item.atributo]
  const fatores: Fator[] = [
    {
      chave: 'NIVEL',
      titulo: 'Nível',
      texto: `${ROTULO_NIVEL[item.nivelJogador]} em ${unidade} na lista do CJ.`,
      destaque: ROTULO_NIVEL[item.nivelJogador],
    },
  ]

  if (item.metodo === 'OSCILACAO' && fatos.oscilacao) {
    const { n, limiar, media, valores, rotuloMedia } = fatos.oscilacao
    const lista = valores.map((v) => String(v)).join(', ')
    fatores.push({
      chave: 'OSCILACAO',
      titulo: 'Oscilação',
      texto:
        n === 0
          ? `${rotuloMedia}: ${fmt(media)} ${unidade}.`
          : `${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}: ${lista}. ${rotuloMedia}: ${fmt(media)}.`,
      destaque:
        n === 0 ? rotuloMedia : `${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'}`,
    })
  }

  if (item.metodo === 'OPD' && fatos.opd && fatos.opd.nomes.length > 0) {
    const { nomes } = fatos.opd
    fatores.push({
      chave: 'OPD',
      titulo: 'Desfalque',
      texto: `${nomes.join(', ')} fora da partida — o topo da hierarquia do time abre volume de jogo para quem vem logo abaixo.`,
      destaque: nomes.join(', '),
    })
  }

  if (item.metodo === null && item.alvo1Q !== null) {
    fatores.push({
      chave: 'FIRE_LIVE',
      titulo: '1º quarto',
      texto: `Cruzou o alvo do 1º quarto: ${item.alvo1Q} ${unidade}.`,
      destaque: 'Cruzou o alvo do 1º quarto',
    })
  }

  if (item.modoFire) {
    fatores.push({
      chave: 'MODO_FIRE',
      titulo: 'Modo fire',
      texto:
        'Do bloco de topo do time e já na fatia da média que o ruleset define para o 1º quarto.',
      destaque: 'Do bloco de topo do time',
    })
  }

  if (item.turbo) {
    fatores.push({
      chave: 'TURBO',
      titulo: 'Turbo',
      texto:
        item.metodo === 'OPD'
          ? 'Oscilação e desfalque se reforçam no mesmo jogador — o destaque que atravessa os dois métodos.'
          : `Oscilação N${item.nivelApito} de ${ROTULO_NIVEL[item.nivelJogador]} — o nível do jogador e a sequência sustentam o turbo.`,
      destaque: item.metodo === 'OPD' ? 'Oscilação e desfalque' : `Oscilação N${item.nivelApito}`,
    })
  }

  fatores.push({
    chave: 'NIVEL_APITO',
    titulo: 'Nível do apito',
    texto: textoDoNivelDoApito(item, fatos),
    destaque: `N${item.nivelApito}`,
  })

  return fatores
}

function textoDoNivelDoApito(item: ItemFeed, fatos: FatosDoPorque): string {
  const n = `N${item.nivelApito}`
  if (item.metodo === 'OSCILACAO' && fatos.oscilacao) {
    const seguidos =
      fatos.oscilacao.n >= 3
        ? 'três ou mais jogos abaixo'
        : fatos.oscilacao.n === 2
          ? 'dois jogos abaixo'
          : 'um jogo abaixo'
    const cerca =
      fatos.oscilacao.nivelMinimo > 1
        ? ` ${ROTULO_NIVEL[item.nivelJogador]} começa em N${fatos.oscilacao.nivelMinimo} neste atributo.`
        : ''
    return `${n} — ${seguidos}.${cerca}`
  }
  if (item.metodo === 'OPD') {
    return `${n} — pela posição do desfalque na hierarquia do time.`
  }
  return `${n} — o sinal do 1º quarto.`
}
