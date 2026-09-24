import type { ReactNode } from 'react'
import { Logo } from '@/ui/Logo'
import s from './CartaoPublico.module.css'

/** Telas públicas curtas (oferta, oferta indisponível, sem conexão): um cartão centrado. */
export function CartaoPublico({
  etiqueta,
  titulo,
  children,
}: {
  etiqueta?: string
  titulo: string
  children: ReactNode
}) {
  return (
    <main className={s.tela}>
      <section className={s.cartao} aria-labelledby="titulo-publico">
        <Logo largura={120} />
        {etiqueta && <p className={s.etiqueta}>{etiqueta}</p>}
        <h1 id="titulo-publico" className={s.titulo}>
          {titulo}
        </h1>
        {children}
      </section>
    </main>
  )
}
