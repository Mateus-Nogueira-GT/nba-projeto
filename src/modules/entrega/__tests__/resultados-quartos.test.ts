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
import { recapDosCards, type JogadorConferido } from '../resultados'

/**
 * A QUEBRA POR QUARTO DO RESULTADO. A linha de `estatisticas_time_jogo`
 * (pontos por quarto do endpoint de jogos) primeiro; sem ela, a soma dos
 * quartos dos jogadores; sem nenhuma, [].
 */
const DIA = '2026-08-19'

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
      status: 'ENCERRADO',
      quartoAtual: 4,
      placarCasa: 110,
      placarVisitante: 100,
    })
    .returning()
  jogoId = jogo!.id
})

function card(): JogadorConferido {
  return {
    chave: `${jogoId}|${jogadorCasa}|PONTOS`,
    jogoId,
    jogadorId: jogadorCasa,
    nome: 'Da casa',
    timeId: casaId,
    timeSigla: 'LAL',
    fotoUrl: null,
    atributo: 'PONTOS',
    nivelJogador: 'MVP',
    nivelApito: 1,
    turbo: false,
    linhas: [{ linha: 20, confianca: null, bateu: true }],
    linhaConferida: 20,
    valor: 30,
    maiorLinhaBatida: 20,
    fez: 30,
    bateuLinhaMaisBaixa: true,
  }
}

async function quartos() {
  const recap = await recapDosCards(banco.db, DIA, [card()])
  const { quartosCasa, quartosVisitante } = recap.porJogo[0]!.jogo
  return { quartosCasa, quartosVisitante }
}

describe('quartos do jogo no Resultado', () => {
  it('vêm da linha de time quando ela existe', async () => {
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 110, pontosQ1: 29, pontosQ2: 34, pontosQ3: 23, pontosQ4: 24 },
      { jogoId, timeId: visitanteId, pontos: 100, pontosQ1: 23, pontosQ2: 25, pontosQ3: 25, pontosQ4: 27 },
    ])
    expect(await quartos()).toEqual({
      quartosCasa: [29, 34, 23, 24],
      quartosVisitante: [23, 25, 25, 27],
    })
  })

  it('sem linha de time, da soma dos quartos dos jogadores', async () => {
    await banco.db.insert(estatisticasJogo).values([
      { jogoId, jogadorId: jogadorCasa, timeId: casaId, pontos: 30 },
      { jogoId, jogadorId: jogadorVisitante, timeId: visitanteId, pontos: 20 },
    ])
    await banco.db.insert(estatisticasQuarto).values([
      { jogoId, jogadorId: jogadorCasa, quarto: 1, pontos: 8 },
      { jogoId, jogadorId: jogadorCasa, quarto: 2, pontos: 7 },
      { jogoId, jogadorId: jogadorCasa, quarto: 3, pontos: 9 },
      { jogoId, jogadorId: jogadorCasa, quarto: 4, pontos: 6 },
      { jogoId, jogadorId: jogadorVisitante, quarto: 1, pontos: 5 },
      { jogoId, jogadorId: jogadorVisitante, quarto: 3, pontos: 15 },
    ])
    expect(await quartos()).toEqual({
      quartosCasa: [8, 7, 9, 6],
      quartosVisitante: [5, 0, 15, 0],
    })
  })

  it('jogo ao vivo mostra só os quartos já fechados — nunca o "0" de quarto que não começou', async () => {
    await banco.db.update(jogos).set({ status: 'AO_VIVO', quartoAtual: 3 })
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 61, pontosQ1: 31, pontosQ2: 30 },
      { jogoId, timeId: visitanteId, pontos: 55, pontosQ1: 27, pontosQ2: 28 },
    ])
    expect(await quartos()).toEqual({
      quartosCasa: [31, 30],
      quartosVisitante: [27, 28],
    })
  })

  it('jogo no 1º quarto não mostra quebra nenhuma', async () => {
    await banco.db.update(jogos).set({ status: 'AO_VIVO', quartoAtual: 1 })
    await banco.db.insert(estatisticasTimeJogo).values([
      { jogoId, timeId: casaId, pontos: 12, pontosQ1: 12 },
      { jogoId, timeId: visitanteId, pontos: 9, pontosQ1: 9 },
    ])
    expect(await quartos()).toEqual({ quartosCasa: [], quartosVisitante: [] })
  })

  it('sem nenhum dos dois, []', async () => {
    expect(await quartos()).toEqual({ quartosCasa: [], quartosVisitante: [] })
  })
})
