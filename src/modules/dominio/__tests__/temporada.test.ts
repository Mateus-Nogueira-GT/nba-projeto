import { describe, expect, it } from 'vitest'

import { temporadaDe } from '../temporada'

const CONFIG = { mesInicio: 10, formato: 'dois_anos' as const }

describe('temporadaDe', () => {
  it('mantém março de 2026 na temporada NBA 2025-26', () => {
    expect(temporadaDe(new Date('2026-03-15T12:00:00.000Z'), CONFIG)).toBe('2025-26')
  })

  it('vira a temporada no mês configurado', () => {
    expect(temporadaDe(new Date('2026-09-30T23:59:59.999Z'), CONFIG)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T00:00:00.000Z'), CONFIG)).toBe('2026-27')
  })
})
