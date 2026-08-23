import type { Ruleset } from '../ruleset/schema'

/**
 * Jogo decidido: titulares tendem a sair, e a entrada pode furar no fim.
 *
 * Quarto e diferença saem do ruleset (`avisos.blowout`) — trocar 25 por 20 é
 * um diff de YAML, não de código. O aviso é editorial (`local:
 * introducao_das_estrategias`): esta função diz QUANDO, nunca ONDE.
 *
 * Como o Fire Live só observa o 1º quarto e o blowout é do 4º, os dois nunca
 * se encontram — ver spec 06.
 */
export function emBlowout(
  jogo: { quartoAtual: number | null; placarCasa: number | null; placarVisitante: number | null },
  ruleset: Ruleset,
): boolean {
  const { quarto, diferenca_pontos } = ruleset.avisos.blowout
  if (jogo.quartoAtual !== quarto) return false
  if (jogo.placarCasa === null || jogo.placarVisitante === null) return false
  return Math.abs(jogo.placarCasa - jogo.placarVisitante) >= diferenca_pontos
}
