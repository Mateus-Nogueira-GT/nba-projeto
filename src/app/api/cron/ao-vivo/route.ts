import { revalidateTag } from 'next/cache'
import { start } from 'workflow/api'

import { TAG_LATERAL } from '@/app/_cache/lateral'
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

      // W2-3: a ingestão de TODOS os jogos ao vivo não pode impedir o Fire
      // Live de reservar e iniciar — o workflow tem ingestão própria por
      // jogo (fireLiveDoJogo). Guardamos o erro num holder (não em `let
      // ... = null` reatribuído dentro do `.catch`, que o TypeScript acaba
      // estreitando para `never`) e o relançamos no fim, depois de
      // reservar/iniciar, para o cron ainda reportar falha.
      const falhaIngestao: { erro: unknown } = { erro: null }
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
      ).catch((erro: unknown) => {
        falhaIngestao.erro = erro
        return null
      })

      if (ingestao?.executado && Object.values(ingestao.resultado).some((v) => v > 0)) {
        // Jogo que fecha de madrugada precisa chegar à lateral agora — não
        // dá para esperar o cron da rodada às 11:00 UTC (achado da revisão).
        revalidateTag(TAG_LATERAL, 'max')
      }

      const disparos = await reservarJogosParaObservar(db, contexto.ruleset, contexto.agora)
      const workflows = await iniciarWorkflowsReservados(db, disparos, async (disparo) => {
        const run = await start(fireLiveDoJogo, [
          disparo.jogoId,
          disparo.iniciadoEm.toISOString(),
          disparo.leaseToken,
        ])
        return { runId: run.runId }
      })
      if (falhaIngestao.erro) throw falhaIngestao.erro
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
