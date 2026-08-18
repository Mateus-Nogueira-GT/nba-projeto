import type { Ruleset } from './ruleset/schema'

/** Guarda contra erro de ponto flutuante: 5,4999999 que deveria ser 5,5. */
const EPSILON = 1e-9

/**
 * Política deduzida dos 4 exemplos numéricos do documento do CJ — só ela
 * satisfaz os quatro ao mesmo tempo: precisão cheia no cálculo, arredonda
 * meio-pra-cima apenas no final.
 *
 * A política em si vem do ruleset; aqui mora só a técnica.
 */
export function arredondar(valor: number, ruleset: Ruleset): number {
  switch (ruleset.arredondamento.regra) {
    case 'meio_para_cima':
      return Math.floor(valor + 0.5 + EPSILON)
  }
}
