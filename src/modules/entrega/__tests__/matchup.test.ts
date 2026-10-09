import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { estatisticasJogo, estatisticasTimeJogo, jogadores, jogos, times } from '../../dominio/db/schema'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import {
  calculadoraDeMatchup,
  diasDeCompeticao,
  matchupDoDia,
  perfilDoAdversario,
  perfisDoDia,
  posicoesDoPerfil,
} from '../matchup'

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
  // [data, casa, fora, linha da casa, linha de fora]:
  // [pontos, rebotes, 3 feitas, 3 tentadas, bolas perdidas]
  const partidas: [string, string, string, number[], number[], string?][] = [
    ['2025-11-01', 'AAA', 'BBB', [120, 50, 10, 30, 12], [100, 40, 12, 40, 18]],
    ['2025-11-02', 'BBB', 'CCC', [110, 45, 15, 35, 16], [90, 42, 8, 20, 10]],
    ['2025-11-03', 'CCC', 'AAA', [130, 48, 14, 30, 11], [95, 41, 9, 33, 14]],
    // Do próprio dia do apito: NÃO pode entrar (o jogo ainda não aconteceu).
    ['2025-11-05', 'AAA', 'CCC', [200, 90, 30, 30, 0], [10, 10, 0, 50, 40]],
    // Da temporada anterior: também não.
    ['2025-04-10', 'AAA', 'BBB', [10, 10, 0, 60, 30], [200, 90, 30, 30, 0]],
    // Agendado na véspera: não é dia de competição (não encerrou).
    ['2025-11-04', 'BBB', 'AAA', [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 'AGENDADO'],
  ]
  for (const [data, casa, fora, c, f, status] of partidas) {
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataReferencia: data,
        dataHoraUtc: new Date(`${data}T23:00:00Z`),
        timeCasaId: id[casa]!,
        timeVisitanteId: id[fora]!,
        status: (status ?? 'ENCERRADO') as 'ENCERRADO',
      })
      .returning()
    if (status) continue
    for (const [sigla, [pontos = 0, rebotesTotal = 0, tresC = 0, tresT = 0, turnovers = 0]] of [
      [casa, c],
      [fora, f],
    ] as const) {
      // Produção só tem o box de JOGADOR (a BallDontLie não dá box de time:
      // `estatisticas_time_jogo` ficou com 0 linhas em 09/10). O total do time
      // é repartido entre dois jogadores — o perfil tem de vir da soma deles.
      const metade = (v: number) => Math.floor(v / 2)
      for (const [k, parte] of [
        [1, metade],
        [2, (v: number) => v - metade(v)],
      ] as const) {
        const [jogador] = await banco.db
          .insert(jogadores)
          .values({ nomeCompleto: `${sigla}-${jogo!.id.slice(0, 8)}-${k}`, timeId: id[sigla]! })
          .returning()
        await banco.db.insert(estatisticasJogo).values({
          jogoId: jogo!.id,
          jogadorId: jogador!.id,
          timeId: id[sigla]!,
          pontos: parte(pontos),
          rebotesTotal: parte(rebotesTotal),
          tresC: parte(tresC),
          tresT: parte(tresT),
          turnovers: parte(turnovers),
        })
      }
    }
  }
  // A tabela de time fica VAZIA, como em produção.
  expect(await banco.db.select().from(estatisticasTimeJogo)).toHaveLength(0)
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

/**
 * MATCHUP EM ESTRELAS (CJ, 09/10). O "melhor ataque" (pontos marcados) e o
 * "perde muita bola" (bolas perdidas do PRÓPRIO adversário) entram no perfil;
 * os dias de competição contam datas com jogo ENCERRADO antes do dia.
 */
describe('perfil do adversário — pontos marcados e bolas perdidas (CJ, 09/10)', () => {
  it('pontos marcados e bolas perdidas por jogo, com a posição (1 = maior)', async () => {
    const perfis = await perfisDoDia(banco.db, '2025-11-05', '2025-10-01')
    // AAA marcou 120 e 95 → 107,5; perdeu 12 e 14 → 13.
    // BBB marcou 100 e 110 → 105; perdeu 18 e 16 → 17.
    // CCC marcou 90 e 130 → 110; perdeu 10 e 11 → 10,5.
    expect(perfis.AAA!.pontosMarcados).toEqual({ valor: 107.5, posicao: 2 })
    expect(perfis.CCC!.pontosMarcados).toEqual({ valor: 110, posicao: 1 })
    expect(perfis.BBB!.bolasPerdidas).toEqual({ valor: 17, posicao: 1 })
    expect(perfis.CCC!.bolasPerdidas).toEqual({ valor: 10.5, posicao: 3 })
  })

  it('posicoesDoPerfil traduz o perfil para as métricas do motor', async () => {
    const perfis = await perfisDoDia(banco.db, '2025-11-05', '2025-10-01')
    expect(posicoesDoPerfil(perfis.AAA)).toEqual({
      PONTOS_CEDIDOS: 1,
      TRES_ERRADAS: perfis.AAA!.tresErradas.posicao,
      PONTOS_MARCADOS: 2,
      BOLAS_PERDIDAS: 2,
    })
    expect(posicoesDoPerfil(undefined)).toBeNull()
  })
})

