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
 * O HTML de UMA seção, do título dela até o título da seguinte.
 *
 * Sem isso a asserção casa em qualquer lugar da página. Ver o mesmo helper em
 * `telas-04-estatisticas.test.ts` — aqui ele lança em vez de usar `expect`
 * porque roda dentro de `beforeAll` em algumas chamadas auxiliares.
 */
function trecho(html: string, de: string, ate: string): string {
  const i = html.indexOf(de)
  const f = html.indexOf(ate, i)
  if (i < 0 || f < 0) throw new Error(`trecho não encontrado: ${de} … ${ate}`)
  return html.slice(i, f)
}

async function renderizarJogador(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogador/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }),
  )
}

async function renderizarJogo(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }),
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

/** O HTML sem a coluna da direita. */
function semLateral(html: string): string {
  return html.replace(/<aside[\s\S]*?<\/aside>/g, '')
}

describe('estatísticas por nível (spec §5, linhas 5-6)', () => {
  it('GRATIS: o jogador tem o resumo, e as três seções fundas viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogador(jogadorId)

    // O resumo (hero: PTS · REB · AST · NOTA) é o que "grátis vê o resumo"
    // (spec, decisão 10) descreve — não "Ataque/Defesa/Posse", que só existem
    // DENTRO de "Números completos" e ficam atrás do mesmo portão dessa
    // seção (Step 4 do brief é explícito: ela vira convite por inteiro).
    expect(html).toContain('PTS')
    for (const secao of ['Apitos da estratégia', 'Jogo a jogo', 'Números completos']) {
      expect(html).toContain(secao)
    }
    expect(trecho(html, 'Apitos da estratégia', 'Jogo a jogo')).not.toContain('<table')
    expect(trecho(html, 'Apitos da estratégia', 'Jogo a jogo')).not.toContain('<ul')
    expect(trecho(html, 'Apitos da estratégia', 'Jogo a jogo')).toContain('começa no')
    expect(trecho(html, 'Jogo a jogo', 'Números completos')).not.toContain('<table')
    expect(trecho(html, 'Jogo a jogo', 'Números completos')).toContain('começa no')
    expect(trecho(html, 'Números completos', 'Última atualização')).toContain('começa no')
  })

  it('MVP: as três seções fundas têm conteúdo e nenhum convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarJogador(jogadorId)

    expect(trecho(html, 'Jogo a jogo', 'Números completos')).toContain('<table')
    // A LATERAL fica de fora: o banner de plano mora nela para o grátis
    // (identidade 05, §8) e não bloqueia nada — o que esta asserção prova é
    // que o CONTEÚDO da tela vem inteiro, sem convite no lugar dele.
    expect(semLateral(html)).not.toContain('começa no')
  })

  it('GRATIS: o jogo tem líderes e desfalques; box score e confrontos viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogo(jogoId)

    expect(html).toContain('Líderes da partida')
    expect(trecho(html, 'Box score', 'Confrontos anteriores')).not.toContain('<table')
    expect(trecho(html, 'Box score', 'Confrontos anteriores')).toContain('começa no')
    // "Confrontos anteriores" é seção fechada também — o portão não termina
    // no box score.
    expect(trecho(html, 'Confrontos anteriores', 'Última atualização')).toContain('começa no')
  })

  it('MVP: o jogo tem box score e confrontos anteriores, sem convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarJogo(jogoId)

    expect(trecho(html, 'Box score', 'Confrontos anteriores')).toContain('<table')
    // A LATERAL fica de fora: o banner de plano mora nela para o grátis
    // (identidade 05, §8) e não bloqueia nada — o que esta asserção prova é
    // que o CONTEÚDO da tela vem inteiro, sem convite no lugar dele.
    expect(semLateral(html)).not.toContain('começa no')
  })

  it('GRATIS: o time tem campanha e elenco; box score por jogo vira convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarTime(timeId)

    expect(html).toContain('Campanha')
    expect(html).toContain('Elenco')
    expect(trecho(html, 'Box score por jogo', 'Elenco')).not.toContain('<table')
    expect(trecho(html, 'Box score por jogo', 'Elenco')).toContain('começa no')
  })

  it('MVP: o time tem box score por jogo, sem convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarTime(timeId)

    // "começa no" não pode ser buscado na página inteira aqui: a Hierarquia
    // NIP (grátis, sempre aberta) tem uma frase estática sobre a OPD que
    // contém a MESMA substring ("...quando começa no topo..."), sem ser
    // convite nenhum — daí o recorte na seção fechada.
    expect(trecho(html, 'Box score por jogo', 'Elenco')).toContain('<table')
    expect(trecho(html, 'Box score por jogo', 'Elenco')).not.toContain('começa no')
  })

  it('a Hierarquia NIP do time continua grátis (decisão 10b) — vitrine, não profundidade', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarTime(timeId)

    // O título é montado por extenso ("Hierarquia NIP · PONTOS"); a régua não
    // classificava esta seção e o parceiro decidiu em 16/09 que ela fica
    // aberta para todo mundo — é vitrine da curadoria humana. "Ver os
    // planos" é o marcador do CONVITE (não "começa no": a própria seção tem
    // uma frase estática sobre a OPD com essa substring, sem ser portão).
    const secao = trecho(html, 'Hierarquia NIP', 'Box score por jogo')
    expect(secao).not.toContain('Ver os planos')
  })

  it('a classificação é inteira para o GRATIS', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarClassificacao()

    expect(html).toContain('<table')
    // A LATERAL fica de fora: o banner de plano mora nela para o grátis
    // (identidade 05, §8) e não bloqueia nada — o que esta asserção prova é
    // que o CONTEÚDO da tela vem inteiro, sem convite no lugar dele.
    expect(semLateral(html)).not.toContain('começa no')
  })
})

describe('identidade 05 · as seções pagas viram silhueta', () => {
  it('as três seções fundas do jogador mostram título, silhueta e convite compacto', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogador(jogadorId)
    // Três seções pagas (apitos, jogo a jogo, números completos), três
    // silhuetas — e nenhuma tabela de verdade.
    expect((html.match(/_silhueta_/g) ?? []).length).toBe(3)
    expect(semLateral(html)).not.toContain('<table')
    // O convite continua sendo o nome acessível do conjunto.
    expect(html).toContain('começa no')
  })
})
