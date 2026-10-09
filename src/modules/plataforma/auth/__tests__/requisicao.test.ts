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
    expect(destinoInternoSeguro('/rota-que-nao-existe')).toBe('/')
  })
})

// Pente fino de 09/10, achado 6 (spec §2.7): as telas para onde o portão
// (`exigirNivel`) manda quem não está logado voltam a ser honradas no login e
// no aceite — casadas por FORMA, sem `..`, `?`, `#`, `//`, `\` ou controle.
describe('destinoInternoSeguro — as telas que o portão manda', () => {
  const UUID = '0b6f2a4e-6c1d-4c8e-9a51-2f3d4e5a6b7c'

  it.each([
    '/fire-live',
    '/gestao',
    '/estatisticas',
    `/estatisticas/jogador/${UUID}`,
    `/estatisticas/time/${UUID}`,
    `/estatisticas/jogo/${UUID}`,
    '/resultados/2026-01-05',
    `/apito/${UUID}`,
    '/apito/abc_DEF-123',
  ])('aceita %s', (entrada) => {
    expect(destinoInternoSeguro(entrada)).toBe(entrada)
  })

  it.each([
    '//host',
    '//evil.com/fire-live',
    '/fire-live/../admin',
    '/fire-live/',
    '/fire-livex',
    '/gestao/x',
    '/gestao?x=1',
    '/estatisticas/',
    '/estatisticas//jogador',
    '/estatisticas/../admin',
    '/estatisticas/jogador/a.b',
    '/estatisticas/jogador/x#y',
    '/resultados/2026-1-5',
    '/resultados/hoje',
    '/resultados/2026-01-05?time=x',
    '/resultados/2026-01-05/x',
    `/apito/${UUID}?x`,
    `/apito/${UUID}#x`,
    `/apito/${UUID}/`,
    '/apito/',
    '/apito/..',
    '/apito/a\\b',
    `/apito/${UUID}\n`,
    `/apito/${UUID}\u0000`,
    'https://evil.com/fire-live',
  ])('recusa %j', (entrada) => {
    expect(destinoInternoSeguro(entrada)).toBe('/')
  })
})
