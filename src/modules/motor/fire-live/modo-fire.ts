import type { Ruleset } from '../ruleset/schema'
import type { Nivel } from '../tipos'

/**
 * MVP e All Star que atingem o percentual da média total já no 1º quarto
 * entram em modo fire — tendência de jogo de pontuação muito alta.
 */
export function emModoFire(
  valorNoQuarto: number,
  mediaPorJogo: number,
  nivel: Nivel,
  ruleset: Ruleset,
): boolean {
  const mf = ruleset.fire_live.modo_fire
  if (!mf.aplica_a.includes(nivel)) return false
  return valorNoQuarto >= mediaPorJogo * mf.percentual_media
}
