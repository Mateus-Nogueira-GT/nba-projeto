import Link from 'next/link'
import type { ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

/**
 * CHIP — filtro em forma de pílula.
 *
 * Ativo, ele é PREENCHIDO no acento com texto branco; inativo, contorno neutro
 * e texto de apoio. O `aria-current="page"` marca o estado para leitor de tela,
 * redundante com a cor — que, sozinha, nunca é canal neste projeto.
 *
 * Mora em arquivo próprio desde a identidade 05: além do cabeçalho da tela, ele
 * é usado pela folha de filtros, pelos menus de filtro do desktop e pela
 * galeria do admin, e importar tudo isso de `CabecalhoTela` já dizia que ele
 * não era mais parte do cabeçalho.
 */
export function Chip({
  href,
  ativo,
  children,
}: {
  href: string
  ativo: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        fontWeight: ativo ? 700 : 600,
        color: ativo ? semantico.textoSobreAcento : semantico.textoSecundario,
        // Ativo: a borda some DENTRO do preenchimento — o acento nunca é
        // contorno (identidade 05). Transparente segura a altura da pílula.
        border: `1.5px solid ${ativo ? 'transparent' : semantico.divisor}`,
        background: ativo ? semantico.acento : 'transparent',
      }}
    >
      {children}
    </Link>
  )
}
