import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirmação de pagamento' }

export default async function PaginaRetornoMercadoPago() {
  const { acesso } = await exigirNivel('GRATIS', '/conta')

  return (
    <MolduraConta
      // Quem chega aqui passou pelo checkout: está logado, e tem navegação.
      autenticado
      titulo={acesso.nivel !== 'GRATIS' ? 'Pagamento confirmado' : 'Confirmação em andamento'}
      descricao={
        acesso.nivel !== 'GRATIS'
          ? 'Seu direito de acesso já foi confirmado pelo servidor.'
          : 'O retorno do checkout não comprova o pagamento. Estamos aguardando a confirmação assinada do Mercado Pago.'
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {acesso.nivel !== 'GRATIS' ? (
          <Link href="/">Abrir a Lista Secreta</Link>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              Isso normalmente leva poucos instantes. Você pode acompanhar o estado sem refazer a
              cobrança.
            </p>
            <Link href="/conta">Ver estado da conta</Link>
          </>
        )}
      </div>
    </MolduraConta>
  )
}
