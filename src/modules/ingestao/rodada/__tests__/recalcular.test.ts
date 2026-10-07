import { asc } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogos, times } from '../../../dominio/db/schema'
import { recalcularRodadaDosJogos } from '../recalcular'

const NY = 'America/New_York'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let den: string
let gsw: string
let ind: string
let mia: string
let chi: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const linhas = await banco.db
    .insert(times)
    .values([
      { sigla: 'DEN', nome: 'Denver Nuggets' },
      { sigla: 'GSW', nome: 'Golden State Warriors' },
      { sigla: 'IND', nome: 'Indiana Pacers' },
      { sigla: 'MIA', nome: 'Miami Heat' },
      { sigla: 'CHI', nome: 'Chicago Bulls' },
    ])
    .returning()
  ;[den, gsw, ind, mia, chi] = linhas.map((t) => t.id) as [string, string, string, string, string]
}, 120_000)
afterAll(async () => banco.fechar())

beforeEach(async () => {
  await banco.db.delete(jogos)
})

const datas = async () =>
  (await banco.db.select().from(jogos).orderBy(asc(jogos.dataHoraUtc))).map((j) => j.dataReferencia)

/**
 * O caso real de 08/11/2025, gravado com a rodada de Brasília: DEN×GSW às
 * 03:00Z de 08/11 (22h de NY em 07/11, meia-noite em Brasília) e DEN×IND às
 * 02:00Z de 09/11 (21h de NY em 08/11) — o Denver duas vezes na rodada 08/11.
 */
async function semearRodadaDeBrasilia() {
  await banco.db.insert(jogos).values([
    { timeCasaId: gsw, timeVisitanteId: den, dataReferencia: '2025-11-08', dataHoraUtc: new Date('2025-11-08T03:00:00Z') },
    { timeCasaId: ind, timeVisitanteId: den, dataReferencia: '2025-11-08', dataHoraUtc: new Date('2025-11-09T02:00:00Z') },
    // Um jogo cedo, que é da mesma data nos dois fusos: não muda.
    { timeCasaId: mia, timeVisitanteId: chi, dataReferencia: '2025-11-08', dataHoraUtc: new Date('2025-11-08T20:00:00Z') },
  ])
}

describe('jogos:recalcular-rodada (decisão de 07/10/2026)', () => {
  it('sem --confirmar, relata o que mudaria e não escreve nada', async () => {
    await semearRodadaDeBrasilia()

    const r = await recalcularRodadaDosJogos(banco.db, { fuso: NY, confirmar: false })

    expect(r.total).toBe(3)
    expect(r.gravou).toBe(false)
    expect(r.colisoes).toEqual([])
    expect(r.mudancas.map((m) => [m.de, m.para])).toEqual([['2025-11-08', '2025-11-07']])
    expect(await datas()).toEqual(['2025-11-08', '2025-11-08', '2025-11-08'])
  })

  it('com --confirmar, grava a data de NY: DEN×GSW e DEN×IND deixam de cair na mesma rodada', async () => {
    await semearRodadaDeBrasilia()

    const r = await recalcularRodadaDosJogos(banco.db, { fuso: NY, confirmar: true })

    expect(r.gravou).toBe(true)
    expect(await datas()).toEqual(['2025-11-07', '2025-11-08', '2025-11-08'])
    // Reexecutar não tem o que mudar.
    const de_novo = await recalcularRodadaDosJogos(banco.db, { fuso: NY, confirmar: true })
    expect(de_novo.mudancas).toEqual([])
    expect(de_novo.gravou).toBe(false)
  })

  it('troca de datas que colidiria NO MEIO (mesmo confronto em noites seguidas) passa', async () => {
    // Dois MIA×CHI: o de 23:30 NY de 10/01 (gravado 11/01 em Brasília) e o de
    // 19:00 NY de 11/01 (gravado, por um erro qualquer, como 10/01). O
    // conjunto final não colide, mas a ordem ingênua de UPDATE colidiria.
    await banco.db.insert(jogos).values([
      { timeCasaId: mia, timeVisitanteId: chi, dataReferencia: '2026-01-11', dataHoraUtc: new Date('2026-01-11T04:30:00Z') },
      { timeCasaId: mia, timeVisitanteId: chi, dataReferencia: '2026-01-10', dataHoraUtc: new Date('2026-01-12T00:00:00Z') },
    ])

    const r = await recalcularRodadaDosJogos(banco.db, { fuso: NY, confirmar: true })

    expect(r.gravou).toBe(true)
    expect(await datas()).toEqual(['2026-01-10', '2026-01-11'])
  })

  it('colisão na chave única: para antes de gravar e devolve a lista', async () => {
    // O mesmo confronto às 18h e às 22h30 de NY em 10/01 — o segundo gravado
    // como 11/01 pela regra de Brasília. No fuso novo os dois são a MESMA
    // rodada: é jogo duplicado a curar, não a sobrescrever.
    await banco.db.insert(jogos).values([
      { timeCasaId: mia, timeVisitanteId: chi, dataReferencia: '2026-01-10', dataHoraUtc: new Date('2026-01-10T23:00:00Z') },
      { timeCasaId: mia, timeVisitanteId: chi, dataReferencia: '2026-01-11', dataHoraUtc: new Date('2026-01-11T03:30:00Z') },
    ])

    const r = await recalcularRodadaDosJogos(banco.db, { fuso: NY, confirmar: true })

    expect(r.gravou).toBe(false)
    expect(r.colisoes).toHaveLength(1)
    expect(r.colisoes[0]).toMatchObject({ dataReferencia: '2026-01-10', timeCasaId: mia, timeVisitanteId: chi })
    expect(r.colisoes[0]!.jogoIds).toHaveLength(2)
    expect(await datas()).toEqual(['2026-01-10', '2026-01-11'])
  })
})
