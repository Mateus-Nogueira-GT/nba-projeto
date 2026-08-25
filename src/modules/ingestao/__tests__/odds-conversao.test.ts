import { describe, expect, it } from 'vitest'

import {
  americanaParaDecimal,
  atributoDoPropType,
  linhaDoLadoOver,
} from '../odds/conversao'

describe('americanaParaDecimal', () => {
  it('cobre os quatro quadrantes do formato americano', () => {
    expect(americanaParaDecimal(-110)).toBe(1.91)
    expect(americanaParaDecimal(150)).toBe(2.5)
    expect(americanaParaDecimal(-200)).toBe(1.5)
    expect(americanaParaDecimal(100)).toBe(2)
  })

  it('zero não é odd — lança em vez de devolver Infinity', () => {
    expect(() => americanaParaDecimal(0)).toThrow()
    expect(() => americanaParaDecimal(Number.NaN)).toThrow()
  })
})

describe('linhaDoLadoOver', () => {
  it('meio ponto no over equivale à linha inteira do CJ', () => {
    expect(linhaDoLadoOver('24.5')).toBe(25)
    expect(linhaDoLadoOver('25.5')).toBe(26)
    expect(linhaDoLadoOver('4.5')).toBe(5)
  })

  it('linha inteira do provedor NÃO atravessa — não é o mesmo mercado que "N+"', () => {
    expect(linhaDoLadoOver('25')).toBeNull()
    expect(linhaDoLadoOver('25.0')).toBeNull()
  })

  it('lixo não atravessa', () => {
    expect(linhaDoLadoOver('')).toBeNull()
    expect(linhaDoLadoOver('abc')).toBeNull()
  })
})

describe('atributoDoPropType', () => {
  it('só os três mercados da Lista Secreta atravessam', () => {
    expect(atributoDoPropType('points')).toBe('PONTOS')
    expect(atributoDoPropType('rebounds')).toBe('REBOTES')
    expect(atributoDoPropType('assists')).toBe('ASSISTENCIAS')
    // 1Q é mercado do provedor, não da Lista Secreta (Fire Live não usa odds)
    expect(atributoDoPropType('points_1q')).toBeNull()
    expect(atributoDoPropType('double_double')).toBeNull()
    expect(atributoDoPropType('points_rebounds_assists')).toBeNull()
  })
})
