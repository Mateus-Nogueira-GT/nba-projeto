import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { jogadores, jogos, times, usuarios } from '../../modules/dominio/db/schema'
import { telaDoJogo } from '../../modules/entrega/estatisticas/jogo'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'

/**
 * A ABA DE ESTATÍSTICAS POR NÍVEL (spec §5, linhas 5-6; decisão 10 e 10b).
 *
 * Mesmo arnês de `planos-fire-live.test.ts`: um banco só, um `beforeAll` só,
 * e ACESSO MUTÁVEL — `nivelNoTeste` alterna a renderização entre GRATIS e
 * MVP no mesmo arquivo, sobre o mesmo componente de servidor que a produção
 * roda. NENHUMA asserção nomeia jogador ou time: o sujeito vem do banco.
 *
 * A Hierarquia NIP da tela do time é a exceção da régua — decisão 10b do
 * parceiro (16/09) manteve-a GRÁTIS porque é vitrine da curadoria humana.
 * Ela não aparece neste arquivo como seção fechada: só como prova de que
 * segue aberta (última suíte).
 */

const AGORA = new Date('2026-01-15T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelNoTeste: NivelDoPlano = 'GRATIS'
let jogadorId: string
let jogoId: string
let timeId: string

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
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
// `AtualizarAoVivo` usa `useRouter`; `renderToStaticMarkup` não monta o App
// Router. O resto do módulo continua de verdade (`redirect`, para o dia em
// que a guarda ainda bloquear algum nível aqui).
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  // 21 dias: o mesmo recorte de `telas-05-classificacao.test.ts` — dá
  // campanha a todo time e jogo ENCERRADO com box score e líderes de sobra.
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })

  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  const [umJogador] = await banco.db.select({ id: jogadores.id }).from(jogadores).limit(1)
  expect(umJogador, 'a temporada simulada precisa de ao menos um jogador').toBeDefined()
  jogadorId = umJogador!.id

  const [umTime] = await banco.db.select({ id: times.id }).from(times).limit(1)
  expect(umTime, 'a temporada simulada precisa de ao menos um time').toBeDefined()
  timeId = umTime!.id

  // O jogo sob teste precisa estar ENCERRADO, com líder e box score dos dois
  // lados — senão as seções que o teste verifica nem chegam a renderizar, e o
  // teste provaria o nível errado (ausência de dado, não portão).
  const encerrados = await banco.db
    .select({ id: jogos.id })
    .from(jogos)
    .where(eq(jogos.status, 'ENCERRADO'))
  for (const j of encerrados) {
    const tela = await telaDoJogo(banco.db, j.id, {})
    if (
      tela &&
      tela.lideres.length > 0 &&
      tela.casa.boxScore.length > 0 &&
      tela.visitante.boxScore.length > 0
    ) {
      jogoId = j.id
      break
    }
  }
  expect(
    jogoId,
    'a temporada simulada precisa de um jogo encerrado com líderes e box score dos dois lados',
  ).toBeDefined()

  // A tela calcula "hoje" com `new Date()` — sem congelar o relógio no
  // instante semeado, ela nunca acharia a rodada de 15/01.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

/**
 * O HTML de UMA seção. Front v2: `SecaoStats` escreve
 * `<section aria-label="título">`, e a ordem das seções mudou (jogo a jogo
 * antes dos apitos) — recortar pelo rótulo da seção não depende da ordem.
 */
function secao(html: string, titulo: string): string {
  const i = html.search(new RegExp(`<section[^>]*aria-label="${titulo}"`))
  if (i < 0) throw new Error(`seção não encontrada: ${titulo}`)
  return html.slice(i, html.indexOf('</section>', i))
}

async function renderizarJogador(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogador/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }),
  )
}

/**
 * A partida do v2 tem abas: box score e confrontos anteriores moram em
 * `?aba=box` e `?aba=confrontos`, a visão geral (quartos, líderes,
 * desfalques) na aba padrão.
 */
