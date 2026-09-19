import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { gravarConferencia } from './conferencia'

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

async function renderizarFireLive(): Promise<string> {
  const { default: Pagina } = await import('../(app)/fire-live/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

/** Os nomes dos jogadores que a lista de hoje publicou. */
async function nomesDoFeed(): Promise<string[]> {
  const { lerFeed } = await import('../../modules/entrega/lista-secreta')
  const feed = await lerFeed(banco.db, HOJE)
  return [...new Set((feed?.conteudo.itens ?? []).map((i) => i.nome))]
}

describe('o grátis na identidade 05', () => {
  it('a Lista tem a moldura do assinante, a faixa e um cabeçalho REAL por jogo', async () => {
    const html = await renderizarLista()
    await gravarConferencia('identidade-05-gratis-lista', html)

    expect(html).toContain('LISTA SECRETA')
    expect(html).toContain('LISTA DO DIA')
    expect(html).toContain('PRÉ-LIVE')
    expect(html).toContain('COMEÇA NO')

    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const jogos = await jogosDoDiaResumo(banco.db, HOJE, FUSO)
    expect(jogos.length).toBeGreaterThan(0)
    expect((html.match(/class="jogo-frio"/g) ?? []).length).toBe(jogos.length)
  }, 60_000)

  it('uma silhueta por jogo, e nenhum card de verdade', async () => {
    const html = await renderizarLista()
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const jogos = await jogosDoDiaResumo(banco.db, HOJE, FUSO)
    expect((html.match(/_silhueta_/g) ?? []).length).toBe(jogos.length)
    expect(html).not.toContain('<article')
  }, 60_000)

  it('NENHUM nome do feed pago entra no HTML do grátis', async () => {
    // A garantia de fundo do paywall. A silhueta é forma pura: se um dia
    // alguém a alimentar com o conteúdo real e só borrá-lo, este teste fica
    // vermelho — que é exatamente o ponto, porque desfoque é CSS.
    const html = await renderizarLista()
    const nomes = await nomesDoFeed()
    expect(nomes.length).toBeGreaterThan(0)
    for (const nome of nomes) expect(html).not.toContain(nome)
  }, 60_000)

  it('a silhueta é forma pura: aria-hidden e sem número nenhum dentro', async () => {
    const html = await renderizarLista()
    const silhuetas = [...html.matchAll(/<div class="[^"]*_silhueta_[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    expect(silhuetas.length).toBeGreaterThan(0)
    for (const [inteiro, dentro] of silhuetas) {
      expect(inteiro).toContain('aria-hidden="true"')
      expect(dentro!.replace(/<[^>]+>/g, '')).toBe('')
    }
  }, 60_000)

  it('o Fire Live do grátis nunca veste o universo QUENTE nas silhuetas', async () => {
    const html = await renderizarFireLive()
    await gravarConferencia('identidade-05-gratis-firelive', html)
    expect(html).toContain('COMEÇA NO')
    // O gradiente quente é o modo fire, e o modo fire é o sinal. Ele pode
    // vestir o cabeçalho do jogo (a tela é a do ao vivo), nunca a silhueta.
    const { componente } = await import('../../design-system/tokens/componente')
    const dentroDasSilhuetas = [
      ...html.matchAll(/<div class="[^"]*_silhueta_[^"]*"[\s\S]*?<\/div>/g),
    ]
      .map((m) => m[0]!)
      .join('')
    expect(dentroDasSilhuetas).not.toContain(componente.contextoQuente.cardGradiente)
  }, 60_000)

  it('o assistente não existe para o grátis, nem na lateral nem flutuando', async () => {
    const html = await renderizarLista()
    expect(html).not.toContain('Pergunte sobre a lista de hoje')
    expect(html).not.toContain('Abrir o assistente')
  }, 60_000)
})
