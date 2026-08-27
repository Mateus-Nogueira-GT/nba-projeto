/**
 * ROTAS DA ABA DE ESTATÍSTICAS — fonte única.
 *
 * A aba tem DOIS caminhos de entrada (docs/00-visao.md):
 *
 *   1. pelo menu   -> busca por jogador ou time
 *   2. pelo card   -> nome do jogador dentro de qualquer entrada sugerida
 *
 * O requisito é que os dois cheguem na MESMA tela. Se cada ponto de origem
 * montasse a URL por conta própria, "a mesma tela" seria uma coincidência que
 * dura até alguém mudar um prefixo. Com uma função só, é uma propriedade — e
 * um teste consegue afirmar que os dois caminhos coincidem em vez de conferir
 * duas strings escritas à mão.
 */

export const BASE_ESTATISTICAS = '/estatisticas'

export function rotaDoJogador(jogadorId: string): string {
  return `${BASE_ESTATISTICAS}/jogador/${encodeURIComponent(jogadorId)}`
}

export function rotaDoTime(timeId: string): string {
  return `${BASE_ESTATISTICAS}/time/${encodeURIComponent(timeId)}`
}

export function rotaDoJogo(jogoId: string): string {
  return `${BASE_ESTATISTICAS}/jogo/${encodeURIComponent(jogoId)}`
}

export function rotaDaBusca(termo: string): string {
  return `${BASE_ESTATISTICAS}?q=${encodeURIComponent(termo)}`
}
