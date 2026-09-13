import { describe, expect, it } from 'vitest'
import { CONFERENCIA_POR_SIGLA, conferenciaDe } from '../conferencias'

describe('conferências da NBA — fato de franquia, não de elenco', () => {
  it('30 times, 15 em cada conferência', () => {
    const valores = Object.values(CONFERENCIA_POR_SIGLA)
    expect(valores).toHaveLength(30)
    expect(valores.filter((c) => c === 'Leste')).toHaveLength(15)
    expect(valores.filter((c) => c === 'Oeste')).toHaveLength(15)
  })
  it('exemplos que todo mundo sabe', () => {
    expect(conferenciaDe('BOS')).toBe('Leste')
    expect(conferenciaDe('LAL')).toBe('Oeste')
    expect(conferenciaDe('mia')).toBe('Leste') // caixa não importa
  })
  it('sigla fora da NBA não ganha conferência inventada', () => {
    expect(conferenciaDe('XXX')).toBeNull()
  })
})
