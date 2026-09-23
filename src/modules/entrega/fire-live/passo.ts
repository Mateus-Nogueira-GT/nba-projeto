import { and, eq } from 'drizzle-orm'

import { fireLiveExecucoes, jogos } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor'
import { encerrarExecucao, executarCiclo, registrarCiclo, type EstadoObservado } from './ciclo'

export type RetornoPasso =
  | { encerrar: true; motivo: string }
  | { encerrar: false; estado: EstadoObservado; motorEncerrado: boolean; intervaloSegundos: number }

export type DepsPasso = {
  db: Db
  ruleset: Ruleset
  fila: Parameters<typeof executarCiclo>[2]
  // A ingestão entra como função (W2-3): entrega não importa ingestao, e o
  // teste do passo consegue simular um provedor fora do ar.
  ingerir: (agora: Date) => Promise<void>
  agora: Date
  /**
   * Relógio do fim do passo, para renovar o batimento depois de um erro.
   * Injetável só para teste; em produção é o relógio real.
   */
  relogio?: () => Date
}

export type EntradaPasso = {
  jogoId: string
  runId: string | null
  estadoAnterior: EstadoObservado | null
  iniciadoEmIso: string
  ciclo: number
  motorEncerrado: boolean
}

/**
 * Batimento com fencing: só o run dono da linha bate (W2-3). Nenhuma linha
 * atualizada = o cron retomou o jogo para outro run, e este deve parar.
 */
export async function registrarBatimento(db: Db, jogoId: string, runId: string, agora: Date) {
  const linhas = await db
    .update(fireLiveExecucoes)
    .set({ atualizadoEm: agora })
    .where(
      and(
        eq(fireLiveExecucoes.jogoId, jogoId),
        eq(fireLiveExecucoes.runId, runId),
        eq(fireLiveExecucoes.estado, 'INICIADA'),
      ),
    )
    .returning({ jogoId: fireLiveExecucoes.jogoId })
  return linhas.length > 0
}

/**
 * UM ciclo do Fire Live. Reexecução é segura por construção (UNIQUE de
 * apitos/greens). Uma exceção no meio do ciclo NÃO derruba o run (W2-3): o
 * runtime tentaria o passo 3 vezes e depois mataria o workflow, deixando a
 * linha INICIADA para sempre. Aqui o erro vai ao log e o próximo ciclo tenta
 * de novo, 20 s depois. O motor é idempotente; repetir um ciclo não repete push.
 */
export async function executarPassoFireLive(
  deps: DepsPasso,
  e: EntradaPasso,
): Promise<RetornoPasso> {
  const { db, ruleset, agora } = deps
  const intervaloSegundos = ruleset.fire_live.observacao.intervalo_segundos
  const continuar = (estado: EstadoObservado | null, motorEncerrado: boolean): RetornoPasso => ({
    encerrar: false,
    estado: estado ?? {},
    motorEncerrado,
    intervaloSegundos,
  })

  // Runs antigos, sem leaseToken, chegam com runId null e pulam o batimento
  // (compatibilidade no deployment ao qual estão fixados).
  if (e.runId !== null && !(await registrarBatimento(db, e.jogoId, e.runId, agora))) {
    return { encerrar: true, motivo: 'lease-perdido' }
  }

  if (agora.getTime() - new Date(e.iniciadoEmIso).getTime() >= 6 * 60 * 60_000) {
    await encerrarExecucao(db, e.jogoId, 'limite-de-tempo', agora, e.runId)
    return { encerrar: true, motivo: 'limite-de-tempo' }
  }

  try {
    await deps.ingerir(agora)

    const [jogo] = await db
      .select({ status: jogos.status })
      .from(jogos)
      .where(eq(jogos.id, e.jogoId))
      .limit(1)
    if (!jogo) {
      await encerrarExecucao(db, e.jogoId, 'jogo-nao-encontrado', agora, e.runId)
      return { encerrar: true, motivo: 'jogo-nao-encontrado' }
    }
    if (jogo.status === 'ENCERRADO') {
      await encerrarExecucao(db, e.jogoId, 'jogo-encerrado', agora, e.runId)
      return { encerrar: true, motivo: 'jogo-encerrado' }
    }
    if (e.motorEncerrado) return continuar(e.estadoAnterior, true)

    const resultado = await executarCiclo(db, ruleset, deps.fila, {
      jogoId: e.jogoId,
      estadoAnterior: e.estadoAnterior,
      iniciadoEm: new Date(e.iniciadoEmIso),
      agora,
    })
    if (resultado.encerrar) {
      if (resultado.motivo === 'fim-do-primeiro-quarto') return continuar(e.estadoAnterior, true)
      await encerrarExecucao(db, e.jogoId, resultado.motivo, agora, e.runId)
      return { encerrar: true, motivo: resultado.motivo }
    }
    await registrarCiclo(db, e.jogoId, resultado.estado, e.ciclo + 1, e.runId)
    return continuar(resultado.estado, false)
  } catch (erro) {
    console.error(
      JSON.stringify({
        evento: 'fire_live_ciclo_falhou',
        jogoId: e.jogoId,
        ciclo: e.ciclo,
        erro: erro instanceof Error ? erro.message.slice(0, 500) : String(erro),
      }),
    )
    // Renova o batimento com o relógio do FIM do passo (W2-3). No caminho
    // feliz `registrarCiclo` já faz isso; aqui, sem a renovação, um provedor
    // lento (timeouts + failover somam ~40–50 s) faria o cron retomar um run
    // vivo a cada minuto de pane. Melhor esforço: falhar aqui não pode
    // derrubar o run.
    if (e.runId !== null) {
      try {
        await registrarBatimento(db, e.jogoId, e.runId, (deps.relogio ?? (() => new Date()))())
      } catch (erroBatimento) {
        console.error(
          JSON.stringify({
            evento: 'fire_live_batimento_falhou',
            jogoId: e.jogoId,
            ciclo: e.ciclo,
            erro:
              erroBatimento instanceof Error
                ? erroBatimento.message.slice(0, 500)
                : String(erroBatimento),
          }),
        )
      }
    }
    return continuar(e.estadoAnterior, e.motorEncerrado)
  }
}
