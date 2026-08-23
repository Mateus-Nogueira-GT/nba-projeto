import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { avaliarESinalizar } from '@/modules/entrega/observabilidade/alerta'
import { NotificadorLog } from '@/modules/entrega/observabilidade/notificador'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Alerta de dado parado — "a equipe descobre antes do usuário". Spec 07. */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/saude',
    tarefa: async () => {
      const ruleset = await rulesetAtivo()
      // NotificadorLog até o cliente decidir o canal que acorda alguém (G8).
      const emitidos = await avaliarESinalizar(getDb(), new Date(), ruleset, new NotificadorLog())
      return { alertas: emitidos }
    },
    quantidade: (r) => r.alertas.length,
  })
}
