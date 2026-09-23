import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { avaliarESinalizar } from '@/modules/entrega/observabilidade/alerta'
import { avaliarFalhasOperacionais } from '@/modules/entrega/observabilidade/falhas-operacionais'
import { notificadorDoAmbiente } from '@/modules/entrega/observabilidade/notificador-webhook'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Alerta de dado parado — "a equipe descobre antes do usuário". Spec 07.
 * W2-5: o mesmo cron também soma as falhas operacionais (push expirado, P3)
 * que hoje só existiam em log. `notificadorDoAmbiente` é o webhook genérico
 * quando `ALERTA_WEBHOOK_URL` existe; sem a variável, cai no log — G8 segue
 * pendente.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/saude',
    tarefa: async () => {
      const ruleset = await rulesetAtivo()
      const agora = new Date()
      const notificador = notificadorDoAmbiente()
      const emitidos = await avaliarESinalizar(getDb(), agora, ruleset, notificador)
      const operacionais = await avaliarFalhasOperacionais(getDb(), agora, notificador)
      return { alertas: emitidos, operacionais }
    },
    quantidade: (r) => r.alertas.length + r.operacionais.length,
  })
}
