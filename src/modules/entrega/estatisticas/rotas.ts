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

export type ContextoEstatisticas = {
  periodo: '5' | '10' | 'temporada'
  atributo: 'PONTOS' | 'REBOTES' | 'ASSISTENCIAS'
  q?: string
  /**
   * A temporada ESCOLHIDA no seletor, crua: quem a lê valida contra as
   * disponíveis (`temporadaDaUrl`). Viaja para a tela seguinte como `q`.
   */
  temporada?: string
}

export function contextoEstatisticas(
  params: Record<string, string | string[] | undefined>,
): ContextoEstatisticas {
  return {
    periodo: params.periodo === '5' || params.periodo === 'temporada' ? params.periodo : '10',
    atributo:
      params.atributo === 'REBOTES' || params.atributo === 'ASSISTENCIAS'
        ? params.atributo
        : 'PONTOS',
    ...(typeof params.q === 'string' ? { q: params.q } : {}),
    ...(typeof params.temporada === 'string' ? { temporada: params.temporada } : {}),
  }
}

export function parametrosEstatisticas(contexto: ContextoEstatisticas): string {
  return new URLSearchParams(contexto).toString()
}

export function rotaDoJogador(jogadorId: string, contexto?: ContextoEstatisticas): string {
  const base = `${BASE_ESTATISTICAS}/jogador/${encodeURIComponent(jogadorId)}`
  return contexto ? `${base}?${parametrosEstatisticas(contexto)}` : base
}

export function rotaDoTime(timeId: string, temporada?: string): string {
  return comTemporada(`${BASE_ESTATISTICAS}/time/${encodeURIComponent(timeId)}`, temporada)
}

export function rotaDoJogo(jogoId: string): string {
  return `${BASE_ESTATISTICAS}/jogo/${encodeURIComponent(jogoId)}`
}

export function rotaDaBusca(termo: string): string {
  return `${BASE_ESTATISTICAS}?q=${encodeURIComponent(termo)}`
}

/**
 * `href` com `temporada=` quando ela foi ESCOLHIDA — e idêntico quando não:
 * a visita padrão não muda nenhuma URL da aba.
 */
export function comTemporada(href: string, temporada: string | undefined): string {
  if (temporada === undefined) return href
  return `${href}${href.includes('?') ? '&' : '?'}temporada=${encodeURIComponent(temporada)}`
}
