import type { ReactNode } from 'react'
import Link from 'next/link'

import { MarcaNip } from '@/design-system/componentes/MarcaNip'
import estilos from './PainelComercial.module.css'

export function ShellComercial({
  area,
  nome,
  children,
}: {
  area: 'afiliado' | 'admin'
  nome: string
  children: ReactNode
}) {
  return (
    <div className={estilos.pagina}>
      <aside className={estilos.lateral}>
        <MarcaNip />
        <nav aria-label="Navegação comercial">
          <a className={estilos.ativo} href={area === 'admin' ? '/admin/afiliados' : '/afiliados'}>
            Dashboard
          </a>
          <a href="#links">Links</a>
          <a href="#resultados">Resultados</a>
          {area === 'admin' ? <a href="#operacao">Operação</a> : <a href="#repasses">Repasses</a>}
          <Link href="/">Produto NBA</Link>
        </nav>
        <div className={estilos.rodape}>
          {nome}
          <br />
          Área {area === 'admin' ? 'administrativa' : 'de parceiro'}
        </div>
      </aside>
      <div className={estilos.conteudo}>{children}</div>
    </div>
  )
}
