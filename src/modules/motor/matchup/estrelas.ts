import type { Ruleset } from '../ruleset/schema'
import type { Atributo, MetricaMatchup } from '../tipos'

export { METRICAS_MATCHUP } from '../tipos'
export type { MetricaMatchup } from '../tipos'

/** Posição do adversário na liga em cada métrica — 1 = maior valor; empate divide. */
export type PosicoesMatchup = Record<MetricaMatchup, number>

/**
 * O FATO do matchup, calculado fora do motor (entrega, `perfisDoDia`): as
 * posições do adversário até a véspera e quantos dias de competição houve.
 * `posicoes: null` = o adversário ainda não tem jogo encerrado na temporada.
 */
export type FatoMatchup = {
  posicoes: PosicoesMatchup | null
  diasDeCompeticao: number
}

/**
 * Um critério atendido E a posição que o fez valer. A posição viaja junto da
 * estrela (pente fino de 09/10, achado 9): o painel imprime "(3º)" do mesmo
 * fato que deu a estrela, nunca de um cache lido em outro instante.
 */
export type MotivoMatchup = { metrica: MetricaMatchup; posicao: number }

export type EstrelasMatchup = {
  estrelas: number
  /** Os critérios de estrela que o adversário atende, na ordem do ruleset. */
  motivos: MotivoMatchup[]
  /** Os critérios negativos atendidos — matchup negativo é aviso, não estrela. */
  aviso: MotivoMatchup[]
}

const NADA: EstrelasMatchup = { estrelas: 0, motivos: [], aviso: [] }

/**
 * MATCHUP EM ESTRELAS (CJ, 09/10). Função pura: as posições e os dias entram
 * como argumento. Não cria apito e não mexe no nível nem no % — só conta os
 * critérios que `matchup.criterios` declara para o atributo do apito.
 */
export function estrelasDoMatchup(
  fato: FatoMatchup,
  atributo: Atributo,
  ruleset: Ruleset,
): EstrelasMatchup {
  const regra = ruleset.matchup
  if (!regra.habilitado) return NADA
  if (fato.posicoes === null) return NADA
  if (fato.diasDeCompeticao < regra.liberar_apos_dias_de_competicao) return NADA
  const criterios = regra.criterios[atributo]
  if (!criterios) return NADA

  const posicoes = fato.posicoes
  const noTopo = (m: MetricaMatchup) => posicoes[m] >= 1 && posicoes[m] <= regra.corte_top
  const comPosicao = (m: MetricaMatchup): MotivoMatchup => ({ metrica: m, posicao: posicoes[m] })
  const motivos = criterios.estrelas.filter(noTopo).map(comPosicao)
  return {
    estrelas: motivos.length,
    motivos,
    aviso: criterios.aviso.filter(noTopo).map(comPosicao),
  }
}
