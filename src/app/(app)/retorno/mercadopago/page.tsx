import { redirect } from 'next/navigation'
import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { getDb } from '@/modules/dominio/db/cliente'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirmação de pagamento · IA da NBA' }

export default async function PaginaRetornoMercadoPago() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)

  return (
    <MolduraConta
      titulo={acesso.permitido ? 'Pagamento confirmado' : 'Confirmação em andamento'}
      descricao={
        acesso.permitido
          ? 'Seu direito de acesso já foi confirmado pelo servidor.'
          : 'O retorno do checkout não comprova o pagamento. Estamos aguardando a confirmação assinada do Mercado Pago.'
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {acesso.permitido ? (
          <Link href="/">Abrir a Lista Secreta</Link>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              Isso normalmente leva poucos instantes. Você pode acompanhar o estado sem refazer a cobrança.
            </p>
            <Link href="/conta">Ver estado da conta</Link>
          </>
        )}
      </div>
    </MolduraConta>
  )
}
