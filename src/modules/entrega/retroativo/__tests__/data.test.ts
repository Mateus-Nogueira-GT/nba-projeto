import { describe, expect, it } from 'vitest'

import { dataCalendarioValida } from '../data'

describe('dataCalendarioValida', () => {
  it('aceita uma data válida', () => {
    expect(dataCalendarioValida('2025-11-01')).toBe(true)
  })

  it('recusa 30 de fevereiro', () => {
    expect(dataCalendarioValida('2025-02-30')).toBe(false)
  })

  it('recusa 31 de abril (abril tem 30 dias)', () => {
    expect(dataCalendarioValida('2025-04-31')).toBe(false)
  })

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(dataCalendarioValida('2024-02-29')).toBe(true)
  })

  it('recusa 29 de fevereiro fora de ano bissexto', () => {
    expect(dataCalendarioValida('2025-02-29')).toBe(false)
  })
})
