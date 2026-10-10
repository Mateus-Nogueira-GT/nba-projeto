import { and, desc, eq, gte, inArray, lte, or } from 'drizzle-orm'

import { jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { ConfrontoAnterior } from './jogo'

/**
 * OS JOGOS ENTRE DOIS TIMES na temporada — o "confronto" da comparação.
 *
 * É a mesma pergunta do `h2h` da página do jogo, mas para um par escolhido
 * pelo usuário e sem âncora num jogo: entram só os ENCERRADOS do período,
 * do mais recente ao mais antigo. Jogo em andamento tem placar parcial e não
 * é confronto decidido — fica de fora, como na coluna "Res" da página do time.
 */
export type Confrontos = { jogos: ConfrontoAnterior[]; vitoriasA: number; vitoriasB: number }

export async function confrontosEntre(
  db: Db,
  timeA: string,
  timeB: string,
  periodo: { de: string; ate: string },
): Promise<Confrontos> {
  const [linhas, siglas] = await Promise.all([
    db
      .select()
      .from(jogos)
      .where(
        and(
          eq(jogos.status, 'ENCERRADO'),
          gte(jogos.dataReferencia, periodo.de),
          lte(jogos.dataReferencia, periodo.ate),
          or(
            and(eq(jogos.timeCasaId, timeA), eq(jogos.timeVisitanteId, timeB)),
            and(eq(jogos.timeCasaId, timeB), eq(jogos.timeVisitanteId, timeA)),
          ),
        ),
      )
      .orderBy(desc(jogos.dataHoraUtc)),
    db.select({ id: times.id, sigla: times.sigla }).from(times).where(inArray(times.id, [timeA, timeB])),
  ])
  const sigla = new Map(siglas.map((t) => [t.id, t.sigla] as const))

  let vitoriasA = 0
  let vitoriasB = 0
  const lista: ConfrontoAnterior[] = []
  for (const j of linhas) {
    if (j.placarCasa === null || j.placarVisitante === null) continue
    const vencedor = j.placarCasa > j.placarVisitante ? j.timeCasaId : j.timeVisitanteId
    if (vencedor === timeA) vitoriasA += 1
    else vitoriasB += 1
    lista.push({
      jogoId: j.id,
      data: j.dataHoraUtc,
      placarCasa: j.placarCasa,
      placarVisitante: j.placarVisitante,
      siglaCasa: sigla.get(j.timeCasaId) ?? '—',
      siglaVisitante: sigla.get(j.timeVisitanteId) ?? '—',
    })
  }
  return { jogos: lista, vitoriasA, vitoriasB }
}
