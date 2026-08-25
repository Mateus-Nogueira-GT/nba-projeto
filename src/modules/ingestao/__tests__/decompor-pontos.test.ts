import { describe, expect, it } from 'vitest'

import { decomporPontos } from '../demo/dados'

describe('decomporPontos (demo)', () => {
  it('a identidade fecha para qualquer placar: 2·2P + 3·3P + LL = pontos', () => {
    for (let pontos = 0; pontos <= 45; pontos++) {
      const d = decomporPontos(pontos)
      expect(d.doisC * 2 + d.tresC * 3 + d.lanceC, `pontos=${pontos}`).toBe(pontos)
      // tentativas nunca menores que acertos, e nada negativo
      expect(d.doisT).toBeGreaterThanOrEqual(d.doisC)
      expect(d.tresT).toBeGreaterThanOrEqual(d.tresC)
      expect(d.lanceT).toBeGreaterThanOrEqual(d.lanceC)
      expect(Math.min(d.doisC, d.tresC, d.lanceC)).toBeGreaterThanOrEqual(0)
      // FG agrega 2P e 3P
      expect(d.cestasC).toBe(d.doisC + d.tresC)
      expect(d.cestasT).toBe(d.doisT + d.tresT)
    }
  })

  it('é determinística — o seed é reexecutável', () => {
    expect(decomporPontos(27)).toEqual(decomporPontos(27))
  })
})
