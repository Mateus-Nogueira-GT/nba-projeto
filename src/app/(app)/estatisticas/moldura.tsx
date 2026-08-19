import { semantico } from '@/design-system/tokens/semantico'
import { BASE_ESTATISTICAS } from '@/modules/entrega/estatisticas/rotas'

/** Casca comum das telas da aba. Mantém a navegação de volta sempre à mão. */
export function Moldura({
  titulo,
  subtitulo,
  voltarPara,
  children,
}: {
  titulo: string
  subtitulo?: string | null
  voltarPara?: string
  children: React.ReactNode
}) {
  return (
    <main
      style={{
        background: semantico.fundo,
        color: semantico.textoPrimario,
        minHeight: '100vh',
        padding: '20px 16px 64px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <nav style={{ marginBottom: 12, fontSize: 13 }}>
          <a href={voltarPara ?? BASE_ESTATISTICAS} style={{ color: semantico.textoSecundario }}>
            ← {voltarPara === '/' ? 'Lista Secreta' : 'Estatísticas'}
          </a>
        </nav>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{titulo}</h1>
          {subtitulo && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
              {subtitulo}
            </p>
          )}
        </header>
        {children}
      </div>
    </main>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px', color: semantico.textoPrimario }}>{titulo}</h2>
      {children}
    </section>
  )
}

export function SemBanco() {
  return (
    <Moldura titulo="Estatísticas">
      <p style={{ color: semantico.textoSecundario }}>
        Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>.
      </p>
    </Moldura>
  )
}
