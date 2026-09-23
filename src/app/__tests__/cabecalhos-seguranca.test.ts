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

  it('next corrigido (GHSA-2xp9-vwfh-vxw4) — piso, não literal', () => {
    // Achado Minor 4 da revisão: travar em '^16.3.6' quebrava o teste a cada
    // patch de segurança seguinte. O que importa é nunca regredir abaixo da
    // versão corrigida — por isso o piso >=, comparado numericamente.
    const pacote = JSON.parse(readFileSync('package.json', 'utf8'))
    const versao = String(pacote.dependencies.next).replace(/^[\^~]/, '')
    const partes = versao.split('.').map(Number)
    const major = partes[0] ?? 0
    const minor = partes[1] ?? 0
    const patch = partes[2] ?? 0
    const [pisoMajor, pisoMinor, pisoPatch] = [16, 3, 6]
    const atual = major * 1_000_000 + minor * 1_000 + patch
    const piso = pisoMajor * 1_000_000 + pisoMinor * 1_000 + pisoPatch
    expect(atual).toBeGreaterThanOrEqual(piso)
  })
})
