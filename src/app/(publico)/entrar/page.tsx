import Link from 'next/link'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { LayoutAcesso } from '@/features/publico/LayoutAcesso'
import { FormularioLogin } from '@/features/publico/FormularioLogin'
import { destinoSeguro, parametro } from '@/features/publico/destino'
import f from '@/features/publico/Formulario.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entrar' }

// Cada `?aviso=` que esta tela pode receber por redirect. Chave fora daqui
// não vira aviso vazio — some.
const TEXTO_DO_AVISO: Record<string, string> = {
  'sessao-encerrada': 'A sessão deste aparelho foi encerrada. Entre novamente.',
  'senha-redefinida': 'Senha redefinida. Entre com a senha nova.',
}

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const p = await searchParams
  const destino = destinoSeguro(parametro(p.destino) ?? '/abrir', '/abrir')
  const aviso = parametro(p.aviso)
  const mensagemDoAviso = aviso ? TEXTO_DO_AVISO[aviso] : undefined
  const cadastroAberto = configuracaoProdutoPago().cadastroPublicoHabilitado

  return (
    <LayoutAcesso titulo="Bem-vindo à NIP" subtitulo="Acesse sua conta para continuar.">
      {mensagemDoAviso && (
        <p role="status" className={f.aviso} style={{ marginBottom: 16 }}>
          {mensagemDoAviso}
        </p>
      )}
      <FormularioLogin destino={destino} />
      {cadastroAberto && (
        <p className={f.rodape}>
          Ainda não tem conta? <Link href="/cadastrar">Criar conta</Link>
        </p>
      )}
    </LayoutAcesso>
  )
}
