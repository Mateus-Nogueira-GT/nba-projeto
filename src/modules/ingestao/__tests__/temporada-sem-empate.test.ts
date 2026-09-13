import { readFileSync } from 'node:fs'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { classificacao, jogos } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { LLMFake } from '../llm'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8')), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('a temporada simulada não empata (diagnóstico de 13/09, B1)', () => {
  it('nenhum jogo encerrado tem placares iguais', async () => {
    const empatados = await banco.db
      .select({ id: jogos.id })
      .from(jogos)
      .where(
        and(eq(jogos.status, 'ENCERRADO'), sql`${jogos.placarCasa} = ${jogos.placarVisitante}`),
      )
    expect(empatados).toEqual([])
  })

  it('por time, vitórias + derrotas é o número de jogos encerrados', async () => {
    const encerrados = await banco.db
      .select({ casa: jogos.timeCasaId, visitante: jogos.timeVisitanteId })
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
    const jogosPorTime = new Map<string, number>()
    for (const j of encerrados)
      for (const t of [j.casa, j.visitante]) jogosPorTime.set(t, (jogosPorTime.get(t) ?? 0) + 1)
    const tabela = await banco.db.select().from(classificacao)
    expect(tabela.length).toBeGreaterThan(0)
    for (const linha of tabela)
      expect(linha.vitorias + linha.derrotas, `time ${linha.timeId}`).toBe(
        jogosPorTime.get(linha.timeId) ?? 0,
      )
  })
})
