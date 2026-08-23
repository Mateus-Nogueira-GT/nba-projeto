import { executarCronProtegido } from '@/modules/entrega/cron/guarda'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Endpoint legado. O dono único da descoberta + ingestão + início do
 * workflow passou a ser `/api/cron/ao-vivo` na Spec 01.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/fire-live',
    tarefa: async () => ({
      desativado: true,
      substituidoPor: '/api/cron/ao-vivo',
    }),
    quantidade: () => 0,
  })
}
