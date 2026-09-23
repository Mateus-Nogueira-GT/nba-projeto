import { getWorkflowMetadata, sleep } from 'workflow'

import { getDb } from '@/modules/dominio/db/cliente'
import type { EstadoObservado } from '@/modules/entrega/fire-live/ciclo'
import { confirmarInicioWorkflow } from '@/modules/entrega/fire-live/inicio'
import { executarPassoFireLive, type RetornoPasso } from '@/modules/entrega/fire-live/passo'
import { FilaVercel } from '@/modules/entrega/fila/vercel-queues'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { executarSnapshotAoVivoDoJogo } from '@/modules/ingestao/jobs/orquestradores'
import { configDoAmbiente, montarFontes } from '@/modules/ingestao/sincronizar/fonte'

/**
 * LOOP DO 1º QUARTO — um workflow por jogo.
 *
 * Existe porque função serverless morre em 300s e o 1º quarto leva 25–30 min
 * de relógio real. A saída não é esticar a função: cada ciclo é uma invocação
 * curta, o `sleep` não consome recurso, e o estado sobrevive entre eles.
 * Ver ADR-0003.
 *
 * O workflow é SÓ orquestração. Toda a lógica vive no passo, que roda fora do
 * sandbox e tem acesso pleno a Node — banco, disco, fila.
 *
 * O motor encerra no fim do 1Q, mas a ingestão continua até o jogo terminar.
 * São três saídas duras:
 *   · o jogo terminou                    → o passo devolve encerrar
 *   · o jogo sumiu do banco              → o passo devolve encerrar
 *   · estourou o limite do ruleset       → o passo devolve encerrar
 */
export async function fireLiveDoJogo(jogoId: string, iniciadoEmIso: string, leaseToken?: string) {
  'use workflow'

  // Runs antigos, iniciados antes da migration do lease, não carregam token e
  // continuam compatíveis no deployment ao qual estão fixados. Todo run novo
  // precisa vencer o fencing antes de executar qualquer ciclo de produto.
  // O runId também vai a todo passo, que bate na linha com fencing (W2-3);
  // runs antigos passam null e pulam o batimento.
  const runId = leaseToken ? getWorkflowMetadata().workflowRunId : null
  if (leaseToken && runId !== null) {
    const confirmou = await confirmarLeaseNoBanco(jogoId, leaseToken, runId)
    if (!confirmou) return { jogoId, ciclos: 0, motivo: 'lease-perdido' }
  }

  let estado: EstadoObservado | null = null
  let motorEncerrado = false
  let ciclo = 0

  for (;;) {
    const passo = await ciclarUmaVez(jogoId, runId, estado, iniciadoEmIso, ciclo, motorEncerrado)
    if (passo.encerrar) return { jogoId, ciclos: ciclo, motivo: passo.motivo }

    estado = passo.estado
    motorEncerrado = passo.motorEncerrado
    ciclo += 1
    await sleep(`${passo.intervaloSegundos}s`)
  }
}

async function confirmarLeaseNoBanco(
  jogoId: string,
  leaseToken: string,
  runId: string,
): Promise<boolean> {
  'use step'

  return confirmarInicioWorkflow(getDb(), { jogoId, leaseToken }, runId, new Date())
}

/**
 * UM ciclo, como passo durável — fino de propósito: a lógica vive em
 * `executarPassoFireLive`, testável sem o runtime do workflow.
 *
 * Reexecução deste passo é segura por construção: `executarCiclo` só notifica
 * o que o banco aceitou, e a UNIQUE de `apitos`/`greens` rejeita o que já
 * passou. Retry não vira push duplicado — é o requisito 3 do Fire Live. E um
 * erro transitório depois do batimento não lança (W2-3): vai ao log e o laço
 * segue, em vez de esgotar as tentativas e matar o run.
 */
async function ciclarUmaVez(
  jogoId: string,
  runId: string | null,
  estadoAnterior: EstadoObservado | null,
  iniciadoEmIso: string,
  ciclo: number,
  motorEncerrado: boolean,
): Promise<RetornoPasso> {
  'use step'

  const db = getDb()
  return executarPassoFireLive(
    {
      db,
      ruleset: await rulesetAtivo(),
      fila: new FilaVercel(),
      agora: new Date(),
      ingerir: async (agora) => {
        const config = configDoAmbiente()
        if (!config || !config.habilitada)
          throw new Error('ingestão NBA indisponível durante o workflow')
        await executarSnapshotAoVivoDoJogo(db, montarFontes(db, config), jogoId, agora)
      },
    },
    { jogoId, runId, estadoAnterior, iniciadoEmIso, ciclo, motorEncerrado },
  )
}
