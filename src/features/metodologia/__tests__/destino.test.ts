import { describe, expect, it } from 'vitest'

import { destinoSeguro } from '@/features/publico/destino'

import { paraOndeVoltar } from '../destino'

/**
 * Pente fino de 09/10, achado 6 (spec §2.7): o aceite da metodologia e o
 * login honram as telas que o portão manda, com o MESMO filtro. O `..` é
 * recusado ANTES da normalização da URL: resolvido, `/fire-live/../admin`
 * viraria `/admin`, que está na allowlist — e o destino pedido não era esse.
 */
const UUID = '0b6f2a4e-6c1d-4c8e-9a51-2f3d4e5a6b7c'

describe('paraOndeVoltar — o destino do aceite', () => {
  it.each(['/fire-live', '/gestao', `/estatisticas/jogador/${UUID}`, '/resultados/2026-01-05', `/apito/${UUID}`])(
    'honra %s',
    (destino) => {
      expect(paraOndeVoltar(destino)).toBe(destino)
    },
  )

  it.each(['//host', '/fire-live/../admin', `/apito/${UUID}?x`, `/apito/${UUID}#x`, '/apito/a\\b'])(
    'recusa %j e cai na abertura',
    (destino) => {
      expect(paraOndeVoltar(destino)).toBe('/abrir')
    },
  )
})

describe('destinoSeguro — o destino do login', () => {
  it.each(['/fire-live', '/gestao', '/resultados/2026-01-05', `/apito/${UUID}`])('honra %s', (destino) => {
    expect(destinoSeguro(destino)).toBe(destino)
  })

  it.each(['//host', '/fire-live/../admin', '/conta/../admin', `/apito/${UUID}?x`])('recusa %j', (destino) => {
    expect(destinoSeguro(destino)).toBe('/')
  })
})