async function renderizarJogo(id: string, aba?: 'box' | 'confrontos'): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
  return renderToStaticMarkup(
    await Pagina({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(aba ? { aba } : {}),
    }),
  )
}

async function renderizarTime(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/time/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }),
  )
}

async function renderizarClassificacao(): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

describe('estatísticas por nível (spec §5, linhas 5-6)', () => {
  it('GRATIS: o jogador tem o resumo, e as três seções fundas viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogador(jogadorId)

    // O resumo (pontos, rebotes, assistências, nota) é o que "grátis vê o
    // resumo" (spec, decisão 10) descreve.
    expect(html).toContain('Pontos')
    for (const titulo of ['Apitos da estratégia', 'Jogo a jogo', 'Números completos']) {
      const s = secao(html, titulo)
      expect(s, titulo).not.toContain('<table')
      expect(s, titulo).not.toContain('<ul')
      expect(s, titulo).toContain('começa no')
    }
  })

  it('MVP: as três seções fundas têm conteúdo e nenhum convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarJogador(jogadorId)

    expect(secao(html, 'Jogo a jogo')).toContain('<table')
    for (const titulo of ['Apitos da estratégia', 'Jogo a jogo', 'Números completos']) {
      expect(secao(html, titulo), titulo).not.toContain('começa no')
    }
  })

  it('GRATIS: o jogo tem líderes; box score e confrontos viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    expect(await renderizarJogo(jogoId)).toContain('Líderes da partida')

    const box = await renderizarJogo(jogoId, 'box')
    expect(box).not.toContain('<caption')
    expect(box).toContain('começa no')
    // "Confrontos anteriores" é seção fechada também — o portão não termina
    // no box score.
    const confrontos = await renderizarJogo(jogoId, 'confrontos')
    expect(confrontos).toContain('começa no')
  })

  it('MVP: o jogo tem box score e confrontos anteriores, sem convite', async () => {
    nivelNoTeste = 'MVP'
    const box = await renderizarJogo(jogoId, 'box')
    expect(box).toContain('<table')
    expect(box).not.toContain('começa no')
    expect(await renderizarJogo(jogoId, 'confrontos')).not.toContain('começa no')
  })

  it('GRATIS: o time tem campanha e elenco; box score por jogo vira convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarTime(timeId)

    expect(html).toContain('Campanha')
    expect(html).toContain('Elenco')
    expect(secao(html, 'Box score por jogo')).not.toContain('<table')
    expect(secao(html, 'Box score por jogo')).toContain('começa no')
  })

  it('MVP: o time tem box score por jogo, sem convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarTime(timeId)

    // Recortado na seção fechada: a Hierarquia NIP (grátis, sempre aberta)
    // tem uma frase estática sobre a OPD com a MESMA substring ("...quando
    // começa no topo..."), sem ser convite nenhum.
    expect(secao(html, 'Box score por jogo')).toContain('<table')
    expect(secao(html, 'Box score por jogo')).not.toContain('começa no')
  })

  it('a Hierarquia NIP do time continua grátis (decisão 10b) — vitrine, não profundidade', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarTime(timeId)

    // "Ver planos" é o marcador do CONVITE (não "começa no": a própria seção
    // tem uma frase estática sobre a OPD com essa substring, sem ser portão).
    const hierarquia = secao(html, 'Hierarquia NIP · Pontos')
    expect(hierarquia).not.toContain('Ver planos')
  })

  it('a classificação é inteira para o GRATIS', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarClassificacao()

    expect(html).toContain('<table')
    expect(html).not.toContain('começa no')
  })
})

describe('identidade 05 · as seções pagas viram silhueta', () => {
  it('as três seções fundas do jogador mostram título, silhueta e convite compacto', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogador(jogadorId)
    // Três seções pagas (apitos, jogo a jogo, números completos), três
    // silhuetas — e nenhuma tabela de verdade.
    expect((html.match(/_silhueta_/g) ?? []).length).toBe(3)
    expect(html).not.toContain('<table')
    expect(html).toContain('começa no')
  })
})
