import Link from 'next/link'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'

export const metadata = { title: 'Esqueci a senha' }

/**
 * "ESQUECI A SENHA" SEM PROVEDOR DE E-MAIL (spec §5.3, Task 7).
 *
 * O projeto não tem provedor de e-mail ainda, então não existe "te mandamos
 * um link" — quem perdeu a senha pede o link a quem administra a conta. O
 * mesmo link (Task 7, `auth/redefinicao.ts`) serve para o e-mail depois: o
 * que muda é só quem ENTREGA, nunca esta explicação nem o token em si.
 */
export default async function PaginaRedefinir() {
  return (
    <main
      style={{
        background: componente.fundoTela,
        color: semantico.textoPrimario,
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: semantico.fonteCorpo,
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
          Esqueci a senha
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: semantico.textoSecundario }}>
          Ainda não enviamos e-mail. Peça o link de redefinição a quem administra a sua conta;
          ele vale por uma hora e só funciona uma vez.
        </p>
        <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
          <Link href="/entrar">Voltar para entrar</Link>
        </p>
      </div>
    </main>
  )
}
