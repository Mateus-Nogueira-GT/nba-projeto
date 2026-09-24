import { count, countDistinct, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogos, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { agruparPorJogador, lerFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * CENÁRIOS DA TEMPORADA — duas sementes, dois bancos.
 *
 * A semente padrão numa PGlite com 49 dias (a janela inteira, ~315 partidas)
 * e uma segunda semente noutra PGlite com 21 dias: se a Gestão só funciona
 * porque a primeira rodada é generosa, a segunda mostra. E a TRAVA DE VOLUME
 * é o que impede a temporada de encurtar em silêncio num refactor da
 * simulação — uma demo pela metade parece funcionar.
 */

const FUSO = 'America/Sao_Paulo'
type Banco = Awaited<ReturnType<typeof bancoDeTeste>>
type Mundo = { banco: Banco; agora: Date; hoje: string; usuarioId: string }

let ativo: Mundo
let a: Mundo
let b: Mundo

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: ativo.usuarioId, email: 'x@teste.com', dispositivoId: null }),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ativo.banco.db, fecharDb: async () => {} }))

async function mundo(agora: Date, diasDeHistorico: number, semente?: string): Promise<Mundo> {
  const banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), agora, { diasDeHistorico, llm: new LLMFake(), semente })
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: `${semente ?? 'padrao'}@teste.com`, senhaHash: 'x', metodologiaAceitaEm: agora })
    .returning({ id: usuarios.id })
  await concederCortesia(banco.db, {
    usuarioId: u!.id,
    referencia: `cortesia:${semente ?? 'padrao'}`,
    inicio: agora,
    fim: null,
    nivelDoPlano: 'ALL_STAR',
  })
  return { banco, agora, hoje: dataDeReferencia(agora, FUSO), usuarioId: u!.id }
}

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  a = await mundo(new Date('2026-01-15T18:00:00.000Z'), 49)
  b = await mundo(new Date('2026-02-20T18:00:00.000Z'), 21, 'pente-fino-b')
  vi.useFakeTimers({ toFake: ['Date'] })
}, 600_000)

afterAll(async () => {
  vi.useRealTimers()
  await a.banco.fechar()
  await b.banco.fechar()
})

function entrar(m: Mundo) {
  ativo = m
  vi.setSystemTime(m.agora)
}

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

describe('trava de volume — a temporada tem MUITAS partidas mesmo', () => {
  // Medido em 22/09/2026 com a semente padrão: 315 encerrados, 4.629 linhas de
  // box, 50 rodadas. Os pisos ficam ~80 % abaixo para a trava não ser frágil.
  it('49 dias: ≥ 250 jogos encerrados, ≥ 3.500 linhas de box, ≥ 40 rodadas', async () => {
    const [encerrados] = await a.banco.db
      .select({ n: count() })
      .from(jogos)
      .where(eq(jogos.status, 'ENCERRADO'))
    const [box] = await a.banco.db.select({ n: count() }).from(estatisticasJogo)
    const [rodadas] = await a.banco.db.select({ n: countDistinct(jogos.dataReferencia) }).from(jogos)
    expect(encerrados!.n).toBeGreaterThanOrEqual(250)
    expect(box!.n).toBeGreaterThanOrEqual(3500)
    expect(rodadas!.n).toBeGreaterThanOrEqual(40)
  })
})

describe.each([
  ['semente padrão, 49 dias', () => a],
  ['semente pente-fino-b, 21 dias', () => b],
])('rodada cheia · %s', (_rotulo, pegar) => {
  it('um "Registrei" por card com linha, e o resumo conta os apitos certos', async () => {
    const m = pegar()
    entrar(m)
    const feed = await lerFeed(m.banco.db, m.hoje)
    const itens = feed!.conteudo.itens
    // A unidade da tela é o CARD — um por jogador e atributo, com a linha de
    // maior confiança —, não o item do feed: o motor emite um item por linha
    // (15+/20+/25+ do mesmo jogador) e a Gestão espelha a Lista Secreta, que
    // agrupa. Contar itens daria 18 "Registrei" onde a tela mostra 6.
    const cards = agruparPorJogador(itens)
    const comLinha = cards.filter((i) => i.linha !== null)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBe(new Set(itens.map((i) => `${i.jogadorId}|${i.atributo}`)).size)

    const html = await renderizar()
    const registrei = (html.match(/>Registrei</g) ?? []).length
    expect(registrei).toBe(comLinha.length)
    expect(html).toContain(`${cards.length} apito${cards.length === 1 ? '' : 's'} na lista`)

    const siglas = new Set(itens.map((i) => i.timeSigla))
    // Front v2 (Tarefa 6): um `<section aria-label="<time>">` com cabeçalho por grupo.
    const grupos = (html.match(/<section[^>]*aria-label="[^"]+"[^>]*><header/g) ?? []).length
    expect(grupos).toBe(siglas.size)
  })

  it('item SEM linha: sem formulário e sem erro — o link do jogador continua', async ({ skip }) => {
    const m = pegar()
    entrar(m)
    const feed = await lerFeed(m.banco.db, m.hoje)
    // Sem linha é o CARD, não um item qualquer: um item sem linha cujo jogador
    // tem outra linha mais confiante nem vira card (ver o teste acima).
    const semLinha = agruparPorJogador(feed!.conteudo.itens).find((i) => i.linha === null)
    // PULADO, não verde, quando a semente não produz o caso — e em 22/09
    // nenhuma das duas produzia (0 de 18 e 0 de 23 itens sem linha). Um
    // `return` aqui contaria como prova um teste que não afirmou nada.
    if (!semLinha) return skip('a simulação não produziu card sem linha nesta semente')
    const html = await renderizar()
    expect(html).toContain(`href="/apito/${semLinha.jogadorId}?atributo=${semLinha.atributo}"`)
    // Front v2: o card é uma `<li>` — o trecho vai do link dele até o fim dela.
    const trecho = html.slice(html.indexOf(`/apito/${semLinha.jogadorId}`), html.indexOf('</li>', html.indexOf(`/apito/${semLinha.jogadorId}`)))
    expect(trecho).not.toContain('>Registrei<')
  })
})

describe('rodada SEM lista publicada', () => {
  it('avisa e leva para a Lista Secreta em vez de uma tela vazia muda', async () => {
    entrar(a)
    // Amanhã ainda não foi produzido: o feed de amanhã não existe.
    vi.setSystemTime(new Date(a.agora.getTime() + 24 * 60 * 60 * 1000))
    const html = await renderizar()
    // Front v2 (Tarefa 6): a aba da Lista se chama "Entradas" no v2.
    expect(html).toContain('A lista de hoje ainda não foi publicada')
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Ver as Entradas<\/a>/)
    expect(html).not.toContain('>Registrei<')
    vi.setSystemTime(a.agora)
  })
})
