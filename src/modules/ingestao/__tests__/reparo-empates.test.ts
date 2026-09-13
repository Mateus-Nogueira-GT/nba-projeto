import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogos, times } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import { rulesetAtivo } from '../../entrega/ruleset-ativo'
import { LLMFake } from '../llm'
import { decomporPontos } from '../demo/dados'
import { semearPlacares } from '../demo/jogos'
import { repararEmpates } from '../demo/reparo-empates'
import { criarSorteio, desempatar, SEMENTE_TEMPORADA } from '../demo/simulacao'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let ruleset: Awaited<ReturnType<typeof rulesetAtivo>>
let hoje: string

/** As linhas do jogo com o time pelo vínculo da LISTA (o mesmo join de `semearPlacares`). */
async function linhasPorLado(jogoId: string, timeCasaId: string) {
  const r = await banco.db.execute(sql`
    select ej.id, ej.pontos::int as pontos, n.time_id
      from estatisticas_jogo ej
      join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
      join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
     where ej.jogo_id = ${jogoId}
  `)
  const linhas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as {
    id: string
    pontos: number
    time_id: string
  }[]
  return {
    casa: linhas.filter((l) => l.time_id === timeCasaId),
    visitante: linhas.filter((l) => l.time_id !== timeCasaId),
  }
}
const soma = (l: { pontos: number }[]) => l.reduce((t, x) => t + x.pontos, 0)

beforeAll(async () => {
  banco = await bancoDeTeste()
  ruleset = await rulesetAtivo()
  hoje = dataDeReferencia(AGORA, ruleset.rodada.fuso)
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7, llm: new LLMFake() })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('repararEmpates — o passado empatado recebe a MESMA decisão que o gerador daria', () => {
  it('sem empate, não encontra nem escreve nada', async () => {
    const r = await repararEmpates(banco.db, ruleset, { hoje })
    expect(r).toMatchObject({ encontrados: 0, reparados: 0 })
    expect(r.classificacao.empates).toBe(0)
  })

  it('repara um empate plantado, com a escolha do `desempatar` puro, e a segunda execução não faz nada', async () => {
    const [jogo] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
      .limit(1)
    expect(jogo).toBeDefined()
    const lados = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    expect(lados.casa.length).toBeGreaterThan(0)
    expect(lados.visitante.length).toBeGreaterThan(0)

    // PLANTA o empate no box (não só no placar): o lado mais fraco recebe a
    // diferença no seu maior pontuador, desdobramento refeito — e o placar é
    // recomputado do box, como em produção.
    const diff = soma(lados.casa) - soma(lados.visitante)
    const fraco = diff > 0 ? lados.visitante : lados.casa
    const alvo = fraco.reduce((m, l) => (l.pontos > m.pontos ? l : m))
    const novo = alvo.pontos + Math.abs(diff)
    await banco.db
      .update(estatisticasJogo)
      .set({ pontos: novo, ...decomporPontos(novo) })
      .where(eq(estatisticasJogo.id, alvo.id))
    await semearPlacares(banco.db, [jogo!.id])
    const [empatado] = await banco.db.select().from(jogos).where(eq(jogos.id, jogo!.id))
    expect(empatado!.placarCasa).toBe(empatado!.placarVisitante)

    // O que o gerador decidiria com a mesma chave:
    const [casa] = await banco.db
      .select({ sigla: times.sigla })
      .from(times)
      .where(eq(times.id, jogo!.timeCasaId))
    const [visitante] = await banco.db
      .select({ sigla: times.sigla })
      .from(times)
      .where(eq(times.id, jogo!.timeVisitanteId))
    const antes = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    const esperado = desempatar(
      antes.casa,
      antes.visitante,
      criarSorteio(
        `${SEMENTE_TEMPORADA}|${jogo!.dataReferencia}|${casa!.sigla}x${visitante!.sigla}|desempate`,
      ),
    )

    const r = await repararEmpates(banco.db, ruleset, { hoje })
    expect(r).toMatchObject({ encontrados: 1, reparados: 1 })
    expect(r.classificacao.empates).toBe(0)
    const [reparado] = await banco.db.select().from(jogos).where(eq(jogos.id, jogo!.id))
    expect(reparado!.placarCasa).not.toBe(reparado!.placarVisitante)
    const depois = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    expect(soma(depois.casa)).toBe(soma(esperado.casa))
    expect(soma(depois.visitante)).toBe(soma(esperado.visitante))
    // placar continua sendo a soma do box
    expect(reparado!.placarCasa).toBe(soma(depois.casa))
    expect(reparado!.placarVisitante).toBe(soma(depois.visitante))

    const segunda = await repararEmpates(banco.db, ruleset, { hoje })
    expect(segunda).toMatchObject({ encontrados: 0, reparados: 0 })
  })
})
