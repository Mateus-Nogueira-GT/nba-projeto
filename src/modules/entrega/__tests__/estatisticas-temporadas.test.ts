import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogos, times } from '../../dominio/db/schema'
import { estadoDaTemporada, temporadasComDados } from '../estatisticas/temporadas'

const calendario = { mesInicio: 10, formato: 'dois_anos', fuso: 'America/Sao_Paulo' } as const

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let casa: string
let fora: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const criados = await banco.db
    .insert(times)
    .values([
      { sigla: 'BOS', nome: 'Boston Celtics' },
      { sigla: 'NYK', nome: 'New York Knicks' },
    ])
    .returning()
  casa = criados[0]!.id
  fora = criados[1]!.id
})

afterAll(async () => {
  await banco.fechar()
})

async function semear(
  partidas: { data: string; status: 'ENCERRADO' | 'AGENDADO' | 'AO_VIVO' }[],
) {
  await banco.db.delete(jogos)
  if (partidas.length === 0) return
  await banco.db.insert(jogos).values(
    partidas.map((p) => ({
      timeCasaId: casa,
      timeVisitanteId: fora,
      dataHoraUtc: new Date(`${p.data}T23:00:00Z`),
      dataReferencia: p.data,
      status: p.status,
    })),
  )
}

describe('temporadasComDados', () => {
  it('banco vazio devolve lista vazia, sem inventar temporada', async () => {
    await semear([])
    await expect(temporadasComDados(banco.db, calendario)).resolves.toEqual([])
  })

  it('conta os jogos encerrados de uma temporada', async () => {
    await semear([
      { data: '2025-12-01', status: 'ENCERRADO' },
      { data: '2026-03-15', status: 'ENCERRADO' },
    ])

    await expect(temporadasComDados(banco.db, calendario)).resolves.toEqual([
      { temporada: '2025-26', jogosEncerrados: 2 },
    ])
  })

  it('jogo AGENDADO não conta: a tela precisa de resultado, não de promessa', async () => {
    await semear([
      { data: '2025-12-01', status: 'ENCERRADO' },
      { data: '2026-11-05', status: 'AGENDADO' },
      { data: '2026-11-06', status: 'AO_VIVO' },
    ])

    await expect(temporadasComDados(banco.db, calendario)).resolves.toEqual([
      { temporada: '2025-26', jogosEncerrados: 1 },
    ])
  })

  it('devolve as temporadas da mais recente para a mais antiga', async () => {
    await semear([
      { data: '2024-12-01', status: 'ENCERRADO' },
      { data: '2025-12-01', status: 'ENCERRADO' },
      { data: '2025-12-02', status: 'ENCERRADO' },
      { data: '2026-11-20', status: 'ENCERRADO' },
    ])

    await expect(temporadasComDados(banco.db, calendario)).resolves.toEqual([
      { temporada: '2026-27', jogosEncerrados: 1 },
      { temporada: '2025-26', jogosEncerrados: 2 },
      { temporada: '2024-25', jogosEncerrados: 1 },
    ])
  })

  it('a virada de temporada cai no mês de início, não no ano civil', async () => {
    // 30/09 e 01/10 de 2026 são temporadas diferentes. É a mesma regra de
    // `temporadaDe` — e é por isso que ela é reusada em vez de reescrita em SQL.
    await semear([
      { data: '2026-09-30', status: 'ENCERRADO' },
      { data: '2026-10-01', status: 'ENCERRADO' },
    ])

    await expect(temporadasComDados(banco.db, calendario)).resolves.toEqual([
      { temporada: '2026-27', jogosEncerrados: 1 },
      { temporada: '2025-26', jogosEncerrados: 1 },
    ])
  })
})

/**
 * O HIATO — os ~32 dias entre o lançamento e a volta da NBA.
 *
 * Distinguir "a temporada ainda não começou" de "hoje não tem jogo" é o que
 * permite às telas de apito explicarem o vazio em vez de repetirem o mesmo
 * "sem jogos hoje" de uma terça-feira de folga.
 */
describe('estadoDaTemporada', () => {
  const ruleset = {
    temporada: { mes_inicio: 10, formato: 'dois_anos' as const, minimo_jogos_para_exibir: 1 },
    rodada: { fuso: 'America/Sao_Paulo' },
  }
  const LANCAMENTO = new Date('2026-10-02T18:00:00.000Z')

  it('temporada do calendário sem jogo nenhum é hiato', async () => {
    await semear([{ data: '2026-03-01', status: 'ENCERRADO' }])

    const estado = await estadoDaTemporada(banco.db, ruleset, LANCAMENTO)

    expect(estado).toMatchObject({
      exibida: '2025-26',
      doCalendario: '2026-27',
      emHiato: true,
      proximoJogo: null,
    })
  })

  it('no hiato, informa a rodada do próximo jogo quando o banco já a conhece', async () => {
    await semear([
      { data: '2026-03-01', status: 'ENCERRADO' },
      { data: '2026-11-03', status: 'AGENDADO' },
      { data: '2026-11-04', status: 'AGENDADO' },
    ])

    const estado = await estadoDaTemporada(banco.db, ruleset, LANCAMENTO)

    expect(estado.emHiato).toBe(true)
    expect(estado.proximoJogo).toBe('2026-11-03')
  })

  it('depois da primeira bola não há mais hiato', async () => {
    await semear([
      { data: '2026-03-01', status: 'ENCERRADO' },
      { data: '2026-11-03', status: 'ENCERRADO' },
    ])

    const estado = await estadoDaTemporada(
      banco.db,
      ruleset,
      new Date('2026-11-04T18:00:00.000Z'),
    )

    expect(estado).toMatchObject({ exibida: '2026-27', emHiato: false })
  })

  it('banco vazio não é hiato: é ausência de dado, e a tela não deve afirmar mais que isso', async () => {
    await semear([])

    const estado = await estadoDaTemporada(banco.db, ruleset, LANCAMENTO)

    expect(estado).toMatchObject({ exibida: '2026-27', emHiato: false, proximoJogo: null })
  })
})
