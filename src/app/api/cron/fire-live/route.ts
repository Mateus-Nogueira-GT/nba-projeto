import { start } from 'workflow/api'

import { getDb } from '@/modules/dominio/db/cliente'
import { anotarRun, reservarJogosParaObservar } from '@/modules/entrega/fire-live/inicio'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { fireLiveDoJogo } from '@/workflows/fire-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GATILHO DO TIPOFF.
 *
 * O cron não sabe a que horas cada jogo começa de fato — atrasos de
 * transmissão são rotina. Quem define o tipoff é o dado: assim que a ingestão
 * escreve `quarto_atual = 1`, este job encontra o jogo e sobe o workflow.
 *
 * Roda de minuto em minuto porque a janela é curta: um Fire Live que começa a
 * observar 5 minutos atrasado perdeu um terço do 1º quarto.
 *
 * Reexecutável: a reserva em `fire_live_execucoes` garante um workflow por
 * jogo, mesmo com duas invocações concorrentes.
 */
export async function GET(requisicao: Request): Promise<Response> {
  const autorizacao = requisicao.headers.get('authorization')
  const segredo = process.env.CRON_SECRET

  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return new Response('não autorizado', { status: 401 })
  }

  const db = getDb()
  const agora = new Date()
  const disparos = await reservarJogosParaObservar(db, await rulesetAtivo(), agora)

  const iniciados: string[] = []
  for (const disparo of disparos) {
    const run = await start(fireLiveDoJogo, [disparo.jogoId, disparo.iniciadoEm.toISOString()])
    await anotarRun(db, disparo.jogoId, run.runId)
    iniciados.push(disparo.jogoId)
  }

  return Response.json({ iniciados: iniciados.length, jogos: iniciados })
}
