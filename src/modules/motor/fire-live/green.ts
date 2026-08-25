import { marcosDoNivel } from '../atributos'
import type { Ruleset } from '../ruleset/schema'
import type { Atributo, Nivel } from '../tipos'

/**
 * GREEN — o jogador bateu a marca.
 *
 * Devolve TODOS os marcos já atingidos, não apenas o último cruzado. Isso é
 * deliberado: quem decide o que é novidade é a UNIQUE da tabela `greens`, não
 * esta função. A mesma mecânica dos apitos (CLAUDE.md, regra 5).
 *
 * A consequência é a propriedade que o replay exige: reprocessar um jogo
 * inteiro recalcula todos os marcos, o banco rejeita todos, e ZERO push sai.
 * Se a função devolvesse "o que mudou desde a última leitura", o replay
 * dependeria de o estado anterior estar correto — e um estado perdido viraria
 * push duplicado no celular do assinante.
 *
 * Os marcos são POR ATRIBUTO. Pontos usa `push.marcos_green` — homologado, com
 * os valores do cliente. Rebotes e assistências leem `por_atributo`, hoje
 * preenchido com números de DEMONSTRAÇÃO. Atributo sem marcos devolve lista
 * vazia, e nenhum push sai — que era o comportamento anterior desta função.
 */
export function marcosAtingidos(
  nivel: Nivel | null,
  atributo: Atributo,
  valor: number,
  ruleset: Ruleset,
): number[] {
  if (nivel === null) return []

  return marcosDoNivel(nivel, atributo, ruleset)
    .filter((marco) => valor >= marco)
    .sort((a, b) => a - b)
}
