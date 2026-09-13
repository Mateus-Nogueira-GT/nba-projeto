import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { concluir } from './acoes'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nova senha' }

/**
 * `?erro=` chega como CÓDIGO — o mesmo conjunto fechado de `motivo` que
 * `concluirRedefinicao` decide (`auth/redefinicao.ts`) — nunca texto livre:
 * antes, `acoes.ts` mandava a frase por extenso na URL, e qualquer link
 * forjado para `/redefinir/x?erro=<frase>` caía direto num `role="alert"`
 * desta página (achado da revisão final, mesma correção de `conta/page.tsx`).
 * A MESMA frase do cadastro e da troca no perfil para 'senha'
 * (`MENSAGEM_REGRA_SENHA`, auth/senha.ts), para quem lê não desconfiar de
 * uma terceira política.
 */
const TEXTO_DO_ERRO: Record<string, string> = {
  token: 'Link inválido.',
  expirada: 'Link expirado. Peça um novo a quem administra a sua conta.',
  usada: 'Este link já foi usado.',
  senha: MENSAGEM_REGRA_SENHA,
}

/**
 * TROCA DE SENHA PELO LINK DO ADMIN (Task 7).
 *
 * O token só existe aqui como valor de um campo oculto — nunca como texto
 * visível na página, para não sobreviver a um print de tela ou a um "ver
 * código-fonte" descuidado. `concluir` (acoes.ts) faz a validação de
 * verdade; o `minLength` aqui é só affordance de teclado.
 */
export default async function PaginaRedefinirToken({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const codigoDeErro = Array.isArray(sp.erro) ? sp.erro[0] : sp.erro
  const mensagemDeErro = codigoDeErro ? TEXTO_DO_ERRO[codigoDeErro] : undefined

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
          Nova senha
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: semantico.textoSecundario }}>
          Escolha uma senha nova para entrar na NIP.
        </p>
        {mensagemDeErro && (
          <p role="alert" style={{ margin: '0 0 16px', fontSize: 13, color: semantico.alerta }}>
            {mensagemDeErro}
          </p>
        )}
        <form action={concluir} style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="token" value={token} />
          <input
            type="password"
            name="novaSenha"
            placeholder="Nova senha"
            minLength={12}
            required
            autoComplete="new-password"
            style={{ padding: 8 }}
          />
          <button type="submit">Trocar senha</button>
        </form>
      </div>
    </main>
  )
}
