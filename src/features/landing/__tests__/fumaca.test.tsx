import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { feedSnapshot } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { recapDaNoite, ultimaRodadaConferida } from '@/modules/entrega/resultados'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { ConteudoFeed, ItemFeed } from '@/modules/entrega/tipos-feed'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'

/**
 * FUMAÇA DAS TELAS PÚBLICAS DA TAREFA 11 — `/conheca` (landing) e `/placar`.
 *
 * As duas são SEM LOGIN: nenhuma sessão é simulada aqui de propósito, e a
 * promessa que este arquivo trava é a da decisão D2/D3 de 23/09 — nada pago
 * de HOJE sai por elas. O que a landing mostra é a última noite conferida
 * (quem bateu, com o placar) e, de hoje, só o número de apitos; o placar
 * mostra só agregados por faixa e por nível.
 *
 * Mesma regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador,
 * time ou horário — o sujeito é lido do banco.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const ONTEM = somarDias(HOJE, -1)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))
// `next/font/google` só existe dentro do transform do Next; a landing o
// chama no topo do módulo. Aqui vira a classe da variável, e só.
vi.mock('next/font/google', () => ({
  Montserrat: () => ({ variable: 'fonte-titulo', className: 'fonte-titulo' }),
  Roboto: () => ({ variable: 'fonte-corpo', className: 'fonte-corpo' }),
}))
// Se uma dessas telas tocar sessão ou cookie, é regressão: elas são públicas
// e o layout `(publico)` não lê nada da requisição.
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('tela pública não lê cookies')
  },
  headers: () => {
    throw new Error('tela pública não lê headers')
  },
}))

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

const semEntidades = (t: string) =>
  t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** O texto que se lê, um espaço por tag. */
