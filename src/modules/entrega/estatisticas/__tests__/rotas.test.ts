import { describe, expect, it } from 'vitest'

import { rotaDaComparacao } from '../rotas'

describe('rotaDaComparacao', () => {
  it('só A: a tela da escolha do segundo', () => {
    expect(rotaDaComparacao('jogador', 'id-a')).toBe('/estatisticas/comparar?tipo=jogador&a=id-a')
  })
  it('A e B com período e temporada escolhidos', () => {
    expect(rotaDaComparacao('time', 'id-a', 'id-b', { periodo: '5', temporada: '2025-26' })).toBe(
      '/estatisticas/comparar?tipo=time&a=id-a&b=id-b&periodo=5&temporada=2025-26',
    )
  })
  it('codifica os ids', () => {
    expect(rotaDaComparacao('jogador', 'a b', 'c&d')).toContain('a=a%20b&b=c%26d')
  })
  it('só temporada, sem período', () => {
    expect(rotaDaComparacao('jogador', 'id-a', undefined, { temporada: '2025-26' })).toBe(
      '/estatisticas/comparar?tipo=jogador&a=id-a&temporada=2025-26',
    )
  })
})
