import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogadores, times, usuarios } from '@/modules/dominio/db/schema'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

import { carregarComparacao, mediasDoTime } from '../comparar'
import { carregarJogador } from '../jogador'
import { carregarTime } from '../time'

type Params = Record<string, string | string[] | undefined>

/** Integração do carregador da comparação: PGlite com a temporada simulada, mesmo preparo da fumaça. */
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelDoTeste) }
})
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db.insert(usuarios).values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' }).onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()`. Só `Date` — timers travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

describe('carregarComparacao', () => {
  it('jogadores: os números de cada lado são os da página do jogador', async () => {
    const [j1, j2] = (await banco.db.select({ id: jogadores.id }).from(jogadores).limit(2)).map((j) => j.id)
    const dados = await carregarComparacao({ tipo: 'jogador', a: j1!, b: j2!, periodo: '5' })
    expect(dados.modo).toBe('comparacao')
    if (dados.modo !== 'comparacao' || dados.tipo !== 'jogador') throw new Error('modo errado')
    const pagina = await carregarJogador(j1!, { periodo: '5' })
    expect(dados.a.tela.perfilNumeros).toEqual(pagina.tela.perfilNumeros)
    expect(dados.a.tela.historico).toEqual(pagina.tela.historico)
    expect(dados.b.tela.perfil.id).toBe(j2)
  })

  it('times: as médias saem do mesmo jogosDoTime da página do time, e os confrontos só entre os dois', async () => {
    const [t1, t2] = (await banco.db.select({ id: times.id }).from(times).limit(2)).map((t) => t.id)
    const dados = await carregarComparacao({ tipo: 'time', a: t1!, b: t2! })
    if (dados.modo !== 'comparacao' || dados.tipo !== 'time') throw new Error('modo errado')
    const pagina = await carregarTime(t1!, {})
    expect(dados.a.medias).toEqual(mediasDoTime(pagina.tela.jogosDoTime))
    for (const c of dados.confrontos.jogos) {
      expect([c.siglaCasa, c.siglaVisitante].sort()).toEqual([dados.a.tela.time.sigla, dados.b.tela.time.sigla].sort())
    }
  })

  it('grátis na temporada atual: profundidade false, sem confrontos lidos', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const [t1, t2] = (await banco.db.select({ id: times.id }).from(times).limit(2)).map((t) => t.id)
      const dados = await carregarComparacao({ tipo: 'time', a: t1!, b: t2! })
      if (dados.modo !== 'comparacao') throw new Error('modo errado')
      expect(dados.profundidade).toBe(false)
      if (dados.tipo === 'time') expect(dados.confrontos.jogos).toEqual([])
    } finally {
      nivelDoTeste = 'MVP'
    }
  })

  it('sem b: modo escolha com a busca filtrada pelo tipo e sem o próprio A', async () => {
    const [j1] = await banco.db.select({ id: jogadores.id, nome: jogadores.nomeCompleto }).from(jogadores).limit(1)
    const dados = await carregarComparacao({ tipo: 'jogador', a: j1!.id, q: j1!.nome.split(' ')[0]! })
    expect(dados.modo).toBe('escolha')
    if (dados.modo !== 'escolha') throw new Error('modo errado')
    expect(dados.resultados.every((r) => r.tipo === 'JOGADOR')).toBe(true)
    expect(dados.resultados.some((r) => r.id === j1!.id)).toBe(false)
  })

  it.each([
    [{ tipo: 'clube', a: '00000000-0000-4000-8000-000000000001' }],
    [{ tipo: 'jogador', a: 'nao-e-uuid' }],
    [{ tipo: 'jogador', a: '00000000-0000-4000-8000-000000000001', b: '00000000-0000-4000-8000-000000000001' }],
    [{ tipo: 'jogador', a: '00000000-0000-4000-8000-0000000000aa' }],
  ])('%j dá notFound', async (params) => {
    await expect(carregarComparacao(params as Params)).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    })
  })
})
