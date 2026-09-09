import { describe, expect, it } from 'vitest'

import { filtroDePeriodo } from '../periodo'

describe('período comercial em São Paulo', () => {
  it('usa o mesmo intervalo exclusivo para cards e tabelas', () => {
    const filtro = filtroDePeriodo('2026-09-01', '2026-09-08')
    expect(filtro.inicio?.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(filtro.fim?.toISOString()).toBe('2026-09-09T03:00:00.000Z')
  })

  it('rejeita intervalo incompleto ou invertido', () => {
    expect(() => filtroDePeriodo('2026-09-08', undefined)).toThrow('Período inválido')
    expect(() => filtroDePeriodo('2026-09-08', '2026-09-01')).toThrow('Período inválido')
  })
})
