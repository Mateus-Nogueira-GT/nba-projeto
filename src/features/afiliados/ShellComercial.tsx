import type { ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from '@/ui/Logo'
import s from './Comercial.module.css'

/**
 * Moldura da área do PARCEIRO — separada do app do assinante: o parceiro
 * acompanha links e repasses, não apitos. Tema escuro NIP (o painel antigo era
 * claro e roxo, fora da marca).
 */
export function ShellComercial({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className={s.pagina}>
      <aside className={s.lateral}>
        <Link href="/afiliados" aria-label="Área de parceiros NIP">
          <Logo largura={176} prioridade />
        </Link>
        <nav aria-label="Seções da área de parceiro" className={s.nav}>
          <a href="#visao-geral">Visão geral</a>
          <a href="#links">Links</a>
          <a href="#repasses">Repasses</a>
          <a href="#resultados">Resultados</a>
          <Link href="/" className={s.navProduto}>
            Produto NBA
          </Link>
        </nav>
        <p className={s.rodape}>
          <strong>{nome}</strong>
          <span>Área de parceiro</span>
        </p>
      </aside>
      <main className={s.conteudo} id="conteudo">
        {children}
      </main>
    </div>
  )
}
