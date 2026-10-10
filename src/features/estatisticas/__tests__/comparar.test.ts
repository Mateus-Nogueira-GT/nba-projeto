import { describe, expect, it } from 'vitest'

import type { BoxScoreDoJogo } from '@/modules/entrega/estatisticas/time'
import { mediasDoTime } from '../comparar'

const jogo = (p: Partial<BoxScoreDoJogo>): BoxScoreDoJogo => ({
  jogoId: 'x',
  data: new Date('2025-11-01T23:00:00Z'),
  adversarioSigla: 'ADV',
  emCasa: true,
  resultado: 'V',
  placar: '100–90',
  nosso: { q1: 25, q2: 25, q3: 25, q4: 25, prorrogacao: 0, total: 100 },
  deles: { q1: 22, q2: 23, q3: 22, q4: 23, prorrogacao: 0, total: 90 },
  fgPercentual: 50,
  tresPercentual: 40,
  tresTentadas: 25,
  tresConvertidas: 10,
  rebotesTotal: 45,
  assistencias: 25,
  turnovers: 12,
  ...p,
})

describe('mediasDoTime', () => {
  it('média por jogo só dos jogos encerrados com box', () => {
    const m = mediasDoTime([
      jogo({
        nosso: { q1: 30, q2: 30, q3: 30, q4: 30, prorrogacao: 0, total: 120 },
        deles: { q1: 20, q2: 20, q3: 20, q4: 20, prorrogacao: 0, total: 80 },
        rebotesTotal: 55,
        assistencias: 35,
        turnovers: 10,
      }),
      jogo({}),
      // AO VIVO, com box PARCIAL (nosso/deles preenchidos): fora da média,
      // senão puxaria pontos marcados e cedidos para baixo.
      jogo({
        resultado: null,
        placar: '30–28',
        nosso: { q1: 30, q2: null, q3: null, q4: null, prorrogacao: null, total: 30 },
        deles: { q1: 28, q2: null, q3: null, q4: null, prorrogacao: null, total: 28 },
        rebotesTotal: 9,
        assistencias: 6,
        turnovers: 2,
      }),
    ])
    expect(m).toEqual({
      jogos: 2,
      pontosMarcados: 110,
      pontosCedidos: 85,
      rebotes: 50,
      assistencias: 30,
      tresTentadas: 25,
      tresConvertidas: 10,
      erros: 11,
    })
  })

  it('encerrado sem quebra por quarto (quartos null) ainda conta pelo total', () => {
    const m = mediasDoTime([
      jogo({
        nosso: { q1: null, q2: null, q3: null, q4: null, prorrogacao: null, total: 104 },
        deles: { q1: null, q2: null, q3: null, q4: null, prorrogacao: null, total: 98 },
      }),
    ])
    expect(m).toMatchObject({ jogos: 1, pontosMarcados: 104, pontosCedidos: 98 })
  })

  it('sem jogo com box, tudo nulo e zero jogos', () => {
    expect(mediasDoTime([jogo({ nosso: null, deles: null })])).toMatchObject({ jogos: 0, pontosMarcados: null })
  })
})
