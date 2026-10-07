import { and, eq, gte, lt } from 'drizzle-orm'

import { estatisticasTimeJogo, jogos, times } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'

/**
 * MATCHUP — o DADO, sem regra (reunião de 23/09; spec 2026-10-06-ajustes, §3).
 *
 * O CJ descreveu matchup como "enfrentar um time que cede muitos pontos ou
 * erra muitas bolas de 3 — sobra rebote e ponto". Ele não deu limites, então
 * nada aqui apita, nem mexe em apito (`matchup.habilitado` segue `false`):
 * são três números do adversário com a posição na liga, para o usuário ler.
 *
 * Dado canônico (`estatisticas_time_jogo`, o time REAL do provedor), como a
 * aba de estatísticas. Só jogos ENCERRADOS da temporada e ANTERIORES à data
 * do apito — o jogo do próprio dia ainda não aconteceu.
 */
export type Marca = { valor: number; posicao: number }

export type PerfilAdversario = {
  sigla: string
  jogos: number
  /** Times com ao menos um jogo no período — o "de N" da posição. */
  totalTimes: number
  pontosCedidos: Marca
  /** As bolas de 3 que o PRÓPRIO adversário erra: viram rebote. */
  tresErradas: Marca
  rebotesCedidos: Marca
}

type Soma = { jogos: number; pontosCedidos: number; tresErradas: number; rebotesCedidos: number }

export async function perfilDoAdversario(
  db: Db,
  adversarioSigla: string,
  dataReferencia: string,
  inicioTemporada: string,
): Promise<PerfilAdversario | null> {
  const linhas = await db
    .select({
      jogoId: estatisticasTimeJogo.jogoId,
      sigla: times.sigla,
      pontos: estatisticasTimeJogo.pontos,
      rebotes: estatisticasTimeJogo.rebotesTotal,
      tresC: estatisticasTimeJogo.tresC,
      tresT: estatisticasTimeJogo.tresT,
    })
    .from(estatisticasTimeJogo)
    .innerJoin(jogos, eq(jogos.id, estatisticasTimeJogo.jogoId))
    .innerJoin(times, eq(times.id, estatisticasTimeJogo.timeId))
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        gte(jogos.dataReferencia, inicioTemporada),
        lt(jogos.dataReferencia, dataReferencia),
      ),
    )

  const porJogo = new Map<string, typeof linhas>()
  for (const l of linhas) porJogo.set(l.jogoId, [...(porJogo.get(l.jogoId) ?? []), l])

  const somas = new Map<string, Soma>()
  for (const lados of porJogo.values()) {
    if (lados.length !== 2) continue // box incompleto não entra na média
    const [a, b] = lados as [(typeof linhas)[number], (typeof linhas)[number]]
    for (const [time, outro] of [
      [a, b],
      [b, a],
    ] as const) {
      const s = somas.get(time.sigla) ?? { jogos: 0, pontosCedidos: 0, tresErradas: 0, rebotesCedidos: 0 }
      s.jogos += 1
      s.pontosCedidos += outro.pontos
      s.tresErradas += time.tresT - time.tresC
      s.rebotesCedidos += outro.rebotes
      somas.set(time.sigla, s)
    }
  }

  const proprio = somas.get(adversarioSigla)
  if (!proprio) return null

  const medias = [...somas.entries()].map(([sigla, s]) => ({
    sigla,
    pontosCedidos: s.pontosCedidos / s.jogos,
    tresErradas: s.tresErradas / s.jogos,
    rebotesCedidos: s.rebotesCedidos / s.jogos,
  }))
  const marca = (campo: 'pontosCedidos' | 'tresErradas' | 'rebotesCedidos'): Marca => {
    const valor = proprio[campo] / proprio.jogos
    // Posição 1 = quem MAIS cede/erra; empate divide a mesma posição.
    return { valor, posicao: 1 + medias.filter((m) => m[campo] > valor).length }
  }

  return {
    sigla: adversarioSigla,
    jogos: proprio.jogos,
    totalTimes: somas.size,
    pontosCedidos: marca('pontosCedidos'),
    tresErradas: marca('tresErradas'),
    rebotesCedidos: marca('rebotesCedidos'),
  }
}

/** Primeiro dia da temporada pelo rótulo ("2025-26" → "2025-10-01"). */
export function inicioDaTemporada(rotulo: string, mesInicio: number): string {
  return `${rotulo.slice(0, 4)}-${String(mesInicio).padStart(2, '0')}-01`
}
