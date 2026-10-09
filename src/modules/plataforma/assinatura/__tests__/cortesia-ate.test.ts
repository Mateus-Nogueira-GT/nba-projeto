import { describe, expect, it } from 'vitest'

import { fimDaCortesia } from '../precos'

/**
 * Pente fino de 09/10, achado 11 (spec §2.10): `CORTESIA_ATE=2026-12-31`
 * virava `2026-12-31T23:59:59.999Z` (UTC) — 3 h antes do fim do dia em
 * Brasília. Agora a conta é a mesma de `TEMPORADA_FIM`:
 * `intervaloDoDia(dia, fuso).fim`, a meia-noite local do dia seguinte.
 */
describe('fimDaCortesia', () => {
  it('termina na meia-noite LOCAL do dia seguinte, não no fim do dia em UTC', () => {
    expect(fimDaCortesia('2026-12-31', 'America/Sao_Paulo')?.toISOString()).toBe(
      '2027-01-01T03:00:00.000Z',
    )
    expect(fimDaCortesia('2027-06-30', 'America/New_York')?.toISOString()).toBe(
      '2027-07-01T04:00:00.000Z',
    )
  })

  it('sem data, a cortesia não expira', () => {
    expect(fimDaCortesia('', 'America/Sao_Paulo')).toBeNull()
    expect(fimDaCortesia(undefined, 'America/Sao_Paulo')).toBeNull()
  })

  it.each(['31/12/2026', '2026-02-31', 'amanhã'])('data inválida %j lança', (ate) => {
    expect(() => fimDaCortesia(ate, 'America/Sao_Paulo')).toThrow('CORTESIA_ATE inválida (AAAA-MM-DD)')
  })
})
