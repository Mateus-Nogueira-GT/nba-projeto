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
import { readFileSync } from 'node:fs'

import { carregarRuleset } from '../../motor/ruleset/carregar'
import { agregarCotacoes, coletarOdds } from '../odds/coletar'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

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

    const r1 = await coletarOdds(banco.db, fabricaCasas, 'balldontlie', HOJE, AGORA, ruleset)
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

    // caesars cotou 25.5→26 SOZINHA. Até 19/09 (`casas_minimas: 2`) a linha
    // não virava agregada e caía na tabela estática; com o produto em UMA
    // casa, ela vira cotação de verdade, com qtd_casas = 1 — e min, max e
    // média coincidem, porque há um número só.
    const [linha26] = await banco.db
      .select()
      .from(oddsAgregada)
      .where(and(eq(oddsAgregada.jogadorId, jogadorPontosId), eq(oddsAgregada.linha, '26.0')))
    expect(linha26).toBeDefined()
    expect(linha26!.origem).toBe('CASAS')
    expect(linha26!.qtdCasas).toBe(1)
    expect(Number(linha26!.oddMin)).toBe(Number(linha26!.oddMax))
    expect(Number(linha26!.oddMedia)).toBe(Number(linha26!.oddMin))

    // Retry no MESMO instante: nem agregada nem snapshot duplicam (regra 5 —
    // a UNIQUE com capturado_em impede o tique fantasma).
    //
    // A contagem de agregadas é LIDA antes, não fixada num literal: quantas
    // linhas agregam depende de `casas_minimas` no ruleset, e o que este
    // trecho protege é a IDEMPOTÊNCIA — o número não muda no retry.
    const antes = (await banco.db.select().from(oddsSnapshot)).length
    const agregadasAntes = (await banco.db.select().from(oddsAgregada)).filter(
      (a) => a.jogadorId === jogadorPontosId,
    ).length
    expect(agregadasAntes).toBeGreaterThan(0)
    await coletarOdds(banco.db, fabricaCasas, 'balldontlie', HOJE, AGORA, ruleset)
    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas.filter((a) => a.jogadorId === jogadorPontosId)).toHaveLength(agregadasAntes)
    expect((await banco.db.select().from(oddsSnapshot)).length).toBe(antes)
    // Coleta em instante NOVO: a série temporal cresce, de propósito.
    await coletarOdds(banco.db, fabricaCasas, 'balldontlie', HOJE, new Date(AGORA.getTime() + 60_000), ruleset)
    expect((await banco.db.select().from(oddsSnapshot)).length).toBeGreaterThan(antes)
  })
})

describe('errata pós-merge — coleta resiliente e honesta', () => {
  it('erro em um jogo não derruba os demais: conta em jogosComErro e segue', async () => {
    // segundo jogo do dia, com identidade — a fábrica explode só para ele
    const [lal] = await banco.db.select().from(times).limit(1)
    const [jogo2] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-08-25T22:00:00.000Z'),
        dataReferencia: HOJE,
        timeCasaId: lal!.id,
        timeVisitanteId: lal!.id,
      })
      .returning()
    await banco.db
      .insert(identidadesJogo)
      .values({ jogoId: jogo2!.id, provedor: 'balldontlie', idExterno: 'jogo-que-explode' })

    const fabrica = (gameIdExterno: string) => {
      if (gameIdExterno === 'jogo-que-explode') throw new Error('HTTP 429')
      return casasBalldontlie(async () => fixture as unknown, gameIdExterno)
    }
    const r = await coletarOdds(banco.db, fabrica, 'balldontlie', HOJE, AGORA, ruleset)
    expect(r.jogosComErro).toBe(1)
    expect(r.cotacoes).toBeGreaterThan(0) // o jogo saudável foi coletado
  })

  it('qtdCasas conta CASAS distintas, não cotações', () => {
    const r = agregarCotacoes([
      { oddOver: 1.9, casaNome: 'a' },
      { oddOver: 2.0, casaNome: 'a' }, // a mesma casa cotando duas vezes
      { oddOver: 2.1, casaNome: 'b' },
    ])
    expect(r.qtdCasas).toBe(2)
  })
})

