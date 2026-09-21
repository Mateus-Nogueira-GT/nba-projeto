import Link from 'next/link'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { FormularioLogin } from './formulario'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { destinoInternoSeguro } from '@/modules/plataforma/auth/requisicao'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entrar' }

// Mensagem de cada `?aviso=` que esta tela pode receber por redirect de fora
// (hoje só o "encerrar sessão" do próprio aparelho, em `conta/acoes.ts`: essa
// sessão acabou de morrer, então o aviso chega aqui em vez de em `/conta`).
const TEXTO_DO_AVISO: Record<string, string> = {
  'sessao-encerrada': 'A sessão deste aparelho foi encerrada. Entre novamente.',
  'senha-redefinida': 'Senha redefinida. Entre com a senha nova.',
}

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parametros = await searchParams
  const destinoBruto = Array.isArray(parametros.destino)
    ? parametros.destino[0]
    : parametros.destino
  const destino = destinoInternoSeguro(destinoBruto ?? '/abrir')
  const cadastroAberto = configuracaoProdutoPago().cadastroPublicoHabilitado
  const avisoBruto = Array.isArray(parametros.aviso) ? parametros.aviso[0] : parametros.aviso
  const mensagemDoAviso = avisoBruto ? TEXTO_DO_AVISO[avisoBruto] : undefined
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
          NIP
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: semantico.textoSecundario }}>
          Entre para ver a Lista Secreta do dia.
        </p>
        {mensagemDoAviso && (
          <p role="status" style={{ margin: '0 0 16px', fontSize: 13, color: semantico.apitoNivel3 }}>
            {mensagemDoAviso}
          </p>
        )}
        <FormularioLogin destino={destino} />
        {/* "Esqueci a senha" fica FORA do `cadastroAberto`: cadastro fechado
            não significa conta inexistente — é sempre quem já tem conta que
            perde a senha, então o link precisa valer também quando o
            cadastro público está desligado. */}
        <p style={{ marginTop: 16, fontSize: 13, color: semantico.textoSecundario }}>
          {cadastroAberto && (
            <>
              Ainda não tem conta? <a href="/cadastrar">Cadastre-se</a> ·{' '}
            </>
          )}
          <Link href="/redefinir">Esqueci a senha</Link>
        </p>
      </div>
    </main>
  )
}
