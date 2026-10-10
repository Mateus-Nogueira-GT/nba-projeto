import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  times,
} from '../../dominio/db/schema'
import { lerFeedFireLive } from '../fire-live/leitura'

/**
 * O PLACAR DO CARD DO FIRE LIVE É O DO 1º QUARTO — inclusive depois dele.
 *
 * Durante o Q1 é o placar vivo do jogo. Depois, a quebra oficial: a linha de
 * `estatisticas_time_jogo` (que a BallDontLie preenche pelo endpoint de jogos)
 * e, sem ela, a soma do Q1 dos jogadores. Sem nenhum dos dois, "—" (null).
 */
const DIA = '2026-08-19'
const QUARTO = 1

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string
let casaId: string
let visitanteId: string
let jogadorCasa: string
let jogadorVisitante: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

beforeEach(async () => {
  const db = banco.db
  await db.delete(estatisticasQuarto)
  await db.delete(estatisticasJogo)
  await db.delete(estatisticasTimeJogo)
  await db.delete(jogos)
  await db.delete(jogadores)
  await db.delete(times)

  const [casa, visitante] = await db
    .insert(times)
    .values([
      { sigla: 'LAL', nome: 'Lakers' },
      { sigla: 'BOS', nome: 'Celtics' },
    ])
    .returning()
  casaId = casa!.id
  visitanteId = visitante!.id
  const [jc, jv] = await db
    .insert(jogadores)
    .values([
      { nomeCompleto: 'Da casa', timeId: casaId },
      { nomeCompleto: 'Visitante', timeId: visitanteId },
    ])
    .returning()
  jogadorCasa = jc!.id
  jogadorVisitante = jv!.id
  const [jogo] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-08-19T23:00:00.000Z'),
      dataReferencia: DIA,
      timeCasaId: casaId,
      timeVisitanteId: visitanteId,
      status: 'AO_VIVO',
      quartoAtual: 3,
      placarCasa: 80,
      placarVisitante: 77,
    })
    .returning()
  jogoId = jogo!.id
})

async function placar() {
  const feed = await lerFeedFireLive(banco.db, DIA, QUARTO)
  const j = feed.jogos.find((x) => x.id === jogoId)!
  return { casa: j.placarCasa, visitante: j.placarVisitante }
}

async function quartosDosJogadores(casaQ1: number, visitanteQ1: number) {
  await banco.db.insert(estatisticasJogo).values([
    { jogoId, jogadorId: jogadorCasa, timeId: casaId, pontos: 40 },
    { jogoId, jogadorId: jogadorVisitante, timeId: visitanteId, pontos: 35 },
  ])
  await banco.db.insert(estatisticasQuarto).values([
    { jogoId, jogadorId: jogadorCasa, quarto: 1, pontos: casaQ1 },
    { jogoId, jogadorId: jogadorCasa, quarto: 2, pontos: 9 },
    { jogoId, jogadorId: jogadorVisitante, quarto: 1, pontos: visitanteQ1 },
  ])
}

describe('placar do card depois do 1º quarto', () => {
  it('AO_VIVO no Q3 com linha de time: placar = pontos_q1 da linha', async () => {
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 80, pontosQ1: 31, pontosQ2: 27 },
      { jogoId, timeId: visitanteId, pontos: 77, pontosQ1: 24, pontosQ2: 30 },
    ])
    expect(await placar()).toEqual({ casa: 31, visitante: 24 })
  })

  it('a linha de time tem prioridade sobre a soma dos jogadores', async () => {
    await quartosDosJogadores(12, 10)
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 80, pontosQ1: 31 },
      { jogoId, timeId: visitanteId, pontos: 77, pontosQ1: 24 },
    ])
    expect(await placar()).toEqual({ casa: 31, visitante: 24 })
  })

  it('ENCERRADO sem linha de time, com quartos de jogador: soma do Q1 dos jogadores', async () => {
    await banco.db
      .update(jogos)
      .set({ status: 'ENCERRADO', quartoAtual: 4 })
      .where(eq(jogos.id, jogoId))
    await quartosDosJogadores(12, 10)
    expect(await placar()).toEqual({ casa: 12, visitante: 10 })
  })

  it('sem linha de time e sem quarto de jogador: null ("—"), nunca 0', async () => {
    expect(await placar()).toEqual({ casa: null, visitante: null })
  })

  it('durante o Q1 continua o placar vivo do jogo, mesmo havendo linha de time', async () => {
    await banco.db
      .update(jogos)
      .set({ quartoAtual: QUARTO, placarCasa: 14, placarVisitante: 11 })
      .where(eq(jogos.id, jogoId))
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 14, pontosQ1: 9 },
      { jogoId, timeId: visitanteId, pontos: 11, pontosQ1: 8 },
    ])
    expect(await placar()).toEqual({ casa: 14, visitante: 11 })
  })
})
