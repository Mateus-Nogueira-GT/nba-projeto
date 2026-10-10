import { and, eq, inArray, isNotNull, sql, type AnyColumn } from 'drizzle-orm'

import { estatisticasJogo, estatisticasQuarto } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * O BOX DO TIME É A SOMA DO BOX DOS JOGADORES.
 *
 * `estatisticas_time_jogo` não serve de fonte: a BallDontLie não tem box de
 * time e a tabela ficou com 0 linhas em produção (09/10/2026) — a página do
 * time mostrava "box do time ainda não chegou" em todos os jogos. Soma-se
 * `estatisticas_jogo` por (jogo, `time_id` em que o jogador atuou), e os
 * pontos por quarto vêm de `estatisticas_quarto` pelo mesmo vínculo.
 *
 * Linha de jogador sem `time_id` (anterior à 0033) fica de fora: não se sabe
 * de que lado ela estava, e somá-la num lado qualquer inventaria número.
 *
 * `porQuarto` é NULL quando o (jogo, time) não tem nenhuma linha em
 * `estatisticas_quarto` — os totais continuam. Zeros ali seriam lidos como
 * "0 0 0 0 | 112", número que não fecha com o placar.
 */
export type PontosPorQuarto = { q1: number; q2: number; q3: number; q4: number; prorrogacao: number }

export type BoxDoTime = {
  jogoId: string
  timeId: string
  pontos: number
  porQuarto: PontosPorQuarto | null
  rebotesTotal: number
  assistencias: number
  cestasC: number
  cestasT: number
  tresC: number
  tresT: number
  turnovers: number
}

export const chaveDoBox = (jogoId: string, timeId: string): string => `${jogoId}|${timeId}`

export async function boxDoTimePorJogo(db: Db, idsJogo: string[]): Promise<Map<string, BoxDoTime>> {
  if (idsJogo.length === 0) return new Map()

  const soma = (coluna: AnyColumn) => sql<number>`coalesce(sum(${coluna}), 0)::int`
  const [totais, quartos] = await Promise.all([
    db
      .select({
        jogoId: estatisticasJogo.jogoId,
        timeId: estatisticasJogo.timeId,
        pontos: soma(estatisticasJogo.pontos),
        rebotesTotal: soma(estatisticasJogo.rebotesTotal),
        assistencias: soma(estatisticasJogo.assistencias),
        cestasC: soma(estatisticasJogo.cestasC),
        cestasT: soma(estatisticasJogo.cestasT),
        tresC: soma(estatisticasJogo.tresC),
        tresT: soma(estatisticasJogo.tresT),
        turnovers: soma(estatisticasJogo.turnovers),
      })
      .from(estatisticasJogo)
      .where(and(inArray(estatisticasJogo.jogoId, idsJogo), isNotNull(estatisticasJogo.timeId)))
      .groupBy(estatisticasJogo.jogoId, estatisticasJogo.timeId),
    // O quarto é por jogador; o time vem da linha de jogo do MESMO jogador.
    db
      .select({
        jogoId: estatisticasQuarto.jogoId,
        timeId: estatisticasJogo.timeId,
        quarto: estatisticasQuarto.quarto,
        pontos: soma(estatisticasQuarto.pontos),
      })
      .from(estatisticasQuarto)
      .innerJoin(
        estatisticasJogo,
        and(
          eq(estatisticasJogo.jogoId, estatisticasQuarto.jogoId),
          eq(estatisticasJogo.jogadorId, estatisticasQuarto.jogadorId),
        ),
      )
      .where(and(inArray(estatisticasQuarto.jogoId, idsJogo), isNotNull(estatisticasJogo.timeId)))
      .groupBy(estatisticasQuarto.jogoId, estatisticasJogo.timeId, estatisticasQuarto.quarto),
  ])

  const mapa = new Map<string, BoxDoTime>()
  for (const t of totais) {
    mapa.set(chaveDoBox(t.jogoId, t.timeId!), {
      jogoId: t.jogoId,
      timeId: t.timeId!,
      pontos: t.pontos,
      porQuarto: null,
      rebotesTotal: t.rebotesTotal,
      assistencias: t.assistencias,
      cestasC: t.cestasC,
      cestasT: t.cestasT,
      tresC: t.tresC,
      tresT: t.tresT,
      turnovers: t.turnovers,
    })
  }
  for (const q of quartos) {
    const box = mapa.get(chaveDoBox(q.jogoId, q.timeId!))
    if (!box) continue
    // Só existe quebra quando há ao menos uma linha de quarto deste lado.
    const pq = (box.porQuarto ??= { q1: 0, q2: 0, q3: 0, q4: 0, prorrogacao: 0 })
    // 1..4 são os quartos; qualquer número acima é prorrogação.
    if (q.quarto === 1) pq.q1 += q.pontos
    else if (q.quarto === 2) pq.q2 += q.pontos
    else if (q.quarto === 3) pq.q3 += q.pontos
    else if (q.quarto === 4) pq.q4 += q.pontos
    else pq.prorrogacao += q.pontos
  }
  return mapa
}
