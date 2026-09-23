import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db }))
// Com cookie de sessão presente: o portão de cookie (auditoria 23/09) manda
// quem não tem cookie para /entrar ANTES do banco, e este teste é sobre o
// caminho que chega ao banco — o id válido que não existe tem de ser 404.
// O cache dos agregados da temporada só existe no runtime do Next; aqui ele
// é a função crua, como nas outras suítes de tela.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => null,
}))

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
