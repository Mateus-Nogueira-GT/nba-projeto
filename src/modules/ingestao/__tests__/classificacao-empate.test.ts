import { and, eq, isNotNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { classificacao, jogos } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import { rulesetAtivo } from '../../entrega/ruleset-ativo'
import { LLMFake } from '../llm'
import { semearClassificacao } from '../demo/jogos'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let ruleset: Awaited<ReturnType<typeof rulesetAtivo>>
let hoje: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  ruleset = await rulesetAtivo()
  hoje = dataDeReferencia(AGORA, ruleset.rodada.fuso)
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7, llm: new LLMFake() })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('semearClassificacao — empate é estado inválido, não derrota', () => {
  it('sem empate, devolve empates: 0 e o número de linhas', async () => {
    const r = await semearClassificacao(banco.db, ruleset, hoje)
    expect(r.empates).toBe(0)
    expect(r.linhas).toBe((await banco.db.select().from(classificacao)).length)
  })

  it('um empate plantado é contado e não vira vitória nem derrota de ninguém', async () => {
    const [jogo] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
      .limit(1)
    expect(jogo).toBeDefined()
    const antes = new Map(
      (await banco.db.select().from(classificacao)).map((l) => [l.timeId, l] as const),
    )
    const casaAntes = antes.get(jogo!.timeCasaId)!
    const visitanteAntes = antes.get(jogo!.timeVisitanteId)!
    const casaVenceu = jogo!.placarCasa! > jogo!.placarVisitante!

    // Planta o empate direto no placar (só para este teste; o gerador não produz).
    await banco.db
      .update(jogos)
      .set({ placarVisitante: jogo!.placarCasa })
      .where(eq(jogos.id, jogo!.id))
    try {
      const r = await semearClassificacao(banco.db, ruleset, hoje)
      expect(r.empates).toBe(1)
      const depois = new Map(
        (await banco.db.select().from(classificacao)).map((l) => [l.timeId, l] as const),
      )
      // Quem tinha vencido perde a vitória; quem tinha perdido perde a derrota —
      // e ninguém ganha nada em troca.
      const casaDepois = depois.get(jogo!.timeCasaId)!
      const visitanteDepois = depois.get(jogo!.timeVisitanteId)!
      expect(casaDepois.vitorias).toBe(casaAntes.vitorias - (casaVenceu ? 1 : 0))
      expect(casaDepois.derrotas).toBe(casaAntes.derrotas - (casaVenceu ? 0 : 1))
      expect(visitanteDepois.vitorias).toBe(visitanteAntes.vitorias - (casaVenceu ? 0 : 1))
      expect(visitanteDepois.derrotas).toBe(visitanteAntes.derrotas - (casaVenceu ? 1 : 0))
    } finally {
      await banco.db
        .update(jogos)
        .set({ placarVisitante: jogo!.placarVisitante })
        .where(eq(jogos.id, jogo!.id))
      await semearClassificacao(banco.db, ruleset, hoje)
    }
  })
})
