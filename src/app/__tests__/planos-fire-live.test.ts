import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'
import type { FeedFireLive } from '../../modules/entrega/fire-live/leitura'

/**
 * O FIRE LIVE POR NÍVEL (spec §5, linha 3).
 *
 * Mesmo arnês de `telas-04-firelive.test.ts` — temporada simulada com 21 dias
 * de histórico, que é o que garante jogo ao vivo no 1º quarto em 15/01 — mais
 * o ACESSO MUTÁVEL de `planos-home.test.ts`: um banco só, um `beforeAll` só,
 * e `nivelNoTeste` alterna a renderização entre GRATIS e MVP no mesmo
 * arquivo. NENHUMA asserção nomeia jogador ou time: o sujeito vem do banco.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelNoTeste: NivelDoPlano = 'GRATIS'

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelNoTeste) }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
// `AtualizarAoVivo` usa `useRouter`, e `renderToStaticMarkup` não monta o App
// Router. O resto do módulo continua de verdade (`redirect`, para o dia em
// que a guarda ainda bloquear algum nível aqui).
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()` — sem congelar o relógio no
  // instante semeado, ela nunca acharia a rodada de 15/01.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

/** O mesmo feed que a página paga leria — o sujeito das asserções sai daqui. */
async function feedDaTela(): Promise<FeedFireLive> {
  const { lerFeedFireLive } = await import('../../modules/entrega/fire-live/leitura')
  const ruleset = await rulesetAtivo()
  return lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
}

async function renderizar(): Promise<string> {
  const { default: Pagina } = await import('../(app)/fire-live/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

describe('o Fire Live por nível (spec §5, linha 3)', () => {
  it('GRATIS vê os jogos e o convite — nunca um apito nem o modo fire', async () => {
    nivelNoTeste = 'GRATIS'
    const feed = await feedDaTela()
    expect(feed.itens.length, 'a temporada simulada precisa de apito ao vivo em 15/01').toBeGreaterThan(
      0,
    )

    const html = await renderizar()

    expect(html).toContain('começa no')
    expect(html).toMatch(/href="\/assinar\?nivel=MVP&(amp;)?voltar=%2Ffire-live"/)

    // O sinal NÃO está — varrendo TODO o feed que o pago leria, não só o
    // primeiro item: nenhum nome, nenhum link de apito, nenhum modo fire,
    // nenhuma confiança.
    for (const item of feed.itens) expect(html).not.toContain(item.nome)
    expect(html).not.toContain('href="/apito/')
    expect(html).not.toMatch(/modo fire/i)
    expect(html).not.toMatch(/confian[çc]a/i)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('MVP vê o painel do 1º quarto', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizar()
    expect(html).not.toContain('começa no')
    expect(html).toContain('href="/apito/')
  })
})
