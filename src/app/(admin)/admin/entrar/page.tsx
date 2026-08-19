import { FormularioLogin } from '../../../(app)/entrar/formulario'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel · Entrar' }

/**
 * Login do painel — separado do app do usuário.
 *
 * A identidade é a mesma tabela; o que separa é a rota e a exigência de
 * papel ADMIN nas telas do painel.
 */
export default function PaginaEntrarAdmin() {
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 360, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>Painel administrativo</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Acesso restrito.</p>
      <FormularioLogin destino="/admin/usuarios" />
    </main>
  )
}