describe('dias de competição', () => {
  it('conta as datas com jogo ENCERRADO da temporada antes do dia', async () => {
    // 01, 02 e 03/11 — o 04/11 está agendado, o 05/11 é o próprio dia e o
    // 10/04 é da temporada anterior.
    expect(await diasDeCompeticao(banco.db, '2025-11-05', '2025-10-01')).toBe(3)
    expect(await diasDeCompeticao(banco.db, '2025-11-02', '2025-10-01')).toBe(1)
    expect(await diasDeCompeticao(banco.db, '2025-10-20', '2025-10-01')).toBe(0)
  })

  it('matchupDoDia junta os perfis e os dias numa ida só', async () => {
    const dia = await matchupDoDia(banco.db, '2025-11-05', '2025-10-01')
    expect(dia.diasDeCompeticao).toBe(3)
    expect(dia.perfis).toEqual(await perfisDoDia(banco.db, '2025-11-05', '2025-10-01'))
  })
})

describe('calculadora de matchup do item (materialização)', () => {
  const base = carregarRuleset(yamlBruto)
  // O fixture tem 3 times e 3 dias: corte 1 e liberação em 3 dias tornam o
  // caso observável sem inventar 20 datas.
  const ruleset = structuredClone(base)
  ruleset.matchup.corte_top = 1
  ruleset.matchup.liberar_apos_dias_de_competicao = 3
  const jogo = { dataReferencia: '2025-11-05', dataHoraUtc: new Date('2025-11-05T23:00:00Z') }

  it('dá a estrela pelo adversário — AAA é quem mais cede pontos', async () => {
    const calcular = calculadoraDeMatchup(banco.db, ruleset)
    expect(await calcular(jogo, 'AAA', 'PONTOS')).toEqual({
      estrelas: 1,
      motivos: [{ metrica: 'PONTOS_CEDIDOS', posicao: 1 }],
      aviso: [],
    })
  })

  it('REBOTES contra o melhor ataque traz o aviso', async () => {
    const calcular = calculadoraDeMatchup(banco.db, ruleset)
    const r = await calcular(jogo, 'CCC', 'REBOTES')
    expect(r?.aviso).toEqual([{ metrica: 'PONTOS_MARCADOS', posicao: 1 }])
  })

  it('sem estrela nem aviso, o item leva null', async () => {
    const calcular = calculadoraDeMatchup(banco.db, ruleset)
    expect(await calcular(jogo, 'CCC', 'PONTOS')).toBeNull()
    expect(await calcular(jogo, 'ZZZ', 'PONTOS')).toBeNull()
  })

  it('antes dos dias de liberação, null', async () => {
    const calcular = calculadoraDeMatchup(banco.db, ruleset)
    const cedo = { dataReferencia: '2025-11-03', dataHoraUtc: new Date('2025-11-03T23:00:00Z') }
    expect(await calcular(cedo, 'AAA', 'PONTOS')).toBeNull()
  })

  it('desligado no ruleset, nem lê o banco', async () => {
    const desligado = structuredClone(ruleset)
    desligado.matchup.habilitado = false
    const calcular = calculadoraDeMatchup(
      new Proxy(banco.db, {
        get() {
          throw new Error('leu o banco')
        },
      }),
      desligado,
    )
    expect(await calcular(jogo, 'AAA', 'PONTOS')).toBeNull()
  })
})

/**
 * PENTE FINO DE 09/10, achado 3: uma falha passageira do banco na primeira
 * leitura NÃO pode ficar guardada no memo — senão todo ciclo seguinte que usa
 * o mesmo memo rejeita de novo até ele expirar.
 */
describe('calculadora de matchup — falha não fica no memo', () => {
  const base = carregarRuleset(yamlBruto)
  const ruleset = structuredClone(base)
  ruleset.matchup.corte_top = 1
  ruleset.matchup.liberar_apos_dias_de_competicao = 3
  const jogo = { dataReferencia: '2025-11-05', dataHoraUtc: new Date('2025-11-05T23:00:00Z') }

  it('rejeita na falha e, com o banco de volta, a segunda chamada no mesmo memo funciona', async () => {
    let fora = true
    const instavel = new Proxy(banco.db, {
      get(alvo, prop) {
        if (prop === 'select' && fora) {
          return () => {
            throw new Error('banco fora')
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })
    const memo = new Map()
    const calcular = calculadoraDeMatchup(instavel, ruleset, memo)
    await expect(calcular(jogo, 'AAA', 'PONTOS')).rejects.toThrow('banco fora')
    expect(memo.size).toBe(0)

    fora = false
    expect(await calcular(jogo, 'AAA', 'PONTOS')).toMatchObject({ estrelas: 1 })
  })
})
