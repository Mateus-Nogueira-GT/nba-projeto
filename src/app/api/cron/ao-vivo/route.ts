import { start } from 'workflow/api'

import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import {
  iniciarWorkflowsReservados,
  reservarJogosParaObservar,
} from '@/modules/entrega/fire-live/inicio'
import { contextoDoJob } from '@/modules/ingestao/jobs/contexto'
import { executarJobComLease } from '@/modules/ingestao/jobs/execucao'
import { dataReferenciaNba, executarJobAoVivo } from '@/modules/ingestao/jobs/orquestradores'
import { montarFontes } from '@/modules/ingestao/sincronizar/fonte'
import { fireLiveDoJogo } from '@/workflows/fire-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/ao-vivo',
    tarefa: async () => {
      const contexto = await contextoDoJob()
      const dataReferencia = dataReferenciaNba(contexto.agora, contexto.ruleset.rodada.fuso)
      const db = getDb()
      const fontes = montarFontes(db, contexto.config)
      const ingestao = await executarJobComLease(
        db,
        {
          job: 'ao-vivo',
          janelaInicio: dataReferencia,
          janelaFim: dataReferencia,
          temporada: contexto.temporada,
          origem: 'CRON',
          leaseMs: 55_000,
        },
        async ({ confirmarLease }) => {
          await confirmarLease()
          return executarJobAoVivo(db, fontes, dataReferencia, contexto.agora)
        },
      )

      const disparos = await reservarJogosParaObservar(db, contexto.ruleset, contexto.agora)
      const workflows = await iniciarWorkflowsReservados(db, disparos, async (disparo) => {
        const run = await start(fireLiveDoJogo, [
          disparo.jogoId,
          disparo.iniciadoEm.toISOString(),
          disparo.leaseToken,
        ])
        return { runId: run.runId }
      })
      if (workflows.falhas.length > 0) {
        throw new Error(`falharam ${workflows.falhas.length} inícios de workflow`)
      }
      return {
        ingestao,
        workflowsIniciados: workflows.iniciados.length,
        workflowsObsoletos: workflows.obsoletos.length,
      }
    },
    quantidade: (r) => r.workflowsIniciados,
  })
}
