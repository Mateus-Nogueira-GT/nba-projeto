import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  identidadesJogador,
  identidadesJogo,
  jogadores,
  jogos,
  oddsAgregada,
  oddsSnapshot,
  times,
} from '../../dominio/db/schema'
import fixture from '../odds/__fixtures__/balldontlie-player-props.json'
import { casasBalldontlie } from '../odds/balldontlie-props'
import { agregarCotacoes, coletarOdds } from '../odds/coletar'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorPontosId: string

const HOJE = '2026-08-25'
const AGORA = new Date('2026-08-25T15:00:00.000Z')

beforeAll(async () => {
  banco = await bancoDeTeste()
  const db = banco.db
  const [lal] = await db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [den] = await db.insert(times).values({ sigla: 'DEN', nome: 'Nuggets' }).returning()
  const [jogo] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-08-25T23:00:00.000Z'),
      dataReferencia: HOJE,
      timeCasaId: lal!.id,
      timeVisitanteId: den!.id,
    })
    .returning()
  // A identidade externa é o elo entre o jogo canônico e o game_id do provedor.
  await db
    .insert(identidadesJogo)
    .values({ jogoId: jogo!.id, provedor: 'balldontlie', idExterno: '15908525' })

  const [p1] = await db.insert(jogadores).values({ nomeCompleto: 'Luka Doncic' }).returning()
  const [p2] = await db.insert(jogadores).values({ nomeCompleto: 'Jokic' }).returning()
  jogadorPontosId = p1!.id
  await db.insert(identidadesJogador).values([
    { jogadorId: p1!.id, provedor: 'balldontlie', idExterno: '237' },
    { jogadorId: p2!.id, provedor: 'balldontlie', idExterno: '115' },
    // player_id 999 da fixture fica SEM identidade de propósito
  ])
})
afterAll(async () => {
  await banco.fechar()
})

describe('agregarCotacoes (pura)', () => {
  it('média simples das decimais over, com min/max/qtd', () => {
    const r = agregarCotacoes([{ oddOver: 1.91 }, { oddOver: 2.5 }, { oddOver: 1.5 }])
    expect(r.media).toBe(1.97)
    expect(r.min).toBe(1.5)
    expect(r.max).toBe(2.5)
    expect(r.qtd).toBe(3)
  })

  it('nulls não contam nem afundam a média', () => {
    const r = agregarCotacoes([{ oddOver: 2 }, { oddOver: null }])
    expect(r.media).toBe(2)
    expect(r.qtd).toBe(1)
  })
})

describe('coletarOdds (ponta a ponta com a fixture)', () => {
  it('grava snapshot por casa e agregada com a MÉDIA; sem vínculo conta e pula; reexecutar não duplica', async () => {
    const fabricaCasas = (gameIdExterno: string) =>
      casasBalldontlie(async () => fixture as unknown, gameIdExterno)

    const r1 = await coletarOdds(banco.db, fabricaCasas, 'balldontlie', HOJE, AGORA)
    // 5 traduzidas; a do player 999 (sem identidade) morre no vínculo
    expect(r1.cotacoes).toBe(4)
    expect(r1.semVinculo).toBe(1)
    expect(r1.descartadas).toBe(2)

    // Luka PONTOS: draftkings 25@1.91 e fanduel 25@2.50 → média 2.205 na linha 25
    const [agregada] = await banco.db
      .select()
      .from(oddsAgregada)
      .where(and(eq(oddsAgregada.jogadorId, jogadorPontosId), eq(oddsAgregada.linha, '25.0')))
    expect(agregada).toBeDefined()
    expect(Number(agregada!.oddMedia)).toBeCloseTo(2.21, 2)
    expect(agregada!.qtdCasas).toBe(2)
    expect(Number(agregada!.oddMin)).toBe(1.91)
    expect(Number(agregada!.oddMax)).toBe(2.5)

    // caesars cotou 25.5→26: linha separada, média própria
    const [linha26] = await banco.db
      .select()
      .from(oddsAgregada)
      .where(and(eq(oddsAgregada.jogadorId, jogadorPontosId), eq(oddsAgregada.linha, '26.0')))
    expect(linha26!.qtdCasas).toBe(1)

    // Reexecução: upsert, não duplicação
    const antes = (await banco.db.select().from(oddsSnapshot)).length
    await coletarOdds(banco.db, fabricaCasas, 'balldontlie', HOJE, AGORA)
    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas.filter((a) => a.jogadorId === jogadorPontosId)).toHaveLength(2)
    // snapshot é série temporal: cresce a cada coleta, de propósito
    expect((await banco.db.select().from(oddsSnapshot)).length).toBeGreaterThan(antes)
  })
})
