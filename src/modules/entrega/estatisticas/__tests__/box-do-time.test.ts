import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  times,
} from '../../../dominio/db/schema'
import { boxDoTimePorJogo } from '../box-do-time'
import { telaDoJogo } from '../jogo'
import { telaDoTime } from '../time'

/**
 * A BallDontLie não tem box de time: `estatisticas_time_jogo` ficou com 0
 * linhas em produção (09/10/2026). O box do time é a SOMA do box dos
 * jogadores, por (jogo, time em que atuaram).
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const id: Record<string, string> = {}

beforeAll(async () => {
  banco = await bancoDeTeste()
  for (const sigla of ['AAA', 'BBB']) {
    const [t] = await banco.db.insert(times).values({ sigla, nome: sigla }).returning()
    id[sigla] = t!.id
  }
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataReferencia: '2025-11-01',
      dataHoraUtc: new Date('2025-11-01T23:00:00Z'),
      timeCasaId: id.AAA!,
      timeVisitanteId: id.BBB!,
      status: 'ENCERRADO',
      placarCasa: 101,
      placarVisitante: 90,
    })
    .returning()
  id.jogo = jogo!.id
  // Dois jogadores do AAA, um do BBB e um SEM time_id (linha anterior à 0033).
  const [a1, a2, b1, semTime] = await banco.db
    .insert(jogadores)
    .values([
      { nomeCompleto: 'A Um', timeId: id.AAA! },
      { nomeCompleto: 'A Dois', timeId: id.AAA! },
      { nomeCompleto: 'B Um', timeId: id.BBB! },
      { nomeCompleto: 'Sem Time', timeId: null },
    ])
    .returning()
  await banco.db.insert(estatisticasJogo).values([
    { jogoId: id.jogo!, jogadorId: a1!.id, timeId: id.AAA!, pontos: 60, rebotesTotal: 20, assistencias: 10, cestasC: 20, cestasT: 40, tresC: 5, tresT: 10, turnovers: 3 },
    { jogoId: id.jogo!, jogadorId: a2!.id, timeId: id.AAA!, pontos: 41, rebotesTotal: 25, assistencias: 12, cestasC: 15, cestasT: 30, tresC: 3, tresT: 12, turnovers: 4 },
    { jogoId: id.jogo!, jogadorId: b1!.id, timeId: id.BBB!, pontos: 90, rebotesTotal: 40, assistencias: 20, cestasC: 35, cestasT: 80, tresC: 10, tresT: 30, turnovers: 9 },
    { jogoId: id.jogo!, jogadorId: semTime!.id, timeId: null, pontos: 999, rebotesTotal: 0, assistencias: 0, cestasC: 0, cestasT: 0, tresC: 0, tresT: 0, turnovers: 0 },
  ])
  await banco.db.insert(estatisticasQuarto).values([
    // Linha de quarto do jogador sem time_id: não pode cair em lado nenhum.
    { jogoId: id.jogo!, jogadorId: semTime!.id, quarto: 1, pontos: 999, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a1!.id, quarto: 1, pontos: 30, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a1!.id, quarto: 2, pontos: 30, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a2!.id, quarto: 3, pontos: 21, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a2!.id, quarto: 4, pontos: 20, rebotes: 0, assistencias: 0 },
  ])
  // Um jogo AO VIVO com box de jogador e nenhuma linha de quarto, e um
  // encerrado na prorrogação (quarto 5).
  const [aoVivo, prorrogado] = await banco.db
    .insert(jogos)
    .values([
      {
        dataReferencia: '2025-11-03',
        dataHoraUtc: new Date('2025-11-03T23:00:00Z'),
        timeCasaId: id.AAA!,
        timeVisitanteId: id.BBB!,
        status: 'AO_VIVO',
        placarCasa: 17,
        placarVisitante: 15,
      },
      {
        dataReferencia: '2025-11-05',
        dataHoraUtc: new Date('2025-11-05T23:00:00Z'),
        timeCasaId: id.AAA!,
        timeVisitanteId: id.BBB!,
        status: 'ENCERRADO',
        placarCasa: 112,
        placarVisitante: 110,
      },
    ])
    .returning()
  id.aoVivo = aoVivo!.id
  id.prorrogado = prorrogado!.id
  const zerado = { rebotesTotal: 0, assistencias: 0, cestasC: 0, cestasT: 0, tresC: 0, tresT: 0, turnovers: 0 }
  await banco.db.insert(estatisticasJogo).values([
    { jogoId: id.aoVivo!, jogadorId: a1!.id, timeId: id.AAA!, pontos: 17, ...zerado },
    { jogoId: id.prorrogado!, jogadorId: a1!.id, timeId: id.AAA!, pontos: 112, ...zerado },
  ])
  await banco.db.insert(estatisticasQuarto).values(
    [25, 25, 25, 25, 12].map((pontos, i) => ({
      jogoId: id.prorrogado!,
      jogadorId: a1!.id,
      quarto: i + 1,
      pontos,
      rebotes: 0,
      assistencias: 0,
    })),
  )
  // A tabela de time fica VAZIA, como em produção.
  expect(await banco.db.select().from(estatisticasTimeJogo)).toHaveLength(0)
})
afterAll(async () => banco.fechar())

describe('boxDoTimePorJogo', () => {
  it('soma o box dos jogadores por (jogo, time), com os pontos por quarto', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    expect(mapa.get(`${id.jogo}|${id.AAA}`)).toEqual({
      jogoId: id.jogo,
      timeId: id.AAA,
      pontos: 101,
      porQuarto: { q1: 30, q2: 30, q3: 21, q4: 20, prorrogacao: 0 },
      rebotesTotal: 45,
      assistencias: 22,
      cestasC: 35,
      cestasT: 70,
      tresC: 8,
      tresT: 22,
      turnovers: 7,
    })
    expect(mapa.get(`${id.jogo}|${id.BBB}`)?.pontos).toBe(90)
  })

  it('jogador sem time_id não entra em time nenhum', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    expect([...mapa.values()].map((b) => b.pontos).sort()).toEqual([101, 90].sort())
  })

  it('lado com box de jogador e nenhuma linha de quarto: porQuarto null, totais mantidos', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    const bbb = mapa.get(`${id.jogo}|${id.BBB}`)!
    expect(bbb.porQuarto).toBeNull()
    expect(bbb.pontos).toBe(90)
    expect(bbb.rebotesTotal).toBe(40)
  })

  it('a linha de quarto de jogador sem time_id não entra em lado nenhum', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    // O "Sem Time" tem 999 no 1º quarto; nenhum lado o recebe.
    expect(mapa.get(`${id.jogo}|${id.AAA}`)!.porQuarto!.q1).toBe(30)
    expect(mapa.get(`${id.jogo}|${id.BBB}`)!.porQuarto).toBeNull()
  })

  it('jogo ao vivo com totais e sem quartos: porQuarto null e o total certo', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.aoVivo!])
    const ccc = mapa.get(`${id.aoVivo}|${id.AAA}`)!
    expect(ccc.porQuarto).toBeNull()
    expect(ccc.pontos).toBe(17)
  })

  it('quarto acima do 4º (prorrogação) soma em prorrogacao', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.prorrogado!])
    expect(mapa.get(`${id.prorrogado}|${id.AAA}`)!.porQuarto).toEqual({ q1: 25, q2: 25, q3: 25, q4: 25, prorrogacao: 12 })
  })

  it('sem ids, devolve um Map vazio sem ir ao banco', async () => {
    expect((await boxDoTimePorJogo(banco.db, [])).size).toBe(0)
  })
})

describe('telaDoTime lê o box somado dos jogadores', () => {
  it('com estatisticas_time_jogo vazia, o jogo traz nosso/deles, FG%, 3P%, REB, AST e TO', async () => {
    const tela = await telaDoTime(banco.db, id.AAA!, { temporada: '2025-26' })
    const jogo = tela!.jogosDoTime.find((j) => j.jogoId === id.jogo)
    expect(jogo).toMatchObject({
      nosso: { q1: 30, q2: 30, q3: 21, q4: 20, prorrogacao: 0, total: 101 },
      deles: { total: 90 },
      fgPercentual: 50,
      rebotesTotal: 45,
      assistencias: 22,
      turnovers: 7,
    })
    expect(jogo!.tresPercentual).toBeCloseTo(36.4, 1)
    // O adversário não tem linha de quarto: total sim, quartos null ("—" na tela).
    expect(jogo!.deles).toEqual({ q1: null, q2: null, q3: null, q4: null, prorrogacao: null, total: 90 })
  })
})

describe('telaDoJogo lê o box somado dos jogadores', () => {
  it('com estatisticas_time_jogo vazia, cada lado traz os quartos somados', async () => {
    const tela = await telaDoJogo(banco.db, id.jogo!, {})
    expect(tela!.casa.quartos).toEqual({ q1: 30, q2: 30, q3: 21, q4: 20, prorrogacao: 0 })
    // BBB tem box de jogador mas nenhuma linha de quarto: a quebra é ausência
    // (null), nunca zeros — "0 0 0 0" não fecha com o placar de 90.
    expect(tela!.visitante.quartos).toBeNull()
  })
})
