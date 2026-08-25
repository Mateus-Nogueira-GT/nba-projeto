import type { ReactNode } from 'react'

import { semantico } from '../tokens/semantico'

export type ChipFiltroProps = {
  ativo: boolean
  href: string
  children?: ReactNode
}

/**
 * Pílula de filtro — identidade 03. Ativo = preenchida com o acento laranja
 * (cor de INTERFACE, não canal de estratégia); inativo = contorno discreto.
 * É um link: os filtros das telas vivem na URL, sem estado de cliente.
 */
export function ChipFiltro({ ativo, href, children }: ChipFiltroProps) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontFamily: semantico.fonteRotulo,
        fontSize: 11,
        fontWeight: ativo ? 700 : 600,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        textDecoration: 'none',
        background: ativo ? semantico.acento : 'transparent',
        color: ativo ? semantico.textoSobreCor : semantico.textoSecundario,
        border: `1px solid ${ativo ? semantico.acento : semantico.divisor}`,
      }}
    >
      {children}
    </a>
  )
}
