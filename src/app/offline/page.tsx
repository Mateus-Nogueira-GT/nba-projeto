import type { Metadata } from 'next'
import Link from 'next/link'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

export const metadata: Metadata = {
  title: 'Sem conexão',
  robots: { index: false, follow: false },
}

export default function PaginaOffline() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: componente.fundoTela,
        color: semantico.textoPrimario,
        fontFamily: semantico.fonteCorpo,
      }}
    >
      <section
        aria-labelledby="titulo-offline"
        style={{
          width: 'min(100%, 420px)',
          padding: 24,
          border: `1px solid ${semantico.divisor}`,
          borderRadius: 18,
          background: semantico.superficie,
          textAlign: 'center',
        }}
      >
        <div aria-hidden="true" style={{ fontSize: 34, lineHeight: 1 }}>
          ◉
        </div>
        <h1 id="titulo-offline" style={{ margin: '16px 0 8px', fontSize: 24 }}>
          Sem conexão
        </h1>
        <p
          style={{
            margin: '0 0 20px',
            color: semantico.textoSecundario,
            lineHeight: 1.55,
          }}
        >
          Reconecte-se para consultar a Lista Secreta, o Fire Live e as estatísticas. Nenhum dado da
          sua conta foi armazenado neste dispositivo.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 18px',
            borderRadius: 10,
            background: semantico.apitoNivel3,
            color: semantico.textoSobreAcento,
            fontWeight: 750,
            textDecoration: 'none',
          }}
        >
          Tentar novamente
        </Link>
      </section>
    </main>
  )
}
