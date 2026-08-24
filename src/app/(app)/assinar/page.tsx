import { redirect } from 'next/navigation'
import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { contratar } from './acoes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinar · IA da NBA' }

export default async function PaginaAssinar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/assinar')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (acesso.permitido) redirect('/')

  const config = configuracaoProdutoPago()
  const parametros = await searchParams
  const erro = Array.isArray(parametros.erro) ? parametros.erro[0] : parametros.erro
  const preco = (config.valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  return (
    <MolduraConta
      titulo={config.nomePlano}
      descricao="Lista Secreta, alertas e análises da IA da NBA em até dois aparelhos."
    >
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <strong style={{ fontSize: 28 }}>{preco}</strong>
          <span style={{ color: semantico.textoSecundario }}> / mês</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Checkout hospedado pelo Mercado Pago</li>
          <li>Nenhum dado de cartão passa pela IA da NBA</li>
          <li>Acesso liberado somente após pagamento confirmado</li>
          <li>Cancelamento disponível na página da conta</li>
        </ul>
        {erro && (
          <p role="alert" style={{ margin: 0, color: semantico.alerta }}>
            {erro === 'limite'
              ? 'Muitas tentativas. Aguarde alguns minutos.'
              : 'O checkout está temporariamente indisponível.'}
          </p>
        )}
        {config.checkoutHabilitado ? (
          <form action={contratar}>
            <button
              type="submit"
              style={{
                width: '100%',
                border: 0,
                borderRadius: 10,
                padding: 13,
                background: `linear-gradient(90deg, ${semantico.acento}, #FFB25E)`,
                color: semantico.textoSobreCor,
                fontFamily: semantico.fonteTitulo,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Continuar no Mercado Pago
            </button>
          </form>
        ) : (
          <p style={{ margin: 0 }}>A contratação ainda não foi liberada neste ambiente.</p>
        )}
        <Link href="/conta" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          Ver minha conta
        </Link>
      </div>
    </MolduraConta>
  )
}
