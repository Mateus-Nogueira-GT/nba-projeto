import { and, desc, eq, lt } from 'drizzle-orm'

import type { Db } from '../dominio/db/tipos'
import { estatisticasJogo, jogos, mediasJogador } from '../dominio/db/schema'
import type { Atributo } from '../motor/tipos'

/**
 * A consulta COMPARTILHADA de histórico recente — o card (materialização) e o
 * detalhe do apito leem daqui, e por isso nunca discordam sobre os últimos 5.
 *
 * Leitura derivada: descreve jogos que aconteceram, não decide nada. Vive na
 * entrega, fora do motor.
 */

export type JogoRecente = {
  pontos: number
  rebotesTotal: number
  assistencias: number
  minutos: string | null
  dataHoraUtc: Date
  timeCasaId: string
  timeVisitanteId: string
}

/** Últimos `limite` jogos ANTERIORES a `corte`, do mais recente para o mais antigo. */
export async function jogosRecentes(
  db: Db,
  jogadorId: string,
  corte: Date,
  limite = 5,
): Promise<JogoRecente[]> {
  return db
    .select({
      pontos: estatisticasJogo.pontos,
      rebotesTotal: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
      minutos: estatisticasJogo.minutos,
      dataHoraUtc: jogos.dataHoraUtc,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
    .where(and(eq(estatisticasJogo.jogadorId, jogadorId), lt(jogos.dataHoraUtc, corte)))
    .orderBy(desc(jogos.dataHoraUtc))
    .limit(limite)
}

/** O valor do jogo no atributo do apito. */
export function valorDoJogo(
  row: { pontos: number; rebotesTotal: number; assistencias: number },
  atributo: Atributo,
): number {
  switch (atributo) {
    case 'PONTOS':
      return row.pontos
    case 'REBOTES':
      return row.rebotesTotal
    case 'ASSISTENCIAS':
      return row.assistencias
  }
}

/**
 * Confere cada jogo contra a linha (ou alvo do 1Q). Mantém a ordem recebida —
 * `jogosRecentes` entrega mais recente primeiro, que é a ordem do card.
 * Sem linha e sem alvo não há o que conferir: lista vazia, não "0 de 5".
 */
export function naLinha(
  rows: JogoRecente[],
  atributo: Atributo,
  linhaOuAlvo: number | null,
): { valor: number; bateu: boolean }[] {
  if (linhaOuAlvo === null) return []
  return rows.map((r) => {
    const valor = valorDoJogo(r, atributo)
    return { valor, bateu: valor >= linhaOuAlvo }
  })
}

/** A coluna da média que corresponde ao atributo do apito. */
export function colunaMedia(
  row: typeof mediasJogador.$inferSelect,
  atributo: Atributo,
): string | null {
  switch (atributo) {
    case 'PONTOS':
      return row.ppg
    case 'REBOTES':
      return row.rpg
    case 'ASSISTENCIAS':
      return row.apg
  }
}
