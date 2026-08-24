import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { contextoDoJob } from '@/modules/ingestao/jobs/contexto'
import { executarJobComLease } from '@/modules/ingestao/jobs/execucao'
import { dataReferenciaNba, executarJobEscalacao } from '@/modules/ingestao/jobs/orquestradores'
import { montarFontes } from '@/modules/ingestao/sincronizar/fonte'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/sincronizar-escalacao',
    tarefa: async () => {
      const contexto = await contextoDoJob()
      const dataReferencia = dataReferenciaNba(contexto.agora, contexto.ruleset.rodada.fuso)
      const db = getDb()
      const fontes = montarFontes(db, contexto.config)
      return executarJobComLease(
        db,
        {
          job: 'sincronizar-escalacao',
          janelaInicio: dataReferencia,
          janelaFim: dataReferencia,
          temporada: contexto.temporada,
          origem: 'CRON',
          leaseMs: 240_000,
        },
        async ({ confirmarLease }) => {
          await confirmarLease()
          return executarJobEscalacao(db, fontes, dataReferencia, contexto.agora)
        },
      )
    },
    quantidade: (r) => (r.executado ? Object.values(r.resultado).reduce((a, b) => a + b, 0) : 0),
  })
}
