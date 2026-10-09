import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { estrelasDoMatchup, METRICAS_MATCHUP, type PosicoesMatchup } from '../matchup/estrelas'
import { carregarRuleset } from '../ruleset/carregar'

/**
 * MATCHUP EM ESTRELAS (resposta do CJ de 09/10; spec 2026-10-09, §2).
 *
 * "Uma estrela por matchup, corte top 5 da liga, liga após 20 dias; matchup
 * negativo é só um aviso." Não cria apito e não mexe no nível nem no %: a
 * função recebe as POSIÇÕES do adversário como fato e só conta critérios.
 */
const ruleset = carregarRuleset(yamlBruto)

/** Adversário fora do top em tudo — o controle. Posição 1 = maior valor. */
const NEUTRO: PosicoesMatchup = {
  PONTOS_CEDIDOS: 15,
  TRES_ERRADAS: 15,
  PONTOS_MARCADOS: 15,
  BOLAS_PERDIDAS: 15,
}
const com = (p: Partial<PosicoesMatchup>): PosicoesMatchup => ({ ...NEUTRO, ...p })
const LIBERADO = 20

describe('M1 · o matchup vive no ruleset', () => {
  it('ligado, corte top 5, liberado após 20 dias de competição', () => {
    expect(ruleset.matchup.habilitado).toBe(true)
    expect(ruleset.matchup.corte_top).toBe(5)
    expect(ruleset.matchup.liberar_apos_dias_de_competicao).toBe(20)
  })

  it('os critérios por atributo são os do CJ', () => {
    expect(ruleset.matchup.criterios).toEqual({
      PONTOS: { estrelas: ['PONTOS_CEDIDOS'], aviso: [] },
      REBOTES: { estrelas: ['TRES_ERRADAS'], aviso: ['PONTOS_MARCADOS'] },
      ASSISTENCIAS: { estrelas: ['PONTOS_CEDIDOS', 'BOLAS_PERDIDAS'], aviso: [] },
    })
  })

  it('métrica desconhecida no YAML é recusada', () => {
    const bruto = yamlBruto.replace('estrelas: [TRES_ERRADAS]', 'estrelas: [CONTRA_ATAQUE]')
    expect(() => carregarRuleset(bruto)).toThrow()
  })

  it('as métricas declaradas são as quatro que a entrega calcula', () => {
    expect([...METRICAS_MATCHUP].sort()).toEqual(
      ['BOLAS_PERDIDAS', 'PONTOS_CEDIDOS', 'PONTOS_MARCADOS', 'TRES_ERRADAS'].sort(),
    )
  })
})

describe('M2 · estrelas do matchup', () => {
  it('PONTOS: ★ quando o adversário está no top 5 de pontos cedidos', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 3 }), diasDeCompeticao: LIBERADO },
      'PONTOS',
      ruleset,
    )
    expect(r).toEqual({
      estrelas: 1,
      motivos: [{ metrica: 'PONTOS_CEDIDOS', posicao: 3 }],
      aviso: [],
    })
  })

  it('PONTOS: bolas de 3 erradas não contam para pontos', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ TRES_ERRADAS: 1, BOLAS_PERDIDAS: 1 }), diasDeCompeticao: LIBERADO },
      'PONTOS',
      ruleset,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('REBOTES: ★ quando o adversário está no top 5 de bolas de 3 erradas', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ TRES_ERRADAS: 1 }), diasDeCompeticao: LIBERADO },
      'REBOTES',
      ruleset,
    )
    expect(r).toEqual({ estrelas: 1, motivos: [{ metrica: 'TRES_ERRADAS', posicao: 1 }], aviso: [] })
  })

  it('REBOTES: adversário entre os 5 melhores ataques é AVISO, não estrela', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ TRES_ERRADAS: 2, PONTOS_MARCADOS: 4 }), diasDeCompeticao: LIBERADO },
      'REBOTES',
      ruleset,
    )
    expect(r).toEqual({
      estrelas: 1,
      motivos: [{ metrica: 'TRES_ERRADAS', posicao: 2 }],
      aviso: [{ metrica: 'PONTOS_MARCADOS', posicao: 4 }],
    })
  })

  it('REBOTES: o aviso existe mesmo sem estrela', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_MARCADOS: 1 }), diasDeCompeticao: LIBERADO },
      'REBOTES',
      ruleset,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [{ metrica: 'PONTOS_MARCADOS', posicao: 1 }] })
  })

  it('ASSISTENCIAS: uma ★ por critério — pontos cedidos e bolas perdidas somam duas', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 5, BOLAS_PERDIDAS: 2 }), diasDeCompeticao: LIBERADO },
      'ASSISTENCIAS',
      ruleset,
    )
    expect(r).toEqual({
      estrelas: 2,
      motivos: [
        { metrica: 'PONTOS_CEDIDOS', posicao: 5 },
        { metrica: 'BOLAS_PERDIDAS', posicao: 2 },
      ],
      aviso: [],
    })
  })

  it('empate na posição 5 conta (a posição é dividida, e 5 ≤ corte)', () => {
    // Dois times empatados em 5º: os dois têm posição 5.
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 5 }), diasDeCompeticao: LIBERADO },
      'PONTOS',
      ruleset,
    )
    expect(r.estrelas).toBe(1)
  })

  it('posição 6 não conta', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 6 }), diasDeCompeticao: LIBERADO },
      'PONTOS',
      ruleset,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('antes dos 20 dias de competição não há estrela nem aviso', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ TRES_ERRADAS: 1, PONTOS_MARCADOS: 1 }), diasDeCompeticao: 19 },
      'REBOTES',
      ruleset,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('no 20º dia de competição já vale (o limiar é inclusivo)', () => {
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 1 }), diasDeCompeticao: 20 },
      'PONTOS',
      ruleset,
    )
    expect(r.estrelas).toBe(1)
  })

  it('desligado no ruleset, nada', () => {
    const copia = structuredClone(ruleset)
    copia.matchup.habilitado = false
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 1 }), diasDeCompeticao: 100 },
      'PONTOS',
      copia,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('sem perfil do adversário, nada', () => {
    const r = estrelasDoMatchup({ posicoes: null, diasDeCompeticao: 100 }, 'PONTOS', ruleset)
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('o corte vem do ruleset: com corte 3, a posição 4 não conta', () => {
    const copia = structuredClone(ruleset)
    copia.matchup.corte_top = 3
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 4 }), diasDeCompeticao: LIBERADO },
      'PONTOS',
      copia,
    )
    expect(r.estrelas).toBe(0)
  })

  it('os 20 dias vêm do ruleset', () => {
    const copia = structuredClone(ruleset)
    copia.matchup.liberar_apos_dias_de_competicao = 5
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 1 }), diasDeCompeticao: 5 },
      'PONTOS',
      copia,
    )
    expect(r.estrelas).toBe(1)
  })

  it('atributo sem critério no ruleset não ganha estrela', () => {
    const copia = structuredClone(ruleset)
    delete copia.matchup.criterios.ASSISTENCIAS
    const r = estrelasDoMatchup(
      { posicoes: com({ PONTOS_CEDIDOS: 1, BOLAS_PERDIDAS: 1 }), diasDeCompeticao: LIBERADO },
      'ASSISTENCIAS',
      copia,
    )
    expect(r).toEqual({ estrelas: 0, motivos: [], aviso: [] })
  })

  it('é exportada pelo índice do motor', async () => {
    const motor = await import('../index')
    expect(motor.estrelasDoMatchup).toBe(estrelasDoMatchup)
  })
})
