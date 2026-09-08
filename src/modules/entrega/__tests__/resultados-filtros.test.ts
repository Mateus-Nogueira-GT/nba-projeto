import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { conferirFireLive, filtrarRecapDaNoite, recapDaNoite } from '../resultados'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let casaId: string
let foraId: string
let atleta: string
const DATA = '2026-01-30'

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, fora] = await banco.db
    .insert(times)
    .values([
      { sigla: 'BOS', nome: 'Boston Celtics' },
      { sigla: 'NYK', nome: 'New York Knicks' },
    ])
    .returning()
  casaId = casa!.id
  foraId = fora!.id
  const [jogador, semQuarto] = await banco.db
    .insert(jogadores)
    .values([
      { nomeCompleto: 'Atleta', timeId: casaId },
      { nomeCompleto: 'Sem quarto', timeId: casaId },
    ])
    .returning()
  atleta = jogador!.id
  const [versao] = await banco.db
    .insert(niveisVersao)
    .values({ versao: 'teste', ativa: true })
    .returning()
  await banco.db.insert(niveis).values([
    {
      niveisVersaoId: versao!.id,
      jogadorId: atleta,
      timeId: casaId,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: versao!.id,
      jogadorId: atleta,
      timeId: foraId,
      atributo: 'REBOTES',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
  ])
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      timeCasaId: casaId,
      timeVisitanteId: foraId,
      dataReferencia: DATA,
      dataHoraUtc: new Date(`${DATA}T20:00:00Z`),
      status: 'ENCERRADO',
    })
    .returning()
  const base = {
    jogoId: jogo!.id,
    jogadorId: atleta,
    rulesetVersao: 'teste',
    nivelJogador: 'MVP' as const,
    nivelApito: 1,
  }
  await banco.db.insert(apitos).values([
    { ...base, estrategia: 'LISTA_SECRETA', atributo: 'PONTOS', linha: 20 },
    { ...base, estrategia: 'LISTA_SECRETA', atributo: 'PONTOS', linha: 35 },
    { ...base, estrategia: 'LISTA_SECRETA', atributo: 'REBOTES', linha: 8 },
    { ...base, estrategia: 'FIRE_LIVE', atributo: 'PONTOS', alvo1q: 5 },
    { ...base, estrategia: 'FIRE_LIVE', atributo: 'REBOTES', alvo1q: null },
    { ...base, jogadorId: semQuarto!.id, estrategia: 'FIRE_LIVE', atributo: 'PONTOS', alvo1q: 5 },
  ])
  await banco.db.insert(estatisticasJogo).values([
    { jogoId: jogo!.id, jogadorId: atleta, minutos: '30', pontos: 30, rebotesTotal: 3 },
    { jogoId: jogo!.id, jogadorId: semQuarto!.id, minutos: '30', pontos: 30 },
  ])
  await banco.db
    .insert(estatisticasQuarto)
    .values({ jogoId: jogo!.id, jogadorId: atleta, quarto: 1, minutos: '8', pontos: 4, rebotes: 3 })
})
afterAll(async () => {
  await banco.fechar()
})

describe('Resultados · filtros e período', () => {
  it('filtra atributos/time editorial e recalcula o denominador por card, sem contar cada linha', async () => {
    const inteiro = await recapDaNoite(banco.db, DATA)
    expect(inteiro.publicados).toBe(2)
    const pontos = filtrarRecapDaNoite(inteiro, { atributo: 'PONTOS', timeId: casaId })
    expect(pontos).toMatchObject({ publicados: 1, conferidos: 1, bateram: 1, taxa: 1 })
    expect(pontos.porJogo[0]!.cards[0]).toMatchObject({
      jogadorId: atleta,
      linhaConferida: 20,
      fez: 30,
    })
    const rebotes = filtrarRecapDaNoite(inteiro, { atributo: 'REBOTES', timeId: foraId })
    expect(rebotes).toMatchObject({ publicados: 1, conferidos: 1, bateram: 0, taxa: 0 })
  })

  it('confere alvo Q1 somente contra Q1 e mantém alvo/dado ausentes explícitos', async () => {
    const cards = await conferirFireLive(banco.db, DATA)
    expect(cards).toHaveLength(3)
    expect(cards.find((c) => c.jogadorId === atleta && c.atributo === 'PONTOS')).toMatchObject({
      alvo: 5,
      valor: 4,
      bateu: false,
      estado: 'CONFERIDO',
    })
    expect(cards.find((c) => c.atributo === 'REBOTES')).toMatchObject({
      alvo: null,
      valor: 3,
      bateu: null,
    })
    expect(cards.find((c) => c.jogadorId !== atleta)).toMatchObject({
      valor: null,
      bateu: null,
      estado: 'PENDENTE',
    })
  })
})
