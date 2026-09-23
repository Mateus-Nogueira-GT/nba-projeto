import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FALHA NO REGISTRO NÃO PERDE O CLIQUE (auditoria de 23/09).
 *
 * O registro do clique (transação com locks e inserts) ficava no caminho do
 * redirect: com o pool do banco cheio, o visitante ia para "oferta
 * indisponível" e a comissão se perdia junto com o clique.
 */

const estado = vi.hoisted(() => ({ resolver: vi.fn(), registrar: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('@/modules/plataforma/auth/cookies', () => ({ sessaoAtual: async () => null }))
vi.mock('@/modules/plataforma/afiliados/servico', () => ({
  resolverDestinoDaCasaSemRegistrar: estado.resolver,
  registrarSaidaParaCasa: estado.registrar,
}))

import { GET } from '../route'

const pedir = () =>
  GET(
    new Request('http://local/ir/abc', {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15' },
    }),
    { params: Promise.resolve({ codigo: 'abc' }) },
  )

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://teste'
  estado.resolver.mockReset()
  estado.registrar.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('/ir/[codigo]', () => {
  it('registro falhou: o visitante ainda chega à casa', async () => {
    estado.resolver.mockResolvedValue('https://casa.example/oferta')
    estado.registrar.mockRejectedValue(new Error('pool esgotado'))
    const r = await pedir()
    expect(r.headers.get('location')).toBe('https://casa.example/oferta')
  })

  it('link inválido continua em oferta-indisponivel', async () => {
    estado.resolver.mockRejectedValue(new Error('link inexistente'))
    estado.registrar.mockRejectedValue(new Error('link inexistente'))
    const r = await pedir()
    expect(r.headers.get('location')).toBe('http://local/oferta-indisponivel')
  })
})
