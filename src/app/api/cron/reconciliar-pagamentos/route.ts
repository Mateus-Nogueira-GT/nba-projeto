import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import { reconciliarPagamentos } from '@/modules/plataforma/assinatura/reconciliacao'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/reconciliar-pagamentos',
    tarefa: async () => {
      const config = configDoAmbiente()
      if (!config) throw new Error('MercadoPagoNaoConfigurado')
      return reconciliarPagamentos(getDb(), new PagamentoMercadoPago(config), new Date())
    },
    quantidade: (resultado) => resultado.eventos,
  })
}
