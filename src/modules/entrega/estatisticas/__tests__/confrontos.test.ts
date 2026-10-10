import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogos, times } from '../../../dominio/db/schema'
import { confrontosEntre } from '../confrontos'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const id: Record<string, string> = {}
const PERIODO = { de: '2025-10-01', ate: '2026-06-30' }

beforeAll(async () => {
  banco = await bancoDeTeste()
  for (const sigla of ['AAA', 'BBB', 'CCC']) {
    const [t] = await banco.db.insert(times).values({ sigla, nome: sigla }).returning()
    id[sigla] = t!.id
  }
  const partidas: [string, string, string, number | null, number | null, 'ENCERRADO' | 'AO_VIVO'][] = [
    ['2025-11-01', 'AAA', 'BBB', 100, 90, 'ENCERRADO'], // A vence
    ['2025-12-01', 'BBB', 'AAA', 95, 80, 'ENCERRADO'], // B vence
    ['2026-01-01', 'AAA', 'BBB', 110, 105, 'ENCERRADO'], // A vence
    ['2025-11-15', 'AAA', 'CCC', 120, 70, 'ENCERRADO'], // outro adversário: fora
    ['2025-06-01', 'AAA', 'BBB', 99, 98, 'ENCERRADO'], // temporada anterior: fora
    ['2026-02-01', 'BBB', 'AAA', 20, 18, 'AO_VIVO'], // em andamento: fora
  ]
  for (const [data, casa, fora, pc, pv, status] of partidas) {
    await banco.db.insert(jogos).values({
      dataReferencia: data,
      dataHoraUtc: new Date(`${data}T23:00:00Z`),
      timeCasaId: id[casa]!,
      timeVisitanteId: id[fora]!,
      placarCasa: pc,
      placarVisitante: pv,
      status,
    })
  }
})
afterAll(async () => banco.fechar())

describe('confrontosEntre', () => {
  it('só os jogos ENCERRADOS entre os dois, na temporada, do mais recente ao mais antigo', async () => {
    const c = await confrontosEntre(banco.db, id.AAA!, id.BBB!, PERIODO)
    expect(c.jogos.map((j) => `${j.siglaCasa} ${j.placarCasa}-${j.placarVisitante} ${j.siglaVisitante}`)).toEqual([
      'AAA 110-105 BBB',
      'BBB 95-80 AAA',
      'AAA 100-90 BBB',
    ])
    expect(c).toMatchObject({ vitoriasA: 2, vitoriasB: 1 })
  })

  it('a ordem de A e B só troca o lado do saldo', async () => {
    const c = await confrontosEntre(banco.db, id.BBB!, id.AAA!, PERIODO)
    expect(c).toMatchObject({ vitoriasA: 1, vitoriasB: 2 })
  })

  it('sem jogo entre os dois, lista vazia e saldo zero', async () => {
    expect(await confrontosEntre(banco.db, id.BBB!, id.CCC!, PERIODO)).toEqual({
      jogos: [],
      vitoriasA: 0,
      vitoriasB: 0,
    })
  })
})
