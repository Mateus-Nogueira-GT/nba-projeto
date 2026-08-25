import { describe, expect, it } from 'vitest'

import { temporadaDe } from '../temporada'

const CONFIG = { mesInicio: 10, formato: 'dois_anos' as const, fuso: 'America/Sao_Paulo' }

describe('temporadaDe', () => {
  it('mantém março de 2026 na temporada NBA 2025-26', () => {
    expect(temporadaDe(new Date('2026-03-15T12:00:00.000Z'), CONFIG)).toBe('2025-26')
  })

  it('vira a temporada na meia-noite do FUSO, não na de UTC', () => {
    // 01/10 às 00:00Z ainda é 30/09 às 21:00 em Brasília: a temporada nova
    // não começou. Este é o comportamento que o fuso do cliente define — e o
    // motivo de a virada não poder ser calculada em UTC.
    expect(temporadaDe(new Date('2026-10-01T00:00:00.000Z'), CONFIG)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T02:59:59.999Z'), CONFIG)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T03:00:00.000Z'), CONFIG)).toBe('2026-27')
  })

  it('trocar o fuso move a fronteira junto', () => {
    const nova_york = { ...CONFIG, fuso: 'America/New_York' }

    // 01/10 às 03:00Z é 30/09 às 23:00 em Nova York — ainda a temporada velha.
    expect(temporadaDe(new Date('2026-10-01T03:00:00.000Z'), nova_york)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T04:00:00.000Z'), nova_york)).toBe('2026-27')
  })
})
