import { describe, expect, it } from 'vitest'

import { caminhoInterno } from '../destino'

/**
 * `caminhoInterno` alimenta o `href` do "Voltar" de /assinar — a tela de
 * pagamento. Um `href` que comece com `//` é protocol-relative: sai do app
 * mesmo com a origem conferida ANTES, porque o `URL` normaliza `.`/`..`
 * depois dela (`/.//evil.com` → pathname `//evil.com`). Fix round 1 da T7.
 */
describe('caminhoInterno — só caminho interno, depois de normalizado', () => {
  it.each([
    ['/.//evil.com'],
    ['/..//evil.com'],
    ['/a/..//evil.com'],
    ['x/..//evil.com'],
    ['/./\\evil.com'],
    ['//evil.com'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['/a\\b'],
    ['/a\u0000b'],
    ['/a\tb'],
    ['/a\nb'],
    ['/a\u007fb'],
  ])('%j cai no padrão', (bruto) => {
    expect(caminhoInterno(bruto)).toBe('/')
    expect(caminhoInterno(bruto, '/conta')).toBe('/conta')
  })

  it.each([
    ['/gestao', '/gestao'],
    ['/fire-live?data=2026-01-15#q1', '/fire-live?data=2026-01-15#q1'],
    ['/../admin', '/admin'],
    ['/', '/'],
  ])('%j → %j', (bruto, esperado) => {
    expect(caminhoInterno(bruto)).toBe(esperado)
  })

  it('vazio ou ausente cai no padrão', () => {
    expect(caminhoInterno('')).toBe('/')
    expect(caminhoInterno(undefined)).toBe('/')
    expect(caminhoInterno(null, '/conta')).toBe('/conta')
  })
})
