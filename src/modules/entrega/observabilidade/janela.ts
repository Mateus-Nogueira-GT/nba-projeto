import { and, eq, gte, lte, or } from 'drizzle-orm'

import { jogos } from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'

/**
 * Estamos em janela de jogo?
 *
 * Sim quando existe partida AO_VIVO ou AGENDADA para começar dentro da
 * antecedência (`ruleset.avisos.dado_parado.janela_antecedencia_minutos`).
 * É a diferença entre um alerta útil e um alarme falso a cada madrugada:
 * dentro da janela vale o limite apertado de frescor; fora, o folgado.
 *
 * Jogo AGENDADO cujo horário já passou NÃO reabre a janela — quem decide se
 * isso é pane é o frescor do provedor, não o calendário.
 */
export async function emJanelaDeJogo(
  db: Db,
  agora: Date,
  antecedenciaMinutos: number,
): Promise<boolean> {
  const limite = new Date(agora.getTime() + antecedenciaMinutos * 60_000)

  const linhas = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(
      or(
        eq(jogos.status, 'AO_VIVO'),
        and(eq(jogos.status, 'AGENDADO'), gte(jogos.dataHoraUtc, agora), lte(jogos.dataHoraUtc, limite)),
      ),
    )
    .limit(1)

  return linhas.length > 0
}
