import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { apitos, estatisticasJogo, jogadores, jogos, times } from '../../dominio/db/schema'
import { apitosDoJogador } from '../estatisticas/jogador'
import { conferirRodadas, recapDaNoite, taxaDaTemporada, ultimaRodadaConferida } from '../resultados'

const DIA = '2026-09-05'
const AMANHA = '2026-09-06'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let jogoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, visitante] = await banco.db.insert(times).values([
    { sigla: 'BOS', nome: 'Boston' },
    { sigla: 'MIA', nome: 'Miami' },
  ]).returning()
  const [jogador] = await banco.db.insert(jogadores).values({
    nomeCompleto: 'Jogador da conferência', timeId: casa!.id,
  }).returning()
  jogadorId = jogador!.id
  const [jogo] = await banco.db.insert(jogos).values({
    dataReferencia: DIA, dataHoraUtc: new Date(`${DIA}T23:00:00Z`),
    timeCasaId: casa!.id, timeVisitanteId: visitante!.id,
    status: 'ENCERRADO', quartoAtual: 4,
  }).returning()
  jogoId = jogo!.id
  await banco.db.insert(apitos).values({
    jogoId, jogadorId, rulesetVersao: 'v1', atributo: 'PONTOS',
    estrategia: 'LISTA_SECRETA', metodo: 'OSCILACAO', nivelJogador: 'MVP',
    nivelApito: 1, linha: 20, confianca: '90',
  })
  await banco.db.insert(estatisticasJogo).values({ jogoId, jogadorId, minutos: '0', pontos: 0 })
})
afterAll(async () => banco.fechar())

describe('a mesma participação no perfil, recap e taxa da temporada', () => {
  it.each([
    { minutos: '0', pontos: 21, rebotes: 0, estado: 'CONFERIDO', fez: 21 },
    { minutos: '0', pontos: 0, rebotes: 1, estado: 'CONFERIDO', fez: 0 },
    { minutos: null, pontos: 21, rebotes: 0, estado: 'CONFERIDO', fez: 21 },
    { minutos: '1', pontos: 0, rebotes: 0, estado: 'CONFERIDO', fez: 0 },
    { minutos: '0', pontos: 0, rebotes: 0, estado: 'NAO_JOGOU', fez: null },
    { minutos: null, pontos: 0, rebotes: 0, estado: 'AGUARDANDO_OFICIAL', fez: null },
  ])('minutos=$minutos, pontos=$pontos, rebotes=$rebotes → $estado', async (caso) => {
    await banco.db.update(estatisticasJogo).set({
      minutos: caso.minutos, pontos: caso.pontos, rebotesTotal: caso.rebotes, assistencias: 0,
    }).where(eq(estatisticasJogo.jogoId, jogoId))

    const [perfil] = await apitosDoJogador(banco.db, jogadorId, 5)
    const [rodada] = await conferirRodadas(banco.db, AMANHA, 1)
    const recap = await recapDaNoite(banco.db, DIA)
    const taxa = await taxaDaTemporada(banco.db, AMANHA, 1)
    const ultima = await ultimaRodadaConferida(banco.db, DIA)
    const conferidos = caso.fez === null ? 0 : 1
    const acertos = caso.fez !== null && caso.fez >= 20 ? 1 : 0

    expect(perfil).toMatchObject({ estado: caso.estado, fez: caso.fez })
    expect(rodada!.jogadores[0]!.fez).toBe(perfil!.fez)
    expect(rodada!.conferidos).toBe(conferidos)
    expect(recap).toMatchObject({ conferidos, bateram: acertos })
    expect(taxa).toMatchObject({ conferidos, acertos, rodadas: conferidos })
    expect(ultima).toBe(conferidos === 1 ? DIA : null)
  })
})
