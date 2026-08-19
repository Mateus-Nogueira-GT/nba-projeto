import { sleep } from 'workflow'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  encerrarExecucao,
  executarCiclo,
  registrarCiclo,
} from '@/modules/entrega/fire-live/ciclo'
import type { EstadoObservado } from '@/modules/entrega/fire-live/ciclo'
import { FilaVercel } from '@/modules/entrega/fila/vercel-queues'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

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
 * ENCERRA NO FIM DO 1Q, EM QUALQUER HIPÓTESE. São três saídas, e nenhuma delas
 * depende de o provedor de dados se comportar bem:
 *   · o quarto virou (ou o jogo acabou)  → o passo devolve encerrar
 *   · o jogo sumiu do banco              → o passo devolve encerrar
 *   · estourou o limite do ruleset       → o passo devolve encerrar
 */
export async function fireLiveDoJogo(jogoId: string, iniciadoEmIso: string) {
  'use workflow'

  let estado: EstadoObservado | null = null
  let ciclo = 0

  for (;;) {
    const passo = await ciclarUmaVez(jogoId, estado, iniciadoEmIso, ciclo)
    if (passo.encerrar) return { jogoId, ciclos: ciclo, motivo: passo.motivo }

    estado = passo.estado
    ciclo += 1
    await sleep(`${passo.intervaloSegundos}s`)
  }
}

type RetornoPasso =
  | { encerrar: true; motivo: string }
  | { encerrar: false; estado: EstadoObservado; intervaloSegundos: number }

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
): Promise<RetornoPasso> {
  'use step'

  const ruleset = await rulesetAtivo()
  const db = getDb()
  const agora = new Date()

  const resultado = await executarCiclo(db, ruleset, new FilaVercel(), {
    jogoId,
    estadoAnterior,
    iniciadoEm: new Date(iniciadoEmIso),
    agora,
  })

  if (resultado.encerrar) {
    await encerrarExecucao(db, jogoId, resultado.motivo, agora)
    return { encerrar: true, motivo: resultado.motivo }
  }

  await registrarCiclo(db, jogoId, resultado.estado, ciclo + 1)

  return {
    encerrar: false,
    estado: resultado.estado,
    intervaloSegundos: ruleset.fire_live.observacao.intervalo_segundos,
  }
}
