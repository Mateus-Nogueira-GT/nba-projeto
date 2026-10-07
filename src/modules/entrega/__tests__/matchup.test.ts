import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { estatisticasTimeJogo, jogos, times } from '../../dominio/db/schema'
import { perfilDoAdversario, perfisDoDia } from '../matchup'

/**
 * MATCHUP — o dado, sem regra (reunião de 23/09; spec 2026-10-06-ajustes, §3).
 * "Time que cede muitos pontos ou erra muitas bolas de 3" vira três números
 * com a posição na liga, só de jogos ANTERIORES à data do apito.
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const id: Record<string, string> = {}

beforeAll(async () => {
  banco = await bancoDeTeste()
  for (const sigla of ['AAA', 'BBB', 'CCC']) {
    const [t] = await banco.db.insert(times).values({ sigla, nome: sigla }).returning()
    id[sigla] = t!.id
  }
  // [data, casa, fora, linha da casa, linha de fora]: [pontos, rebotes, 3 feitas, 3 tentadas]
  const partidas: [string, string, string, number[], number[]][] = [
    ['2025-11-01', 'AAA', 'BBB', [120, 50, 10, 30], [100, 40, 12, 40]],
    ['2025-11-02', 'BBB', 'CCC', [110, 45, 15, 35], [90, 42, 8, 20]],
    ['2025-11-03', 'CCC', 'AAA', [130, 48, 14, 30], [95, 41, 9, 33]],
    // Do próprio dia do apito: NÃO pode entrar (o jogo ainda não aconteceu).
    ['2025-11-05', 'AAA', 'CCC', [200, 90, 30, 30], [10, 10, 0, 50]],
    // Da temporada anterior: também não.
    ['2025-04-10', 'AAA', 'BBB', [10, 10, 0, 60], [200, 90, 30, 30]],
  ]
  for (const [data, casa, fora, c, f] of partidas) {
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataReferencia: data,
        dataHoraUtc: new Date(`${data}T23:00:00Z`),
        timeCasaId: id[casa]!,
        timeVisitanteId: id[fora]!,
        status: 'ENCERRADO',
      })
      .returning()
    for (const [sigla, [pontos, rebotesTotal, tresC, tresT]] of [
      [casa, c],
      [fora, f],
    ] as const) {
      await banco.db
        .insert(estatisticasTimeJogo)
        .values({ jogoId: jogo!.id, timeId: id[sigla]!, pontos, rebotesTotal, tresC, tresT })
    }
  }
})
afterAll(async () => banco.fechar())

describe('perfil do adversário para o matchup', () => {
  it('pontos cedidos, bolas de 3 erradas e rebotes cedidos por jogo, com a posição', async () => {
    const perfil = await perfilDoAdversario(banco.db, 'AAA', '2025-11-05', '2025-10-01')

    // AAA: cedeu 100 (vs BBB) e 130 (vs CCC) → 115; errou 20 e 24 de 3 → 22;
    // cedeu 40 e 48 rebotes → 44. Dois jogos, antes de 05/11 e na temporada.
    expect(perfil).toMatchObject({
      sigla: 'AAA',
      jogos: 2,
      totalTimes: 3,
      pontosCedidos: { valor: 115 },
      tresErradas: { valor: 22 },
      rebotesCedidos: { valor: 44 },
    })
  })

  it('a posição 1 é a de quem MAIS cede (o melhor matchup para o atacante)', async () => {
    // Pontos cedidos: AAA 115, BBB (120, 90) 105, CCC (110, 95) 102,5.
    const aaa = await perfilDoAdversario(banco.db, 'AAA', '2025-11-05', '2025-10-01')
    const ccc = await perfilDoAdversario(banco.db, 'CCC', '2025-11-05', '2025-10-01')
    expect(aaa!.pontosCedidos.posicao).toBe(1)
    expect(ccc!.pontosCedidos.posicao).toBe(3)
  })

  it('sem jogo anterior na temporada, não há perfil', async () => {
    expect(await perfilDoAdversario(banco.db, 'AAA', '2025-10-20', '2025-10-01')).toBeNull()
  })

  it('sigla desconhecida não quebra a tela', async () => {
    expect(await perfilDoAdversario(banco.db, 'ZZZ', '2025-11-05', '2025-10-01')).toBeNull()
  })
})

describe('perfis do dia — os 30 times numa leitura só (o que o cache guarda)', () => {
  it('traz o perfil de todo time com jogo no período, igual ao de perfilDoAdversario', async () => {
    const perfis = await perfisDoDia(banco.db, '2025-11-05', '2025-10-01')
    expect(Object.keys(perfis).sort()).toEqual(['AAA', 'BBB', 'CCC'])
    for (const sigla of ['AAA', 'BBB', 'CCC']) {
      expect(perfis[sigla]).toEqual(await perfilDoAdversario(banco.db, sigla, '2025-11-05', '2025-10-01'))
    }
  })

  it('é objeto simples (atravessa o unstable_cache como JSON, sem Map nem Date)', async () => {
    const perfis = await perfisDoDia(banco.db, '2025-11-05', '2025-10-01')
    expect(JSON.parse(JSON.stringify(perfis))).toEqual(perfis)
  })

  it('sem jogo anterior na temporada, vem vazio', async () => {
    expect(await perfisDoDia(banco.db, '2025-10-20', '2025-10-01')).toEqual({})
  })
})
