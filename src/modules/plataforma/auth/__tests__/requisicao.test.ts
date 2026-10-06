import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { destinoInternoSeguro } from '../requisicao'

// O token REAL do convite: `criarConvite` gera 32 bytes em base64url, que
// são sempre 43 caracteres de [A-Za-z0-9_-]. O teste usa o mesmo gerador
// para a regex nunca divergir do formato que a equipe manda por e-mail.
const TOKEN_REAL = randomBytes(32).toString('base64url')

describe('destinoInternoSeguro — a volta para a área de afiliados', () => {
  it.each([
    ['/afiliados', '/afiliados'],
    [`/afiliados/convite/${TOKEN_REAL}`, `/afiliados/convite/${TOKEN_REAL}`],
    ['/afiliados/convite/Ab_c-123Ab_c-123Ab_c-123Ab_c-123Ab_c-123Ab_', '/afiliados/convite/Ab_c-123Ab_c-123Ab_c-123Ab_c-123Ab_c-123Ab_'],
  ])('aceita %s', (entrada, esperado) => {
    expect(destinoInternoSeguro(entrada)).toBe(esperado)
  })

  it.each([
    '/afiliados/convite/../../x',
    '//evil.com',
    '/afiliados/convite/a/b',
    '/afiliados/convite/',
    '/afiliados/convite/curto',
    `/afiliados/convite/${TOKEN_REAL}x`,
    `/afiliados/convite/${TOKEN_REAL.slice(1)}`,
    `/afiliados/convite/${TOKEN_REAL}/`,
    `/afiliados/convite/${TOKEN_REAL}?x=1`,
    `/afiliados/convite/${TOKEN_REAL}\n`,
    `/afiliados/convite/${TOKEN_REAL.slice(0, 42)}\\`,
    `/afiliados/convite/${TOKEN_REAL.slice(0, 42)}.`,
    '/afiliados/',
    '/afiliados/painel',
    '/afiliadosx',
    'https://evil.com/afiliados',
  ])('recusa %j', (entrada) => {
    expect(destinoInternoSeguro(entrada)).toBe('/')
  })

  it('a allowlist de antes continua igual', () => {
    for (const destino of ['/', '/abrir', '/assinar', '/conta', '/admin', '/admin/usuarios']) {
      expect(destinoInternoSeguro(destino)).toBe(destino)
    }
    expect(destinoInternoSeguro('/gestao')).toBe('/')
  })
})