const texto = (html: string) =>
  semEntidades(
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()

async function itensDeHoje(): Promise<ItemFeed[]> {
  const [feed] = await banco.db
    .select()
    .from(feedSnapshot)
    .where(and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
  return (feed!.conteudoJson as ConteudoFeed).itens
}

async function renderizarLanding(): Promise<string> {
  const { default: Landing } = await import('@/app/(publico)/conheca/page')
  return renderToStaticMarkup(await Landing())
}

async function renderizarPlacar(): Promise<string> {
  const { default: Placar } = await import('@/app/(publico)/placar/page')
  return renderToStaticMarkup(await Placar())
}

// ===========================================================================
// /conheca — A LANDING
// ===========================================================================

describe('Landing do v2 (/conheca) — nada pago de hoje sai por ela', () => {
  it('(brief) a landing não entrega o feed de hoje a quem não assinou', async () => {
    const html = await renderizarLanding()
    const itens = await itensDeHoje()
    // O fixture tem lista hoje: sem isso a asserção seria vazia.
    expect(itens.length).toBeGreaterThan(0)
    for (const i of itens) expect(html).not.toContain(i.jogadorId)
    // Nem link de detalhe de apito (que é do MVP para cima).
    expect(html).not.toContain('href="/apito/')
  }, 60_000)

  it('de hoje, SÓ o número de apitos — o mesmo que a Lista conta (um por jogador e atributo)', async () => {
    const html = await renderizarLanding()
    const itens = await itensDeHoje()
    const porJogadorEAtributo = new Set(itens.map((i) => `${i.jogadorId}|${i.atributo}`)).size
    expect(texto(html)).toContain(`${porJogadorEAtributo} apitos na rodada`)
    // A linha e a odd de hoje não aparecem: a única coisa de hoje é a conta.
    // (Um nome de hoje PODE aparecer por ter batido ontem — o teste abaixo
    // prova que o que aparece veio da noite conferida.)
  })

  it('a noite em vitrine é a ÚLTIMA CONFERIDA (ontem no fixture), só com quem bateu e o placar do jogo', async () => {
    const ultima = await ultimaRodadaConferida(banco.db, ONTEM)
    expect(ultima).toBe(ONTEM)
    const recap = await recapDaNoite(banco.db, ONTEM)
    expect(recap.noiteEncerrada).toBe(true)
    const cards = recap.porJogo.flatMap((g) => g.cards.map((card) => ({ card, jogo: g.jogo })))
    const bateram = cards.filter((c) => c.card.bateuLinhaMaisBaixa === true)
    const falharam = cards.filter((c) => c.card.bateuLinhaMaisBaixa === false)
    expect(bateram.length, 'o fixture precisa de ao menos um acerto ontem').toBeGreaterThan(0)

    const html = await renderizarLanding()
    const lido = texto(html)
    // O primeiro acerto da vitrine é o de maior força (turbo, nível do apito,
    // confiança) — e ele aparece com o que FEZ e com o placar do jogo.
    const { card, jogo } = [...bateram].sort(
      (a, b) =>
        Number(b.card.turbo) - Number(a.card.turbo) ||
        b.card.nivelApito - a.card.nivelApito ||
        (b.card.linhas[0]?.confianca ?? 0) - (a.card.linhas[0]?.confianca ?? 0),
    )[0]!
    expect(lido).toContain(card.nome)
    expect(lido).toContain(`fez ${card.fez}`)
    expect(lido).toContain(`${jogo.visitanteSigla} ${jogo.placarVisitante}`)
    expect(lido).toContain(`${jogo.placarCasa} ${jogo.casaSigla}`)
    // Quem NÃO bateu não é vitrine — e nenhum jogadorId da noite vai ao HTML.
    for (const f of falharam) expect(html).not.toContain(f.card.jogadorId)
    for (const b of bateram) expect(html).not.toContain(b.card.jogadorId)
    // Os três números da noite, como em Resultados.
    expect(lido).toContain(`${recap.bateram} de ${recap.conferidos}`)
  }, 60_000)

  it('(estrutural) o objeto da landing não carrega nenhum item de hoje', async () => {
    const { carregarLanding } = await import('../carregar')
    const dados = await carregarLanding()
    expect(Object.keys(dados).sort()).toEqual(['gestao', 'noite', 'precos', 'totalDeApitos'])
    expect(typeof dados.totalDeApitos).toBe('number')
    expect(Object.keys(dados.gestao).sort()).toEqual(['banca', 'limites', 'unidade'])
    // A noite é a conferida, não a de hoje, e cada acerto é um recorte sem id.
    expect(dados.noite?.dataReferencia).toBe(ONTEM)
    for (const a of dados.noite?.acertos ?? []) {
      expect(Object.keys(a).sort()).toEqual([
        'atributo',
        'chave',
        'confianca',
        'fez',
        'fotoUrl',
        'grau',
        'linha',
        'nivelApito',
        'nivelJogador',
        'nome',
        'placar',
        'timeSigla',
        'turbo',
      ])
    }
    // Nada no objeto inteiro é um id de jogador de hoje.
    const serializado = JSON.stringify(dados)
    for (const i of await itensDeHoje()) expect(serializado).not.toContain(i.jogadorId)
  })

  it('vocabulário: "confiança", nunca "probabilidade" como nome da nota', async () => {
    const lido = texto(await renderizarLanding())
    // A landing só usa a palavra para NEGAR ("não é probabilidade").
    for (const m of lido.matchAll(/probabilidade/gi)) {
      expect(lido.slice(Math.max(0, m.index! - 12), m.index)).toMatch(/não é $/i)
    }
    expect(lido).toContain('Nota de confiança')
  })
})

// ===========================================================================
// /placar — O PLACAR ABERTO
// ===========================================================================

describe('Placar público (/placar) — só agregados', () => {
  it('mostra o placar por faixa de confiança e por nível, sem nenhum apito, jogador ou linha', async () => {
    const html = await renderizarPlacar()
    const lido = texto(html)
    expect(lido).toContain('Placar do NIP')
    // Há rodadas conferidas no fixture: a tabela aparece.
    expect(lido).not.toContain('Ainda não há rodadas conferidas')
    expect(html).toContain('id="t-placar"')
    // Nenhum jogadorId (de hoje ou de ontem) e nenhum nome de apitado.
    const recap = await recapDaNoite(banco.db, ONTEM)
    for (const g of recap.porJogo) {
      for (const c of g.cards) {
        expect(html).not.toContain(c.jogadorId)
        expect(lido).not.toContain(c.nome)
      }
    }
    for (const i of await itensDeHoje()) {
      expect(html).not.toContain(i.jogadorId)
      expect(lido).not.toContain(i.nome)
    }
    expect(html).not.toContain('href="/apito/')
    expect(lido).not.toMatch(/\bprobabilidade de acerto\b.*\bé\b/)
  }, 60_000)

  it('o número é o MESMO que Resultados mostra (o cache é um só)', async () => {
    const { placarCacheado } = await import('@/app/_cache/placar')
    const ruleset = await rulesetAtivo()
    const placar = await placarCacheado(somarDias(HOJE, 1), ruleset.confianca_exibicao.faixas)
    const lido = texto(await renderizarPlacar())
    for (const l of [...placar.porConfianca, ...placar.porNivel]) {
      if (l.total === 0) continue
      expect(lido).toContain(`${l.acertos}/${l.total}`)
    }
  })
})
