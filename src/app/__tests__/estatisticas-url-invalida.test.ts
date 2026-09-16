import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db }))

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

const paginas = {
  jogador: async (id: string) => {
    const { default: pagina } = await import('../(app)/estatisticas/jogador/[id]/page')
    return pagina({ params: Promise.resolve({ id }) })
  },
  time: async (id: string) => {
    const { default: pagina } = await import('../(app)/estatisticas/time/[id]/page')
    return pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })
  },
  jogo: async (id: string) => {
    const { default: pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
    return pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })
  },
}

describe.each(Object.entries(paginas))('URL de estatísticas: %s', (_nome, pagina) => {
  it.each(['abc', '1', '00000000-0000-4000-8000-000000000099'])(
    '%s responde não encontrado, sem erro de conversão UUID no Postgres',
    async (id) => {
      await expect(pagina(id)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    },
  )
})
