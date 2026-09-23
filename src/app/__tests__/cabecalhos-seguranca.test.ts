import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * CABEÇALHOS DE SEGURANÇA (auditoria de 23/09).
 *
 * Sem eles, um site de fora embutia `/conta` num iframe e induzia o clique em
 * "cancelar assinatura". O teste lê a fonte SEM comentários: um cabeçalho
 * comentado não é um cabeçalho.
 */
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('cabeçalhos de segurança', () => {
  const config = semComentarios(readFileSync('next.config.ts', 'utf8'))

  it('toda rota recebe os cinco cabeçalhos', () => {
    expect(config).toMatch(/source: '\/:path\*'/)
    for (const chave of [
      "key: 'X-Frame-Options', value: 'DENY'",
      "key: 'Content-Security-Policy', value: \"frame-ancestors 'none'\"",
      "key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'",
      "key: 'X-Content-Type-Options', value: 'nosniff'",
      "key: 'Permissions-Policy'",
    ]) {
      expect(config).toContain(chave)
    }
  })

  it('a regra global vem ANTES da de /redefinir — o no-referrer de lá prevalece', () => {
    expect(config.indexOf("source: '/:path*'")).toBeLessThan(
      config.indexOf("source: '/redefinir/:token'"),
    )
  })

  it('next corrigido (GHSA-2xp9-vwfh-vxw4)', () => {
    const pacote = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pacote.dependencies.next).toBe('^16.3.6')
  })
})
