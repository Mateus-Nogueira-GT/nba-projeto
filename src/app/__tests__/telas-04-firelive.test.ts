import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { FeedFireLive } from '../../modules/entrega/fire-live/leitura'

/**
 * O FIRE LIVE DA IDENTIDADE 04 — a tela ao vivo, quente.
 *
 * Mesmo arnês de `telas-demo.test.ts` e `telas-04-lista.test.ts`: renderiza o
 * componente de servidor de verdade sobre um PGlite semeado pela temporada
 * simulada, com sessão e direito de acesso simulados (a fronteira de
 * autenticação não está sob teste). E a mesma regra de ouro: NENHUMA asserção
 * nomeia jogador, time ou horário — quem apita hoje é consequência do sorteio,
 * então o sujeito é lido do banco e a afirmação é sobre ele.
 *
 * Por que uma suíte de TELA e não só a de componente: as regras de escrita
 * (docs/04-design-system.md) valem para a TELA INTEIRA, e a página escreve
 * muito texto por fora do card — sobrancelha, subtítulo, chips de recorte,
 * estados vazios, rodapé do carimbo. Um teste de `CardEntrada` com props
 * montadas à mão passa verde enquanto a página injeta a palavra proibida ao
 * lado dele. Este arquivo é o equivalente, no Fire Live, do guard que a
 * `telas-04-lista.test.ts` faz na Lista Secreta.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'

/** O sufixo curto do atributo, como o card escreve no rodapé quente. */
const CURTO: Record<string, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@teste.com',
  }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => ({ permitido: true }),
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
// `AtualizarAoVivo` usa `useRouter`, e `renderToStaticMarkup` não monta o App
// Router. O resto do módulo continua de verdade (`redirect`).
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

type Busca = Record<string, string | string[] | undefined>

async function renderizar(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/fire-live/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

/** O mesmo feed que a página lê — o sujeito das asserções sai daqui. */
async function feedDaTela(): Promise<FeedFireLive> {
  const { lerFeedFireLive } = await import('../../modules/entrega/fire-live/leitura')
  const ruleset = await rulesetAtivo()
  return lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
}

/** O HTML sem o replay de formulário que o React injeta: script não é tela. */
const semScript = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '')

/** Um pedaço por card — `CardEntrada` é o único `<article>` desta tela. */
const cards = (html: string) => html.split('<article').slice(1)

const ocorrencias = (html: string, texto: string) => html.split(texto).length - 1

describe('Fire Live · 04 — regras de escrita da TELA', () => {
  it('nunca "probabilidade" nem "provável", alvo inteiro, odd em faixa, nota sem decimal', async () => {
    const feed = await feedDaTela()
    const sigla = feed.itens[0]?.timeSigla
    expect(sigla, 'a temporada simulada precisa de apito ao vivo em 15/01').toBeDefined()

    const telas = await Promise.all([
      renderizar(),
      // com recorte por time (os chips) e com recorte que zera a lista: os
      // dois estados escrevem texto próprio, fora do card.
      renderizar({ time: sigla }),
      renderizar({ time: 'ZZZ' }),
    ])

    for (const bruto of telas) {
      const html = semScript(bruto)

      // Plano, constraints: nunca "probabilidade" NEM "provável" na UI — o %
      // é nota de confiança, e no Fire Live ele nem existe.
      expect(html.toLowerCase()).not.toContain('probabilidade')
      expect(html.toLowerCase()).not.toContain('provável')
      // "nota" é da partida e não entra aqui; "nível" é do jogador e do apito.
      expect(html.toLowerCase()).not.toMatch(/nível da partida|nota do jogo/)
      // ALVO e LINHA sempre INTEIROS — nem meio ponto, nem decimal no alvo.
      expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST)\s+\d+,\d/)
      expect(html).not.toMatch(/ALVO 1º Q · \d+,\d/)
      expect(html.toLowerCase()).not.toContain('meio ponto')
      // ODD NUNCA SOLTA: a forma (média entre casas ou faixa) é decisão do
      // parceiro e mora no ruleset, mas número de odd sem dizer o que ele é
      // se lê como a odd de uma casa específica — e isso docs/04 proíbe.
      for (const achado of html.matchAll(/ODD ([^<·]*)/g)) {
        expect(achado[1]!.trim(), 'odd sem faixa nem rótulo de média').toMatch(
          /^(MÉDIA \d,\d{2}|\d,\d{2}–\d,\d{2})/,
        )
      }
      // Nota de confiança: número puro, sem "%" e sem casa decimal. (No Fire
      // Live ela é nula por regra do produto e sai como "—".)
      expect(html).not.toMatch(/>\d{1,3}%</)
      expect(html).not.toMatch(/>\d+,\d+</)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('…')
      expect(html).not.toMatch(/\.\.\./)
    }
  }, 60_000)

  it('o rodapé quente escreve o ALVO do 1º Q do item, inteiro e com a unidade', async () => {
    // O sujeito é lido do feed: quem apita hoje é sorteio. O que se afirma é
    // que a tela escreve o alvo DAQUELE item — e que alvo zero jamais vira
    // rótulo (a barra se recusa a desenhar contra régua zero).
    const feed = await feedDaTela()
    const item = feed.itens.find((i) => i.alvo1Q !== null)
    expect(item, 'a temporada simulada precisa de apito com alvo do 1º Q').toBeDefined()

    const html = await renderizar()
    expect(html).toContain(`ALVO 1º Q · ${item!.alvo1Q} ${CURTO[item!.atributo]}`)
    expect(html).not.toContain('ALVO 1º Q · 0 ')
  }, 60_000)

  it('"ainda sem apito" só sai no card que ainda NÃO é um apito — hoje, em nenhum', async () => {
    // O TERCEIRO CARD DO ARTBOARD ESCREVE A FRASE (`FireLive.dc.html`, l. 147):
    // é o alvo dentro do 1º quarto que ainda não virou push. Ele entra na tela
    // quando a 2.2 materializar os alvos AGUARDANDO — e então esta asserção
    // passa a CONTÁ-LOS, sem precisar de edição: o esperado é derivado do
    // feed, não escrito à mão. Proibir a frase travaria por teste um desenho
    // já aprovado.
    //
    // O que vale nas duas épocas: a frase é a NEGATIVA do ponto "apitou aqui"
    // (os dois no mesmo card seria a barra dizendo que houve e não houve push)
    // e ela nunca sai embaixo de um item que já É um apito. Hoje
    // `lerFeedFireLive` só devolve apitos — daí o zero.
    const feed = await feedDaTela()
    const semInstanteDePush = feed.itens.filter(
      (i) => (i as { apitadoEm?: string | null }).apitadoEm == null,
    )

    const html = await renderizar()
    expect(ocorrencias(html, 'ainda sem apito')).toBe(semInstanteDePush.length)
    expect(cards(html).length).toBeGreaterThan(0)
    for (const card of cards(html))
      expect(card.includes('ainda sem apito') && card.includes('apitou aqui')).toBe(false)
  }, 60_000)
})
