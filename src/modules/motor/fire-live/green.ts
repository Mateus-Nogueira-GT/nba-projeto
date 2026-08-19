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
 * SÓ PONTOS. `push.marcos_green` é indexado por nível, não por atributo, e os
 * valores (25, 30, 35…) são totais de pontos. Não existe marco de rebote ou
 * assistência definido pelo cliente, e inventar um seria violar a regra 3.
 * Quando o Mestre da NBA enviar os níveis de rebotes/assistências, o ruleset
 * ganha a chave por atributo e esta função passa a consultá-la.
 */
export function marcosAtingidos(
  nivel: Nivel | null,
  atributo: Atributo,
  valor: number,
  ruleset: Ruleset,
): number[] {
  if (nivel === null) return []
  if (atributo !== 'PONTOS') return []

  return (ruleset.push.marcos_green[nivel] ?? [])
    .filter((marco) => valor >= marco)
    .sort((a, b) => a - b)
}
