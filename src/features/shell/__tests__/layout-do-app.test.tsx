import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * A CASCA DO V2 — `src/app/(app)/layout.tsx`.
 *
 * Ela envolve TODA tela logada, inclusive `/metodologia` (o aceite) e as que
 * redirecionam para lá. Por isso a casca só LÊ a sessão, sem `exigirNivel`:
 * o guarda redireciona para `/metodologia` quando o aceite falta, e a própria
 * `/metodologia` mora dentro desta casca — seria laço. Quem barra é a TELA.
 *
 * O banco não entra: a sessão, o acesso e a identidade do topo são simulados.
 */

let sessao: { usuarioId: string; email: string; papel?: string } | null = null
let nivel: NivelDoPlano = 'MVP'
let aceite: Date | null = new Date('2026-09-20T12:00:00.000Z')

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => (sessao ? 'token' : null),
  sessaoAtual: async () => sessao,
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivel, aceite) }
})
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}), fecharDb: async () => {} }))
vi.mock('@/features/conta/carregar', () => ({
  identidadeDoUsuario: async (_id: string, email: string) => ({ nome: 'Pessoa', email, fotoUrl: null }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    redirect: (destino: string) => {
      throw new Error(`a casca redirecionou para ${destino}`)
    },
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  }
})

async function renderizar(): Promise<string> {
  const { default: Layout } = await import('@/app/(app)/layout')
  return renderToStaticMarkup(
    await Layout({ children: <p>conteudo-da-tela</p>, painel: <p>conteudo-do-painel</p> }),
  )
}

beforeEach(() => {
  vi.stubEnv('CHAT_HABILITADO', 'true')
  vi.stubEnv('CHAT_COTA_DIARIA_MVP', '20')
  vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '60')
  sessao = { usuarioId: '00000000-0000-4000-8000-000000000001', email: 'demo@teste.com' }
  nivel = 'MVP'
  aceite = new Date('2026-09-20T12:00:00.000Z')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a casca do app não é um portão', () => {
  it('sem sessão desenha a moldura, sem redirecionar da casca', async () => {
    sessao = null
    const html = await renderizar()
    expect(html).toContain('conteudo-da-tela')
    expect(html).not.toContain('Sixth Man AI')
  })

  it('com a metodologia NÃO aceita também desenha, sem redirecionar (senão /metodologia faria laço)', async () => {
    aceite = null
    const html = await renderizar()
    expect(html).toContain('conteudo-da-tela')
    expect(html).toContain('conteudo-do-painel')
  })

  it('a fonte da casca não chama exigirNivel', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/app/(app)/layout.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(fonte).not.toContain('exigirNivel')
  })
})

describe('o que a casca mostra', () => {
  it('o aviso 18+ está na moldura', async () => {
    expect(await renderizar()).toContain('Aposta não é investimento')
  })

  it('o assistente é do MVP para cima e só com o chat ligado', async () => {
    expect(await renderizar()).toContain('Sixth Man AI')
    nivel = 'GRATIS'
    expect(await renderizar()).not.toContain('Sixth Man AI')
    nivel = 'MVP'
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    expect(await renderizar()).not.toContain('Sixth Man AI')
    vi.stubEnv('CHAT_HABILITADO', 'true')
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '')
    expect(await renderizar()).not.toContain('Sixth Man AI')
  })

  it('o item Admin só aparece para o papel ADMIN', async () => {
    expect(await renderizar()).not.toContain('href="/admin"')
    sessao = { ...sessao!, papel: 'ADMIN' }
    expect(await renderizar()).toContain('href="/admin"')
  })
})
