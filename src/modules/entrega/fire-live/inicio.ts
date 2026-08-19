import { eq } from 'drizzle-orm'

import { fireLiveExecucoes } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { jogosNoQuarto } from '../../dominio/fatos-ao-vivo'
import type { Ruleset } from '../../motor/ruleset/schema'

export type Disparo = { jogoId: string; iniciadoEm: Date }

/**
 * Reserva o direito de observar um jogo.
 *
 * O cron do tipoff roda de minuto em minuto e é reexecutável por desenho — na
 * segunda vez o mesmo jogo ainda está no 1º quarto. Quem impede dois workflows
 * observando a mesma partida (e portanto dois pushes por apito) é a UNIQUE em
 * `fire_live_execucoes.jogo_id`, não uma checagem de leitura antes do insert:
 * duas invocações simultâneas do cron passariam as duas por um `SELECT`.
 *
 * Devolve apenas os jogos que ESTA invocação reservou.
 */
export async function reservarJogosParaObservar(
  db: Db,
  ruleset: Ruleset,
  agora: Date,
): Promise<Disparo[]> {
  const emJogo = await jogosNoQuarto(db, ruleset.fire_live.quarto)
  if (emJogo.length === 0) return []

  const reservados = await db
    .insert(fireLiveExecucoes)
    .values(emJogo.map((j) => ({ jogoId: j.id, iniciadoEm: agora })))
    .onConflictDoNothing({ target: fireLiveExecucoes.jogoId })
    .returning({ jogoId: fireLiveExecucoes.jogoId })

  return reservados.map((r) => ({ jogoId: r.jogoId, iniciadoEm: agora }))
}

/** Anota o id do run para que `npx workflow inspect` ache a execução. */
export async function anotarRun(db: Db, jogoId: string, runId: string): Promise<void> {
  await db
    .update(fireLiveExecucoes)
    .set({ runId })
    .where(eq(fireLiveExecucoes.jogoId, jogoId))
}
