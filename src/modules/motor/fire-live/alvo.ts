import { arredondar } from '../arredondamento'
import type { Ruleset } from '../ruleset/schema'
import type { Atributo, Nivel } from '../tipos'

export type ParametrosAlvo = {
  mediaPorJogo: number
  atributo: Atributo
  /** null = jogador NÃO classificado pela plataforma. */
  nivel: Nivel | null
}

/**
 * Alvo do 1º quarto. Devolve null quando a trava do atributo reprova o alvo.
 *
 * Atenção à assimetria das travas, que vem do documento do CJ:
 *   pontos  — "só vale se o alvo atingir o marco >= 4"  -> alvo >= minimo
 *   rebotes — "só vale se o alvo PASSAR de 2 rebotes"   -> alvo >  minimo
 */
export function alvoFireLive(p: ParametrosAlvo, ruleset: Ruleset): number | null {
  const fl = ruleset.fire_live
  const porQuarto = p.mediaPorJogo / fl.quartos_por_jogo

  if (p.atributo === 'PONTOS') {
    // Em pontos, jogador fora da lista também entra — com multiplicador maior.
    const multiplicador =
      p.nivel === null
        ? fl.multiplicadores.pontos_nao_classificado
        : p.nivel === 'RANDOLA'
          ? fl.multiplicadores.pontos_randola
          : fl.multiplicadores.pontos_classificado

    const alvo = arredondar(porQuarto * multiplicador, ruleset)
    if (p.nivel === null) return alvo
    return alvo >= fl.travas.pontos_alvo_minimo ? alvo : null
  }

  // Rebotes e assistências só contam para jogador classificado pela plataforma.
  if (p.nivel === null) return null

  if (p.atributo === 'ASSISTENCIAS') {
    if (p.mediaPorJogo < fl.assistencias.media_minima) return null
    return arredondar(porQuarto + fl.assistencias.valor, ruleset)
  }

  const alvo = arredondar(porQuarto * fl.multiplicadores.rebotes, ruleset)
  return alvo > fl.travas.rebotes_alvo_minimo ? alvo : null
}
