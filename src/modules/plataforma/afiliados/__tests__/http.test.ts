import { describe, expect, it } from 'vitest'

import { novoTokenVisitante, requisicaoAutomatizada } from '../http'

describe('rastreio HTTP de afiliados', () => {
  it('separa navegação humana de HEAD e pré-visualizadores', () => {
    expect(requisicaoAutomatizada(new Request('https://nip.test/r/x', { method: 'HEAD' }))).toBe(
      true,
    )
    expect(
      requisicaoAutomatizada(
        new Request('https://nip.test/r/x', { headers: { 'user-agent': 'Slackbot 1.0' } }),
      ),
    ).toBe(true)
    expect(
      requisicaoAutomatizada(
        new Request('https://nip.test/r/x', { headers: { 'user-agent': 'Mozilla/5.0' } }),
      ),
    ).toBe(false)
  })

  it('gera identificador opaco compatível com o domínio', () => {
    expect(novoTokenVisitante()).toMatch(/^[a-z0-9]{32}$/)
  })
})
