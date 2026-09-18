/**
 * AS CINCO SEÇÕES DO PRODUTO — uma lista só, lida pelas DUAS barras.
 *
 * A barra inferior (celular) e a barra do topo (desktop, identidade 05) mostram
 * exatamente as mesmas abas, na mesma ordem, com os mesmos rótulos. Antes a
 * lista morava dentro da `BarraInferior`; com duas barras, deixá-la lá faria a
 * segunda copiá-la — e duas cópias divergem na primeira vez que alguém renomear
 * uma aba.
 *
 * Cinco é o teto de um polegar em tela de celular: Estatísticas e a tela
 * teórica ficam a um toque de distância dentro de "Perfil".
 */
export type Aba = 'lista' | 'fire-live' | 'stats' | 'gestao' | 'conta'

export const ABAS = [
  { id: 'lista', href: '/', rotulo: 'ENTRADAS' },
  { id: 'fire-live', href: '/fire-live', rotulo: 'AO VIVO' },
  { id: 'stats', href: '/estatisticas', rotulo: 'STATS' },
  { id: 'gestao', href: '/gestao', rotulo: 'GESTÃO' },
  { id: 'conta', href: '/conta', rotulo: 'PERFIL' },
] as const satisfies readonly { id: Aba; href: string; rotulo: string }[]
