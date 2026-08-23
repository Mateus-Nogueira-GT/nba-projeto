import { inArray } from 'drizzle-orm'

import { estatisticasJogo } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { montarFatos } from '../../dominio/fatos'
import { avaliar } from '../../motor'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Apito, Atributo, Metodo, Nivel } from '../../motor/tipos'

/**
 * BACKTEST — a entrega comercial que justificou o motor puro (ADR-0002).
 *
 * Reexecuta o motor sobre fatos de datas passadas com um ruleset alternativo
 * e mede o que TERIA sido apitado. NADA é gravado em `apitos`: backtest não
 * polui o histórico real — é a distinção mais importante da spec 07.
 *
 * Isto NÃO é sugestão de aposta nem promessa de retorno. É medição do
 * comportamento de uma regra sobre dado histórico, para o CJ calibrar a
 * estratégia (P12: nada aqui é "probabilidade").
 */
export type PeriodoBacktest = { de: string; ate: string }

export type ResultadoBacktest = {
  ruleset: string
  periodo: PeriodoBacktest
  apitos: number
  porNivel: Record<Nivel, number>
  porMetodo: Record<Metodo, number>
  /** Apitos cuja linha o jogador de fato bateu naquele jogo. */
  acertos: number
  /** Apitos com box score do jogo — o TAMANHO DA AMOSTRA de `acertos`. */
  classificaveis: number
  /** Sem box score do jogo, o apito não é classificável. Nunca conta como erro. */
  indeterminados: number
  /** Quantos apitos cada jogador recebeu — alimenta o comparativo. */
  porJogador: Record<string, number>
}

/** Datas ISO (YYYY-MM-DD) do período, inclusivas. Puro — sem relógio. */
export function datasDoPeriodo(periodo: PeriodoBacktest): string[] {
  const datas: string[] = []
  const fim = new Date(`${periodo.ate}T00:00:00.000Z`).getTime()
  let atual = new Date(`${periodo.de}T00:00:00.000Z`).getTime()
  while (atual <= fim) {
    datas.push(new Date(atual).toISOString().slice(0, 10))
    atual += 24 * 60 * 60_000
  }
  return datas
}

function valorDoBox(
  box: { pontos: number; rebotesTotal: number; assistencias: number },
  atributo: Atributo,
): number {
  switch (atributo) {
    case 'PONTOS':
      return box.pontos
    case 'REBOTES':
      return box.rebotesTotal
    case 'ASSISTENCIAS':
      return box.assistencias
  }
}

export async function executarBacktest(
  db: Db,
  ruleset: Ruleset,
  periodo: PeriodoBacktest,
): Promise<ResultadoBacktest> {
  const configTemporada = {
    mesInicio: ruleset.temporada.mes_inicio,
    formato: ruleset.temporada.formato,
  }

  // O laço é o mesmo do job diário: para cada data, montarFatos e avaliar.
  const calculados: Apito[] = []
  for (const data of datasDoPeriodo(periodo)) {
    const fatos = await montarFatos(db, data, configTemporada)
    if (fatos.times.length === 0) continue
    // O Fire Live exige replay de quartos ao vivo — fora do escopo da parte A.
    calculados.push(...avaliar(fatos, ruleset).filter((a) => a.estrategia === 'LISTA_SECRETA'))
  }

  // Classificação contra o box score REAL de cada jogo, em lote.
  const idsJogo = [...new Set(calculados.map((a) => a.jogoId))]
  const boxScores =
    idsJogo.length > 0
      ? await db.select().from(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, idsJogo))
      : []
  const boxPorChave = new Map(boxScores.map((b) => [`${b.jogoId}|${b.jogadorId}`, b] as const))

  const porNivel = { MVP: 0, ALL_STAR: 0, SUPORTE: 0, RANDOLA: 0 } satisfies Record<Nivel, number>
  const porMetodo = { OSCILACAO: 0, OPD: 0 } satisfies Record<Metodo, number>
  const porJogador: Record<string, number> = {}
  let acertos = 0
  let classificaveis = 0
  let indeterminados = 0

  for (const apito of calculados) {
    porNivel[apito.nivelJogador] += 1
    if (apito.metodo !== null) porMetodo[apito.metodo] += 1
    porJogador[apito.jogadorId] = (porJogador[apito.jogadorId] ?? 0) + 1

    const box = boxPorChave.get(`${apito.jogoId}|${apito.jogadorId}`)
    if (box === undefined || apito.linha === null) {
      indeterminados += 1
      continue
    }
    classificaveis += 1
    if (valorDoBox(box, apito.atributo) >= apito.linha) acertos += 1
  }

  return {
    ruleset: `v${ruleset.version}`,
    periodo,
    apitos: calculados.length,
    porNivel,
    porMetodo,
    acertos,
    classificaveis,
    indeterminados,
    porJogador,
  }
}

// ---------------------------------------------------------------------------

export type Diferenca = {
  apitosDelta: number
  acertosDelta: number
  /** Jogadores apitados só no resultado B. */
  entraram: string[]
  /** Jogadores apitados só no resultado A. */
  sairam: string[]
  /** Tamanho da amostra de cada lado — número sem amostra tem cara de conclusão. */
  amostra: { a: number; b: number }
}

/** O valor real do backtest está na diferença entre dois rulesets. */
export function comparar(a: ResultadoBacktest, b: ResultadoBacktest): Diferenca {
  const jogadoresA = new Set(Object.keys(a.porJogador))
  const jogadoresB = new Set(Object.keys(b.porJogador))
  return {
    apitosDelta: b.apitos - a.apitos,
    acertosDelta: b.acertos - a.acertos,
    entraram: [...jogadoresB].filter((j) => !jogadoresA.has(j)).sort(),
    sairam: [...jogadoresA].filter((j) => !jogadoresB.has(j)).sort(),
    amostra: { a: a.classificaveis, b: b.classificaveis },
  }
}
