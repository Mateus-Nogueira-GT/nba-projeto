import { semantico } from '@/design-system/tokens/semantico'
import { FormularioLogin } from './formulario'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { destinoInternoSeguro } from '@/modules/plataforma/auth/requisicao'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entrar · IA da NBA' }

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parametros = await searchParams
  const destinoBruto = Array.isArray(parametros.destino) ? parametros.destino[0] : parametros.destino
  const destino = destinoInternoSeguro(destinoBruto ?? '/')
  const cadastroAberto = configuracaoProdutoPago().cadastroPublicoHabilitado
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
        <h1
          style={{
            fontSize: 22,
            marginBottom: 4,
            fontFamily: semantico.fonteTitulo,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          IA da NBA
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: semantico.textoSecundario }}>
          Entre para ver a Lista Secreta do dia.
        </p>
        <FormularioLogin destino={destino} />
        {cadastroAberto && (
          <p style={{ marginTop: 16, fontSize: 13, color: semantico.textoSecundario }}>
            Ainda não tem conta? <a href="/cadastrar">Cadastre-se</a>
          </p>
        )}
      </div>
    </main>
  )
}
