'use client'

import { EstadoVazio } from '@/ui/blocos'

/** Uma falha numa tela não derruba o app: a moldura continua, com saída. */
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <EstadoVazio
        titulo="Não deu para carregar esta tela"
        texto={
          <>
            Tente de novo em alguns segundos.{' '}
            <button
              type="button"
              onClick={reset}
              style={{ border: 0, background: 'none', color: 'var(--acento-texto)', fontWeight: 600, textDecoration: 'underline', padding: 0 }}
            >
              Tentar de novo
            </button>
          </>
        }
        acao={{ rotulo: 'Voltar para Entradas', href: '/' }}
      />
    </div>
  )
}
