import { semantico } from '@/design-system/tokens/semantico'
import { FormularioLogin } from './formulario'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entrar · IA da NBA' }

export default function PaginaEntrar() {
  return (
    <main
      style={{
        background: semantico.fundo,
        color: semantico.textoPrimario,
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>IA da NBA</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: semantico.textoSecundario }}>
          Entre para ver a Lista Secreta do dia.
        </p>
        <FormularioLogin destino="/" />
      </div>
    </main>
  )
}
