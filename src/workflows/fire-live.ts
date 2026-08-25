import { getWorkflowMetadata, sleep } from 'workflow'
import { eq } from 'drizzle-orm'

import { getDb } from '@/modules/dominio/db/cliente'
import { jogos } from '@/modules/dominio/db/schema'
import { encerrarExecucao, executarCiclo, registrarCiclo } from '@/modules/entrega/fire-live/ciclo'
import type { EstadoObservado } from '@/modules/entrega/fire-live/ciclo'
import { confirmarInicioWorkflow } from '@/modules/entrega/fire-live/inicio'
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
  if (leaseToken) {
    const { workflowRunId } = getWorkflowMetadata()
    const confirmou = await confirmarLeaseNoBanco(jogoId, leaseToken, workflowRunId)
    if (!confirmou) return { jogoId, ciclos: 0, motivo: 'lease-perdido' }
  }

  let estado: EstadoObservado | null = null
  let motorEncerrado = false
  let ciclo = 0

  for (;;) {
    const passo = await ciclarUmaVez(jogoId, estado, iniciadoEmIso, ciclo, motorEncerrado)
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

type RetornoPasso =
  | { encerrar: true; motivo: string }
  | {
      encerrar: false
      estado: EstadoObservado
      motorEncerrado: boolean
      intervaloSegundos: number
    }

/**
 * UM ciclo, como passo durável.
 *
 * Reexecução deste passo é segura por construção: `executarCiclo` só notifica
 * o que o banco aceitou, e a UNIQUE de `apitos`/`greens` rejeita o que já
 * passou. Retry não vira push duplicado — é o requisito 3 do Fire Live.
 */
async function ciclarUmaVez(
  jogoId: string,
  estadoAnterior: EstadoObservado | null,
  iniciadoEmIso: string,
  ciclo: number,
  motorEncerrado: boolean,
): Promise<RetornoPasso> {
  'use step'

  const ruleset = await rulesetAtivo()
  const db = getDb()
  const agora = new Date()

  if (agora.getTime() - new Date(iniciadoEmIso).getTime() >= 6 * 60 * 60_000) {
    await encerrarExecucao(db, jogoId, 'limite-de-tempo', agora)
    return { encerrar: true, motivo: 'limite-de-tempo' }
  }

  const config = configDoAmbiente()
  if (!config || !config.habilitada) {
    throw new Error('ingestão NBA indisponível durante o workflow')
  }
  await executarSnapshotAoVivoDoJogo(db, montarFontes(db, config), jogoId, agora)

  const [jogo] = await db
    .select({ status: jogos.status })
    .from(jogos)
    .where(eq(jogos.id, jogoId))
    .limit(1)
  if (!jogo) {
    await encerrarExecucao(db, jogoId, 'jogo-nao-encontrado', agora)
    return { encerrar: true, motivo: 'jogo-nao-encontrado' }
  }
  if (jogo.status === 'ENCERRADO') {
    await encerrarExecucao(db, jogoId, 'jogo-encerrado', agora)
    return { encerrar: true, motivo: 'jogo-encerrado' }
  }

  if (motorEncerrado) {
    return {
      encerrar: false,
      estado: estadoAnterior ?? {},
      motorEncerrado: true,
      intervaloSegundos: ruleset.fire_live.observacao.intervalo_segundos,
    }
  }

  const resultado = await executarCiclo(db, ruleset, new FilaVercel(), {
    jogoId,
    estadoAnterior,
    iniciadoEm: new Date(iniciadoEmIso),
    agora,
  })

  if (resultado.encerrar) {
    if (resultado.motivo === 'fim-do-primeiro-quarto') {
      return {
        encerrar: false,
        estado: estadoAnterior ?? {},
        motorEncerrado: true,
        intervaloSegundos: ruleset.fire_live.observacao.intervalo_segundos,
      }
    }
    await encerrarExecucao(db, jogoId, resultado.motivo, agora)
    return { encerrar: true, motivo: resultado.motivo }
  }

  await registrarCiclo(db, jogoId, resultado.estado, ciclo + 1)

  return {
    encerrar: false,
    estado: resultado.estado,
    motorEncerrado: false,
    intervaloSegundos: ruleset.fire_live.observacao.intervalo_segundos,
  }
}
