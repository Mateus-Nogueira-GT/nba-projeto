import type { ReactNode } from 'react'
import Link from 'next/link'

import { semantico } from '@/design-system/tokens/semantico'

export function MolduraConta({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: semantico.fundo,
        color: semantico.textoPrimario,
        padding: '40px 18px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          ← IA da NBA
        </Link>
        <header style={{ margin: '20px 0' }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{titulo}</h1>
          {descricao && (
            <p style={{ margin: '8px 0 0', color: semantico.textoSecundario, lineHeight: 1.55 }}>
              {descricao}
            </p>
          )}
        </header>
        <section
          style={{
            border: `1px solid ${semantico.divisor}`,
            background: semantico.superficie,
            borderRadius: 16,
            padding: 20,
          }}
        >
          {children}
        </section>
      </div>
    </main>
  )
}
