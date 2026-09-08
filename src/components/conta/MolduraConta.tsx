import type { ReactNode } from 'react'
import Link from 'next/link'

import { BarraInferior, type Aba } from '@/components/navegacao'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

export function MolduraConta({
  titulo,
  descricao,
  aba = null,
  children,
}: {
  titulo: string
  descricao?: string
  /**
   * Aba do rodapé. `null` nas telas de entrada e cadastro: quem ainda não fez
   * login não tem para onde navegar, e uma barra com quatro destinos que
   * redirecionam de volta para o login é ruído.
   */
  aba?: Aba | null
  children: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: componente.fundoTela,
        color: semantico.textoPrimario,
        padding: aba === null ? '40px 18px' : '40px 18px 96px',
        fontFamily: semantico.fonteCorpo,
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          ← NIP
        </Link>
        <header style={{ margin: '20px 0' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontFamily: semantico.fonteTitulo,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {titulo}
          </h1>
          {descricao && (
            <p style={{ margin: '8px 0 0', color: semantico.textoSecundario, lineHeight: 1.55 }}>
              {descricao}
            </p>
          )}
        </header>
        <section
          style={{
            border: `1px solid ${semantico.divisor}`,
            background: componente.contextoFrio.cardGradiente,
            borderRadius: 16,
            padding: 20,
          }}
        >
          {children}
        </section>
      </div>
      {aba !== null && <BarraInferior atual={aba} />}
    </main>
  )
}
