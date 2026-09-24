'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

/**
 * A linha inteira é o link para o detalhe do apito. Marca-se como atual quando
 * o painel aberto é o dela — o olho não perde de onde veio.
 */
export function LinkDaLinha({
  jogadorId,
  atributo,
  rotulo,
  className,
  style,
  destaque = false,
  children,
}: {
  jogadorId: string
  atributo: string
  rotulo: string
  className: string
  style?: CSSProperties
  /** Turbo: a única linha que ganha tarja e brilho — o destaque do dia. */
  destaque?: boolean
  children: ReactNode
}) {
  const caminho = usePathname()
  const busca = useSearchParams()
  const href = `/apito/${jogadorId}?atributo=${atributo}`
  const atual = caminho === `/apito/${jogadorId}` && busca.get('atributo') === atributo
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      style={style}
      aria-label={rotulo}
      aria-current={atual ? 'true' : undefined}
      data-destaque={destaque || undefined}
    >
      {children}
    </Link>
  )
}
