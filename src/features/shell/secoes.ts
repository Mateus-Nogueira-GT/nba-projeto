/**
 * As seções do produto — uma lista só, lida pela sidebar (desktop), pela barra
 * inferior e pela folha "Mais" (celular). Duas cópias divergem na primeira vez
 * que alguém renomeia uma seção.
 */
export type Secao =
  | 'entradas'
  | 'ao-vivo'
  | 'estatisticas'
  | 'gestao'
  | 'resultados'
  | 'metodologia'
  | 'perfil'
  | 'admin'

export type ItemDeNavegacao = {
  id: Secao
  rotulo: string
  /** Rótulo da barra inferior, que tem ~64px por item. */
  rotuloCurto: string
  href: string
  /** Onde o item mora: menu principal ou rodapé da sidebar. */
  grupo: 'principal' | 'rodape'
  /** Está na barra inferior do celular? O resto vai para "Mais". */
  naBarra: boolean
  soAdmin?: boolean
}

export const NAVEGACAO: readonly ItemDeNavegacao[] = [
  { id: 'entradas', rotulo: 'Entradas', rotuloCurto: 'Entradas', href: '/', grupo: 'principal', naBarra: true },
  { id: 'ao-vivo', rotulo: 'Ao Vivo', rotuloCurto: 'Ao Vivo', href: '/fire-live', grupo: 'principal', naBarra: true },
  { id: 'estatisticas', rotulo: 'Estatísticas', rotuloCurto: 'Stats', href: '/estatisticas', grupo: 'principal', naBarra: true },
  { id: 'gestao', rotulo: 'Gestão de banca', rotuloCurto: 'Gestão', href: '/gestao', grupo: 'principal', naBarra: true },
  { id: 'resultados', rotulo: 'Resultados', rotuloCurto: 'Resultados', href: '/resultados', grupo: 'principal', naBarra: false },
  { id: 'metodologia', rotulo: 'Metodologia', rotuloCurto: 'Metodologia', href: '/como-funciona', grupo: 'rodape', naBarra: false },
  { id: 'perfil', rotulo: 'Perfil', rotuloCurto: 'Perfil', href: '/conta', grupo: 'rodape', naBarra: false },
  { id: 'admin', rotulo: 'Admin', rotuloCurto: 'Admin', href: '/admin', grupo: 'rodape', naBarra: false, soAdmin: true },
]

/** Qual seção um caminho pertence. `/apito/...` é detalhe da lista de Entradas. */
export function secaoDoCaminho(caminho: string): Secao | null {
  if (caminho === '/' || caminho.startsWith('/apito')) return 'entradas'
  const item = NAVEGACAO.find((i) => i.href !== '/' && caminho.startsWith(i.href))
  return item?.id ?? null
}

export const COOKIE_SIDEBAR = 'nip-sidebar'
