import { describe, expect, it } from 'vitest'
import { mediasAte, ordenarHierarquia, timeNaData } from '../regras'

describe('timeNaData', () => {
  const jogos = [
    { data: '2025-11-01', timeId: 'MIL' },
    { data: '2026-01-10', timeId: 'MIA' },
  ]
  it('usa o último jogo ATÉ a data', () => {
    expect(timeNaData(jogos, '2025-12-15')).toBe('MIL')
    expect(timeNaData(jogos, '2026-02-01')).toBe('MIA')
  })
  it('o jogo do próprio dia conta (o time do jogo é fato do jogo)', () => {
    expect(timeNaData(jogos, '2026-01-10')).toBe('MIA')
  })
  it('antes do primeiro jogo, não há time', () => {
    expect(timeNaData(jogos, '2025-10-01')).toBeNull()
  })
  it('linha sem time é ignorada', () => {
    expect(timeNaData([{ data: '2025-11-01', timeId: null }], '2025-12-01')).toBeNull()
  })
})

describe('ordenarHierarquia — nível do jogador, depois a posição na lista do CJ', () => {
  it('MVP antes de All Star, mesmo com posição do CJ maior', () => {
    const ordem = ordenarHierarquia([
      { jogadorId: 'a', nivel: 'ALL_STAR', posicaoCj: 1 },
      { jogadorId: 'b', nivel: 'MVP', posicaoCj: 3 },
      { jogadorId: 'c', nivel: 'ALL_STAR', posicaoCj: 2 },
      { jogadorId: 'd', nivel: 'RANDOLA', posicaoCj: 1 },
    ])
    expect([...ordem.entries()]).toEqual([['b', 1], ['a', 2], ['c', 3], ['d', 4]])
  })
  it('empate total desempata pelo id, para ser determinístico', () => {
    const ordem = ordenarHierarquia([
      { jogadorId: 'z', nivel: 'SUPORTE', posicaoCj: 2 },
      { jogadorId: 'y', nivel: 'SUPORTE', posicaoCj: 2 },
    ])
    expect([...ordem.keys()]).toEqual(['y', 'z'])
  })
})

describe('mediasAte — sem olhar o futuro', () => {
  const h = (data: string, pontos: number, jogou = true) =>
    ({ jogoId: data, data, jogou, pontos, rebotes: 0, assistencias: 0 })
  it('média de quem jogou; DNP não entra', () => {
    expect(mediasAte([h('2025-11-03', 20), h('2025-11-02', 0, false), h('2025-11-01', 10)], null).PONTOS).toBe(15)
  })
  it('janela de N usa os N mais recentes que jogou', () => {
    expect(mediasAte([h('2025-11-03', 30), h('2025-11-02', 20), h('2025-11-01', 10)], 2).PONTOS).toBe(25)
  })
  it('sem jogo, sem média', () => {
    expect(mediasAte([], null)).toEqual({})
  })
})
