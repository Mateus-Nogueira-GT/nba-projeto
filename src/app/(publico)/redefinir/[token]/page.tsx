import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { concluirNovaSenha } from '@/features/publico/acoes'
import { CampoSenha } from '@/features/publico/CampoSenha'
import { LayoutAcesso } from '@/features/publico/LayoutAcesso'
import { parametro } from '@/features/publico/destino'
import f from '@/features/publico/Formulario.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nova senha' }

/** `?erro=` chega como CÓDIGO de um conjunto fechado — nunca texto livre da URL. */
const TEXTO_DO_ERRO: Record<string, string> = {
  token: 'Link inválido.',
  expirada: 'Link expirado. Peça um novo a quem administra a sua conta.',
  usada: 'Este link já foi usado.',
  senha: MENSAGEM_REGRA_SENHA,
}

/**
 * Troca de senha pelo link do admin. O token existe só num campo oculto,
 * nunca como texto visível — não sobrevive a um print de tela.
 */
export default async function PaginaNovaSenha({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams])
  const codigo = parametro(sp.erro)
  const erro = codigo ? TEXTO_DO_ERRO[codigo] : undefined
  return (
    <LayoutAcesso titulo="Nova senha" subtitulo="Escolha uma senha nova para entrar na NIP.">
      <form action={concluirNovaSenha} className={f.form}>
        <input type="hidden" name="token" value={token} />
        <div className={f.campo}>
          <label htmlFor="novaSenha" className={f.rotulo}>
            Nova senha
          </label>
          <CampoSenha
            id="novaSenha"
            nome="novaSenha"
            autoComplete="new-password"
            // 12, como o back (`senhaSchema.min(12)`) e a frase logo abaixo.
            // A validação de verdade é de `concluirRedefinicao`; isto é só
            // affordance de teclado.
            minLength={12}
            descritoPor={erro ? 'erro-senha regra-senha' : 'regra-senha'}
          />
          <p id="regra-senha" className={f.ajuda}>
            {MENSAGEM_REGRA_SENHA}
          </p>
        </div>
        {erro && (
          <p id="erro-senha" role="alert" className={f.erro}>
            {erro}
          </p>
        )}
        <button type="submit" className={f.primario}>
          Trocar senha
        </button>
      </form>
    </LayoutAcesso>
  )
}
