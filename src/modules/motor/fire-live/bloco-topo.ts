import type { Ruleset } from '../ruleset/schema'
import type { Atributo, JogadorFato, JogoFato, TimeFato } from '../tipos'

/**
 * BLOCO DE TOPO — ver ADR-0006.
 *
 * Unifica as respostas P6 e P7 numa regra só. Verificação que sustenta:
 * em todos os times que têm MVP, o MVP é o jogador nº 1. A única anomalia é
 * Philadelphia, com MVP no nº 1 e no nº 2, e o cliente confirmou que os dois
 * precisam estar fora.
 *
 *   time COM MVP -> todos os jogadores nível MVP
 *   time SEM MVP -> o jogador nº 1 da hierarquia  (vale para 15 dos 30 times)
 */
export function blocoDeTopo(time: TimeFato, atributo: Atributo): JogadorFato[] {
  const hierarquia = [...time.jogadores].sort(
    (a, b) => a.posicaoHierarquia - b.posicaoHierarquia,
  )

  const mvps = hierarquia.filter((j) => j.classificacoes[atributo] === 'MVP')
  if (mvps.length > 0) return mvps

  const primeiro = hierarquia[0]
  return primeiro ? [primeiro] : []
}

/**
 * Suporte e Randola só apitam em pontos quando o bloco de topo está
 * INTEIRAMENTE fora da partida. Critério DNP (P5): não exige rastrear
 * substituição em tempo real.
 */
export function topoLiberado(
  time: TimeFato,
  jogo: JogoFato,
  atributo: Atributo,
  ruleset: Ruleset,
): boolean {
  const presenca = ruleset.fire_live.presenca_topo

  if (presenca.times_isentos.includes(time.sigla)) return true

  const bloco = blocoDeTopo(time, atributo)
  if (bloco.length === 0) return true

  return bloco.every((j) => jogo.escalacao[j.id] === 'FORA')
}
