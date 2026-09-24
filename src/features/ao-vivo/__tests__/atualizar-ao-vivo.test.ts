import { describe, expect, it } from 'vitest'

import { proximoIntervalo } from '../AtualizarAoVivo'

/**
 * Jitter do ao vivo (W2-6): 2 mil telas abertas no mesmo apito não podem
 * bater no servidor no mesmo segundo. `proximoIntervalo` é pura — sem mock,
 * sem tempo real — para o teste não depender de temporizador.
 */
describe('jitter do ao vivo', () => {
  it('fica em base ± 10 s', () => {
    expect(proximoIntervalo(30_000, () => 0)).toBe(20_000)
    expect(proximoIntervalo(30_000, () => 0.5)).toBe(30_000)
    expect(proximoIntervalo(30_000, () => 0.999999)).toBeLessThanOrEqual(40_000)
  })
  it('nunca abaixo de 5 s, mesmo com base pequena', () => {
    expect(proximoIntervalo(8_000, () => 0)).toBe(5_000)
  })
})
