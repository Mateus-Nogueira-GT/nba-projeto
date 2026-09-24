import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'

/**
 * O QUE O GRÁTIS VÊ — a vestimenta do paywall (identidade 05, §8).
 *
 * O que ele PODE ver está fixado na spec de planos (§5 e §6) e não mudou; o que
 * esta suíte cobra é a forma nova: moldura igual à do assinante, faixa azul,
 * cabeçalhos de jogo REAIS e silhuetas no lugar dos cards.
 *
 * E cobra, sobretudo, que a silhueta não seja conteúdo escondido: nenhum nome
 * do feed pode aparecer no HTML. Desfoque é CSS, e CSS o leitor desliga.
 *
 * Mesmo arnês das outras telas, com `acessoDeTeste('GRATIS')`. Nenhuma asserção
 * nomeia jogador, time ou horário — o sujeito é lido do banco.
 */
const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO_DEMO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('GRATIS') }
})
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
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
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarLista(): Promise<string> {
  const { default: Pagina } = await import('../(app)/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

/** Os nomes dos jogadores que a lista de hoje publicou. */
async function nomesDoFeed(): Promise<string[]> {
  const { lerFeed } = await import('../../modules/entrega/lista-secreta')
  const feed = await lerFeed(banco.db, HOJE)
  return [...new Set((feed?.conteudo.itens ?? []).map((i) => i.nome))]
}

describe('o grátis na identidade 05', () => {
  // Front v2 (Tarefa 3): os casos que liam a marcação da Lista ANTIGA do grátis
  // (moldura, silhuetas, faixa da lateral) saíram com ela; o portão da Lista
  // nova está em `src/features/lista/__tests__/fumaca.test.tsx`. Ficam os que
  // valem para qualquer marcação.
  it('NENHUM nome do feed pago entra no HTML do grátis', async () => {
    // A garantia de fundo do paywall. A silhueta é forma pura: se um dia
    // alguém a alimentar com o conteúdo real e só borrá-lo, este teste fica
    // vermelho — que é exatamente o ponto, porque desfoque é CSS.
    const html = await renderizarLista()
    const nomes = await nomesDoFeed()
    expect(nomes.length).toBeGreaterThan(0)
    for (const nome of nomes) expect(html).not.toContain(nome)
  }, 60_000)

  // Front v2 (Tarefa 4): o Fire Live do grátis (convite e silhueta sem o
  // universo quente) migrou para `src/features/ao-vivo/__tests__/fumaca.test.tsx`.

  // Front v2 (Tarefa 12): "o assistente não existe para o grátis" saiu daqui —
  // a página não desenha a casca, e é a casca quem decide o assistente:
  // `features/shell/__tests__/layout-do-app.test.tsx` › "o assistente é do MVP
  // para cima e só com o chat ligado".
})
