import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db }))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@teste.com',
  }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

async function renderizar(data: string) {
  const { default: pagina } = await import('../(app)/resultados/[data]/page')
  return pagina({ params: Promise.resolve({ data }), searchParams: Promise.resolve({}) })
}

// O diagnóstico de 13/09 (B2): `/resultados/0001-01-01` autenticado lançava
// `RangeError: Invalid time value` — 500 para usuário logado. A data é do
// calendário, então a rodada é vazia, não um redirect.
describe('URL de resultados: data válida de qualquer ano não lança', () => {
  it.each(['0001-01-01', '0999-12-31', '9999-12-31'])(
    '%s renderiza uma rodada vazia',
    async (data) => {
      await expect(renderizar(data)).resolves.toBeDefined()
    },
  )

  it.each(['abc', '2026-02-30', '2026-13-45', '2026-1-5'])(
    '%s redireciona para a rodada de hoje',
    async (data) => {
      await expect(renderizar(data)).rejects.toThrow('NEXT_REDIRECT')
    },
  )
})
