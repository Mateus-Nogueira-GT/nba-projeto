import { and, eq, inArray } from 'drizzle-orm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  classificacao,
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  times,
  usuarios,
} from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { apitosDoJogador } from '@/modules/entrega/estatisticas/jogador'
import { telaDoJogo } from '@/modules/entrega/estatisticas/jogo'
import { telaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import {
  hierarquiaDoTime,
  telaDaClassificacao,
  type LinhaHierarquia,
} from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { semearClassificacao } from '@/modules/ingestao/demo/jogos'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { diaDaRodada, hora } from '@/ui/formato'

import { NotaPartida } from '../Comum'
import { LIMITE_DE_APITOS_DO_JOGADOR, num } from '../regras'

/**
 * FUMAÇA DA ABA DE ESTATÍSTICAS DO V2 — ligada ao NOSSO back.
 *
 * As quatro rotas de verdade (`(app)/estatisticas/**` → `features/estatisticas`)
 * sobre um PGlite semeado pela temporada simulada, com sessão, cookie e acesso
 * simulados e MUTÁVEIS (`nivelDoTeste`, `tokenDoTeste`, `sessaoDoTeste`).
 *
 * A aba é DADO CANÔNICO (a exceção única do CLAUDE.md): o elenco e o "time
 * atual" vêm de `jogadores.time_id`, nunca da lista do CJ — a curadoria só
 * aparece rotulada como tal.
 *
 * Regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador, time ou
 * horário — o sujeito é lido do banco.
 *
 * Herda as invariantes de `telas-04-estatisticas.test.ts` e
 * `telas-06-temporada-exibida.test.ts` (aposentados junto com as telas
 * antigas), dos casos de estatísticas de `telas-demo.test.ts` e dos de
 * renderização de `telas-05-classificacao.test.ts`: cada caso diz de onde
 * veio. A temporada exibida no hiato mora em `temporada-exibida.test.tsx`
 * (banco próprio, só com a temporada passada).
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'

/**
 * O nível do JOGADOR como a tela o escreve, à mão de propósito: importar o
 * dicionário da tela faria uma troca de rótulo passar nos dois lados.
 */
const NIVEL_ESCRITO: Record<LinhaHierarquia['nivel'], string> = {
  MVP: 'MVP',
  ALL_STAR: 'All-Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'
let tokenDoTeste: string | null = 'token-de-teste'
let sessaoDoTeste: { usuarioId: string; email: string } | null = {
  usuarioId: USUARIO,
  email: 'demo@teste.com',
}
let bancoTocado = false
let dbAtual: () => unknown = () => banco.db

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => tokenDoTeste,
  sessaoAtual: async () => sessaoDoTeste,
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelDoTeste) }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => {
    bancoTocado = true
    return dbAtual()
  },
  fecharDb: async () => {},
}))
// `renderToStaticMarkup` não monta o App Router: os componentes de cliente
// recebem ganchos neutros. `redirect` e `notFound` são os de verdade.
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/estatisticas',
    useSearchParams: () => new URLSearchParams(),
  }
})

/** O jogador sob teste: o mais apitado que tem ✓ E ✗ entre os conferidos. */
let alvo: string
/** Um jogador SEM nenhum apito — o estado da maioria dos perfis da liga. */
let semApito: string
let temporada: string
type SujeitoDoTime = { timeId: string; jogoId: string; hierarquia: LinhaHierarquia[] }
/** Um time que joga HOJE com a hierarquia inteira em quadra. */
let sujeito: SujeitoDoTime

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  // 21 dias: campanha para todo time (as conferências chegam cheias), jogo
  // encerrado com box score e líderes, apito conferido com ✓ e ✗.
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  temporada = temporadaDe(AGORA, calendarioDoRuleset(ruleset))

  const linhas = await banco.db
    .select({ jogadorId: apitos.jogadorId })
    .from(apitos)
    .where(eq(apitos.estrategia, 'LISTA_SECRETA'))
  const contagem = new Map<string, number>()
  for (const l of linhas) contagem.set(l.jogadorId, (contagem.get(l.jogadorId) ?? 0) + 1)
  const candidatos = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  for (const id of candidatos.slice(0, 25)) {
    const lista = await apitosDoJogador(banco.db, id, LIMITE_DE_APITOS_DO_JOGADOR)
    const conferidos = lista.filter((a) => a.bateu !== null)
    if (conferidos.length === 0) continue
    const misto = conferidos.some((a) => a.bateu) && conferidos.some((a) => a.bateu === false)
    if (misto || alvo === undefined) alvo = id
    if (misto) break
  }
  expect(alvo, 'a temporada simulada precisa de um jogador com apito conferido').toBeDefined()

  const apitados = new Set(linhas.map((l) => l.jogadorId))
  semApito = (await banco.db.select({ id: jogadores.id }).from(jogadores)).find(
    (j) => !apitados.has(j.id),
  )!.id

  const doDia = await telaJogosDoDia(banco.db, HOJE, FUSO)
  busca: for (const jogo of doDia.jogos) {
    for (const lado of [jogo.casa, jogo.visitante]) {
      const hierarquia = await hierarquiaDoTime(banco.db, lado.id, 'PONTOS', jogo.id)
      if (hierarquia.length >= 3 && !hierarquia.some((l) => l.fora)) {
        sujeito = { timeId: lado.id, jogoId: jogo.id, hierarquia }
        break busca
      }
    }
  }
  expect(sujeito, 'um time jogando hoje com a hierarquia inteira em quadra').toBeDefined()

  // A tela calcula "hoje" com `new Date()`. Só `Date` — timers travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

type Busca = Record<string, string | string[] | undefined>

async function renderizarIndice(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

async function renderizarJogador(id: string, busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/estatisticas/jogador/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve(busca) }),
  )
}

async function renderizarJogo(id: string, busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/estatisticas/jogo/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve(busca) }),
  )
}

async function renderizarTime(id: string, busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/estatisticas/time/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve(busca) }),
  )
}

/** O destino do `redirect()` — o Next o carrega no `digest` do erro lançado. */
async function destinoDoRedirect(render: Promise<unknown>): Promise<string | null> {
  try {
    await render
    return null
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    if (!digest.startsWith('NEXT_REDIRECT')) throw erro
    return digest.split(';')[2] ?? ''
  }
}

/** Texto visível, sem marcação — para afirmar sobre rótulo e valor vizinhos. */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * O HTML de UMA seção (`SecaoStats` escreve `<section aria-label=título>`).
 * Afirmar sobre a página inteira é afirmar sobre nada: a nota, a data e o
 * confronto se repetem em várias seções.
 */
function secao(html: string, titulo: string): string {
  const inicio = html.search(new RegExp(`<section[^>]*aria-label="${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
  expect(inicio, `a seção "${titulo}" existe na tela`).toBeGreaterThan(-1)
  const fim = html.indexOf('</section>', inicio)
  expect(fim, `a seção "${titulo}" se fecha`).toBeGreaterThan(-1)
  return html.slice(inicio, fim)
}

/** O HTML de cada `<li>` de um trecho, na ordem. */
const itens = (html: string) =>
  html
    .split('<li')
    .slice(1)
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</li>')))

/** O HTML de cada `<tr>` do corpo das tabelas de um trecho, na ordem. */
const linhasDaTabela = (html: string) =>
  html
    .split('<tbody>')
    .slice(1)
    .flatMap((corpo) => corpo.slice(0, corpo.indexOf('</tbody>')).split('<tr').slice(1))
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</tr>')))

/** O mesmo dado que a página recebe — o sujeito das asserções sai daqui. */
async function dadosDoJogador(id: string, busca: Busca = {}) {
  const { carregarJogador } = await import('../jogador')
  return carregarJogador(id, busca)
}

const ondeBox = (jogoId: string, jogadorId: string) =>
  and(eq(estatisticasJogo.jogoId, jogoId), eq(estatisticasJogo.jogadorId, jogadorId))

async function umJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
  const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.status, status)).limit(1)
  expect(jogo, `a temporada simulada tem jogo ${status}`).toBeDefined()
  return jogo!
}

/** Regras de escrita do produto — valem para toda tela da aba. */
function regrasDeEscrita(html: string, nome: string) {
  const visivel = texto(html)
  const minusculo = visivel.toLowerCase()
  // O % é nota de confiança, nunca probabilidade — e esta aba nem exibe nota de confiança.
  expect(minusculo, nome).not.toContain('probabilidade')
  expect(minusculo, nome).not.toContain('confiança')
  // "nível" é do JOGADOR ou do APITO — nunca a nota da partida, nunca solto.
  // A palavra, não o sufixo: "disponível" não é nível de nada.
  for (const ocorrencia of visivel.match(/(?<!\p{L})nível.{0,16}/giu) ?? []) {
    expect(ocorrencia.toLowerCase(), nome).toMatch(/^nível (do jogador|do apito)/)
  }
  // Linha sempre inteira, com "+". Nunca meio ponto.
  expect(visivel, nome).not.toMatch(/\d+,\d+\+/)
  expect(minusculo, nome).not.toContain('meio ponto')
  // Odd, quando aparecer, é sempre FAIXA (1,30–1,70).
  for (const pedaco of visivel.match(/ODD[^·]{0,24}/g) ?? []) {
    expect(pedaco, nome).toMatch(/\d,\d{2}\s*–\s*\d,\d{2}/)
  }
  expect(minusculo, nome).not.toContain('altíssimo valor')
  expect(visivel, nome).not.toContain('...')
  expect(visivel, nome).not.toContain('…')
  // A curadoria do CJ nunca é nomeada assim na tela (telas-demo).
  expect(visivel, nome).not.toContain('Carlos')
  expect(minusculo, nome).not.toContain('lista do cj')
}

// ===========================================================================
// PORTÃO DE COOKIE (I3) E URL INVÁLIDA
// ===========================================================================

describe('Estatísticas do v2 — cookie antes do banco (I3, auditoria 23/09)', () => {
  const rotas = {
    jogador: (id: string) => renderizarJogador(id),
    jogo: (id: string) => renderizarJogo(id),
    time: (id: string) => renderizarTime(id),
  }
  /** Um id VÁLIDO que o banco nem chega a ver. */
  const ID = '00000000-0000-4000-8000-000000000099'

  async function semCookieNemBanco<T>(fn: () => Promise<T>): Promise<T> {
    tokenDoTeste = null
    sessaoDoTeste = null
    bancoTocado = false
    dbAtual = () => {
      throw new Error('não deveria tocar o banco')
    }
    try {
      return await fn()
    } finally {
      tokenDoTeste = 'token-de-teste'
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
      dbAtual = () => banco.db
    }
  }

  it.each(Object.entries(rotas))(
    '%s: sem cookie redireciona para /entrar SEM tocar o banco',
    async (nome, render) => {
      const destino = await semCookieNemBanco(() => destinoDoRedirect(render(ID)))
      expect(destino).toBe(`/entrar?destino=${encodeURIComponent(`/estatisticas/${nome}/${ID}`)}`)
      expect(bancoTocado).toBe(false)
    },
  )

  it('jogador: o título da aba (generateMetadata) também não toca o banco sem cookie', async () => {
    const { generateMetadata } = await import('@/app/(app)/estatisticas/jogador/[id]/page')
    const destino = await semCookieNemBanco(() =>
      destinoDoRedirect(generateMetadata({ params: Promise.resolve({ id: ID }) })),
    )
    expect(destino).toContain('/entrar?destino=')
    expect(bancoTocado).toBe(false)
  })

  it.each(Object.entries(rotas))(
    '%s: UUID inválido responde 404 antes de cookie e banco',
    async (_nome, render) => {
      await semCookieNemBanco(async () => {
        await expect(render('abc')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
      })
      expect(bancoTocado).toBe(false)
    },
  )

  it('índice: sem sessão vai para /entrar antes de qualquer consulta', async () => {
    const destino = await semCookieNemBanco(() => destinoDoRedirect(renderizarIndice()))
    expect(destino).toBe(`/entrar?destino=${encodeURIComponent('/estatisticas')}`)
    expect(bancoTocado).toBe(false)
  })

  it.each(Object.entries(rotas))(
    '%s: com cookie, id válido que não existe é 404 (sem erro de conversão no Postgres)',
    async (_nome, render) => {
      await expect(render(ID)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    },
  )
})

describe('Estatísticas do v2 — a coluna da seção (@painel/estatisticas)', () => {
  async function renderizarPainel() {
    // A lateral é componente de servidor ASSÍNCRONO: `renderToStaticMarkup` não
    // a desenha. O que interessa aqui é o portão e a moldura que ele devolve.
    const { default: Painel } = await import('@/app/(app)/@painel/estatisticas/page')
    return Painel()
  }

  it('tem portão próprio: sem sessão vai para /entrar com a MESMA rota da página', async () => {
    sessaoDoTeste = null
    try {
      expect(await destinoDoRedirect(renderizarPainel())).toBe(
        `/entrar?destino=${encodeURIComponent('/estatisticas')}`,
      )
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  })

  it('com sessão, é a coluna da rodada', async () => {
    nivelDoTeste = 'GRATIS'
    const elemento = await renderizarPainel()
    expect(elemento.props).toMatchObject({ modo: 'resumo', rota: '/estatisticas', rotulo: 'Coluna da rodada' })
  })
})

// ===========================================================================
// AS QUATRO ROTAS E A PROFUNDIDADE POR PLANO
// ===========================================================================

describe('Estatísticas do v2 — profundidade por plano', () => {
  it('as quatro rotas renderizam com a semente', async () => {
    nivelDoTeste = 'MVP'
    const encerrado = await umJogo('ENCERRADO')
    expect(await renderizarIndice()).toContain('Classificação')
    expect(await renderizarJogador(alvo)).toContain('Jogo a jogo')
    expect(await renderizarJogo(encerrado.id)).toContain('Pontos por quarto')
    expect(await renderizarTime(sujeito.timeId)).toContain('Campanha')
  }, 60_000)

  it('GRÁTIS: o carregador do jogador nem LÊ os apitos — nada pago no dado da tela', async () => {
    nivelDoTeste = 'GRATIS'
    const dados = await dadosDoJogador(alvo)
    expect(dados.profundidade).toBe(false)
    expect(dados.apitos).toEqual([])
    expect(dados.truncado).toBe(false)

    nivelDoTeste = 'MVP'
    expect((await dadosDoJogador(alvo)).apitos.length).toBeGreaterThan(0)
  }, 60_000)

  it('GRÁTIS: as três seções fundas do jogador são silhueta, sem tabela nem apito', async () => {
    nivelDoTeste = 'GRATIS'
    const html = await renderizarJogador(alvo)
    for (const titulo of ['Jogo a jogo', 'Apitos da estratégia', 'Números completos']) {
      const s = secao(html, titulo)
      expect(s, titulo).toContain('começa no plano')
      expect(s, titulo).not.toContain('<table')
      expect(s, titulo).not.toContain('<li')
    }
    expect(texto(html)).not.toMatch(/fez \d+/)
  }, 60_000)
})

// ===========================================================================
// JOGADOR (telas-04-estatisticas)
// ===========================================================================

describe('Estatísticas do v2 — jogador', () => {
  it('(telas-04) os números do topo e a nota do recorte', async () => {
    nivelDoTeste = 'MVP'
    const { tela } = await dadosDoJogador(alvo)
    const visivel = texto(await renderizarJogador(alvo))
    expect(visivel).toContain(`Pontos ${num(tela.perfilNumeros.ataque.pontos)}`)
    expect(visivel).toContain(`Rebotes ${num(tela.perfilNumeros.defesa.rebotesTotal)}`)
    expect(visivel).toContain(`Assistências ${num(tela.perfilNumeros.ataque.assistencias)}`)
    expect(tela.notaMediaRecente).not.toBeNull()
    expect(await renderizarJogador(alvo)).toContain(
      renderToStaticMarkup(createElement(NotaPartida, { nota: tela.notaMediaRecente, destaque: true })),
    )
  }, 60_000)

  it('(telas-04) um apito por item de lista, veredito NOMEADO e "X de Y bateu"', async () => {
    nivelDoTeste = 'MVP'
    const { apitos: lista } = await dadosDoJogador(alvo)
    const conferidos = lista.filter((a) => a.estado === 'CONFERIDO')
    const bateram = conferidos.filter((a) => a.bateu === true)
    expect(conferidos.length).toBeGreaterThan(0)

    const s = secao(await renderizarJogador(alvo), 'Apitos da estratégia')
    expect(texto(s)).toContain(`${bateram.length} de ${conferidos.length} bateu`)
    expect(texto(s).match(/fez \d+/g)?.length ?? 0).toBe(conferidos.length)
    // Lista SEMÂNTICA: o leitor de tela conta os itens.
    expect(s).toContain('<ul')
    expect(itens(s)).toHaveLength(lista.length)
    // ✓/✗ nomeados: a cor nunca é o único sinal.
    expect(s.match(/aria-label="bateu"/g)?.length ?? 0).toBe(bateram.length)
    expect(s.match(/aria-label="não bateu"/g)?.length ?? 0).toBe(conferidos.length - bateram.length)
    const primeiro = lista[0]!
    expect(texto(s)).toContain(`${primeiro.emCasa ? 'vs' : '@'} ${primeiro.adversarioSigla}`)
  }, 60_000)

  it('(telas-04) sem NENHUM apito, a seção não anuncia dado pendente', async () => {
    nivelDoTeste = 'MVP'
    const visivel = texto(secao(await renderizarJogador(semApito), 'Apitos da estratégia'))
    expect(visivel).toContain('A Lista Secreta ainda não apitou este jogador.')
    expect(visivel).not.toContain('aguardando dado oficial')
  }, 60_000)

  it('(telas-04) apito de jogo que voltou a não estar encerrado SOME — o sinal do dia não é público', async () => {
    nivelDoTeste = 'MVP'
    const { apitos: lista } = await dadosDoJogador(alvo)
    const conferidos = lista.filter((a) => a.estado === 'CONFERIDO')
    const alvoDoTeste = conferidos[0]!
    const noMesmoJogo = conferidos.filter((a) => a.jogoId === alvoDoTeste.jogoId).length
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, alvoDoTeste.jogoId))
    try {
      await banco.db.update(jogos).set({ status: 'AGENDADO' }).where(eq(jogos.id, jogo!.id))
      const visivel = texto(secao(await renderizarJogador(alvo), 'Apitos da estratégia'))
      expect(visivel).not.toContain('não jogou')
      expect(visivel.match(/fez \d+/g)?.length ?? 0).toBe(conferidos.length - noMesmoJogo)
    } finally {
      await banco.db.update(jogos).set({ status: jogo!.status }).where(eq(jogos.id, jogo!.id))
    }
  }, 60_000)

  it('(telas-04) box score com MINUTO ZERO é "não jogou", sem ✓ nem ✗ naquela linha', async () => {
    nivelDoTeste = 'MVP'
    const { apitos: lista } = await dadosDoJogador(alvo)
    const conferidos = lista.filter((a) => a.estado === 'CONFERIDO')
    const escolhido = conferidos[0]!
    const noMesmoJogo = conferidos.filter((a) => a.jogoId === escolhido.jogoId).length
    const [box] = await banco.db.select().from(estatisticasJogo).where(ondeBox(escolhido.jogoId, alvo))
    try {
      await banco.db
        .update(estatisticasJogo)
        .set({
          minutos: '0.00',
          pontos: 0,
          rebotesTotal: 0,
          rebotesOf: 0,
          rebotesDef: 0,
          assistencias: 0,
          cestasC: 0,
          cestasT: 0,
          doisC: 0,
          doisT: 0,
          tresC: 0,
          tresT: 0,
          lanceC: 0,
          lanceT: 0,
          roubos: 0,
          bloqueios: 0,
          turnovers: 0,
          faltas: 0,
          saldoQuadra: 0,
        })
        .where(ondeBox(escolhido.jogoId, alvo))
      const s = secao(await renderizarJogador(alvo), 'Apitos da estratégia')
      expect(texto(s).match(/não jogou/g)?.length ?? 0).toBe(noMesmoJogo)
      expect(s.match(/aria-label="(bateu|não bateu)"/g)?.length ?? 0).toBe(
        conferidos.length - noMesmoJogo,
      )
    } finally {
      await banco.db.update(estatisticasJogo).set(box!).where(ondeBox(escolhido.jogoId, alvo))
    }
  }, 60_000)

  it('(telas-04) minuto que não chegou não apaga o veredito de uma linha que TRAZ produção', async () => {
    nivelDoTeste = 'MVP'
    const busca = { periodo: 'temporada' }
    const { apitos: lista, tela } = await dadosDoJogador(alvo, busca)
    const conferidos = lista.filter((a) => a.estado === 'CONFERIDO')
    const escolhido = conferidos.find(
      (a) => a.fez !== null && a.fez > 0 && tela.historico.some((l) => l.jogoId === a.jogoId),
    )
    expect(escolhido, 'um apito conferido com produção e linha na tabela').toBeDefined()
    const [box] = await banco.db.select().from(estatisticasJogo).where(ondeBox(escolhido!.jogoId, alvo))
    try {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: null })
        .where(ondeBox(escolhido!.jogoId, alvo))
      const html = await renderizarJogador(alvo, busca)
      const s = texto(secao(html, 'Apitos da estratégia'))
      expect(s).toContain(`fez ${escolhido!.fez}`)
      expect(s).not.toContain('aguardando dado oficial')
      expect(s.match(/fez \d+/g)?.length ?? 0).toBe(conferidos.length)
      // A tabela, na MESMA tela, diz "Oficial" para a mesma partida — só o minuto vira "—".
      const linha = linhasDaTabela(secao(html, 'Jogo a jogo')).find((l) =>
        l.includes(`/estatisticas/jogo/${escolhido!.jogoId}?`),
      )!
      expect(texto(linha)).toContain('Oficial —')
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: box!.minutos })
        .where(ondeBox(escolhido!.jogoId, alvo))
    }
  }, 60_000)

  it('(telas-04) jogo ENCERRADO cujo box ainda não chegou fica "aguardando dado oficial", nunca DNP', async () => {
    nivelDoTeste = 'MVP'
    const { apitos: lista } = await dadosDoJogador(alvo)
    const escolhido = lista.find((a) => a.estado === 'CONFERIDO')!
    const antes = texto(secao(await renderizarJogador(alvo), 'Apitos da estratégia'))
    const dnpAntes = antes.match(/não jogou/g)?.length ?? 0
    const [box] = await banco.db.select().from(estatisticasJogo).where(ondeBox(escolhido.jogoId, alvo))
    try {
      await banco.db.delete(estatisticasJogo).where(ondeBox(escolhido.jogoId, alvo))
      const s = texto(secao(await renderizarJogador(alvo), 'Apitos da estratégia'))
      expect(s).toContain('aguardando dado oficial')
      expect(s.match(/não jogou/g)?.length ?? 0).toBe(dnpAntes)
    } finally {
      await banco.db.insert(estatisticasJogo).values(box!)
    }
  }, 60_000)

  it('(telas-04) a MESMA partida sai com a MESMA data no apito e na tabela — o instante no fuso', async () => {
    nivelDoTeste = 'MVP'
    const busca = { periodo: 'temporada' }
    const { apitos: lista, tela } = await dadosDoJogador(alvo, busca)
    const apito = lista.find((a) => tela.historico.some((l) => l.jogoId === a.jogoId))!
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId))
    const conta = (t: string, d: string) => t.match(new RegExp(`(?<!\\d)${d}(?!\\d)`, 'g'))?.length ?? 0
    try {
      // 22h30 ET vira 03h30 UTC do dia seguinte: o rótulo de calendário fica um dia atrás.
      await banco.db
        .update(jogos)
        .set({ dataReferencia: '2025-12-03', dataHoraUtc: new Date('2025-12-04T03:30:00.000Z') })
        .where(eq(jogos.id, apito.jogoId))
      const html = await renderizarJogador(alvo, busca)
      for (const titulo of ['Apitos da estratégia', 'Jogo a jogo']) {
        const s = texto(secao(html, titulo))
        expect(conta(s, '4/12'), titulo).toBeGreaterThanOrEqual(1)
        expect(conta(s, '3/12'), titulo).toBe(0)
      }
      // Uma hora antes, o fuso de Brasília põe o jogo no dia anterior.
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: new Date('2025-12-04T02:30:00.000Z') })
        .where(eq(jogos.id, apito.jogoId))
      const noFuso = await renderizarJogador(alvo, busca)
      for (const titulo of ['Apitos da estratégia', 'Jogo a jogo']) {
        const s = texto(secao(noFuso, titulo))
        expect(conta(s, '3/12'), titulo).toBeGreaterThanOrEqual(1)
        expect(conta(s, '4/12'), titulo).toBe(0)
      }
    } finally {
      await banco.db
        .update(jogos)
        .set({ dataReferencia: jogo!.dataReferencia, dataHoraUtc: jogo!.dataHoraUtc })
        .where(eq(jogos.id, apito.jogoId))
    }
  }, 60_000)

  it('(telas-04) as duas visões de time: "Time atual" (provedor) e "Na curadoria NIP", rotuladas', async () => {
    nivelDoTeste = 'MVP'
    const { tela } = await dadosDoJogador(alvo)
    const naLista = tela.timeNaListaDoCj
    expect(naLista, 'o jogador apitado está na curadoria NIP').not.toBeNull()
    const heroi = (html: string) => {
      const i = html.indexOf('Time atual')
      return html.slice(i, html.indexOf('</p>', i))
    }
    // Coincidindo: a sigla repetida não vira um segundo link para o mesmo lugar.
    expect(tela.perfil.timeId).toBe(naLista!.id)
    const igual = heroi(await renderizarJogador(alvo))
    expect(igual.match(/<a [^>]*href="\/estatisticas\/time\//g)?.length ?? 0).toBe(1)

    const [original] = await banco.db.select().from(jogadores).where(eq(jogadores.id, alvo))
    const outro = (await banco.db.select().from(times)).find((t) => t.id !== naLista!.id)!
    try {
      await banco.db.update(jogadores).set({ timeId: outro.id }).where(eq(jogadores.id, alvo))
      const h = heroi(await renderizarJogador(alvo))
      expect(texto(h)).toMatch(new RegExp(`Time atual ${outro.sigla}`))
      expect(texto(h)).toMatch(new RegExp(`Na curadoria NIP ${naLista!.sigla}`))
      expect(h.match(/<a [^>]*href="\/estatisticas\/time\//g)?.length ?? 0).toBe(2)
    } finally {
      await banco.db.update(jogadores).set({ timeId: original!.timeId }).where(eq(jogadores.id, alvo))
    }
  }, 60_000)

  it('(telas-04) a mesma partida sai com o MESMO mando nas duas seções quando a lista do CJ diverge', async () => {
    nivelDoTeste = 'MVP'
    const busca = { periodo: 'temporada' }
    const { apitos: lista, tela } = await dadosDoJogador(alvo, busca)
    const daTabela = tela.historico.find((l) => lista.some((a) => a.jogoId === l.jogoId))!
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, daTabela.jogoId))
    const [original] = await banco.db.select().from(jogadores).where(eq(jogadores.id, alvo))
    const naLista = tela.timeNaListaDoCj!.id
    const real = naLista === jogo!.timeCasaId ? jogo!.timeVisitanteId : jogo!.timeCasaId
    const siglaDe = new Map((await banco.db.select().from(times)).map((t) => [t.id, t.sigla]))
    try {
      await banco.db.update(jogadores).set({ timeId: real }).where(eq(jogadores.id, alvo))
      const html = await renderizarJogador(alvo, busca)
      const emCasa = real === jogo!.timeCasaId
      const certo = `${emCasa ? 'vs' : '@'} ${siglaDe.get(emCasa ? jogo!.timeVisitanteId : jogo!.timeCasaId)}`
      expect(texto(secao(html, 'Apitos da estratégia'))).toContain(certo)
      expect(texto(secao(html, 'Jogo a jogo'))).toContain(certo)
      expect(texto(secao(html, 'Apitos da estratégia'))).not.toContain(`@ ${siglaDe.get(real)!}`)
    } finally {
      await banco.db.update(jogadores).set({ timeId: original!.timeId }).where(eq(jogadores.id, alvo))
    }
  }, 60_000)

  it('(telas-04) com o elenco projetado do CJ, a seção de apitos continua nomeando o adversário', async () => {
    nivelDoTeste = 'MVP'
    const { apitos: lista } = await dadosDoJogador(alvo)
    const apito = lista[0]!
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId))
    const [original] = await banco.db.select().from(jogadores).where(eq(jogadores.id, alvo))
    const forasteiro = (await banco.db.select().from(times)).find(
      (t) => t.id !== jogo!.timeCasaId && t.id !== jogo!.timeVisitanteId,
    )!
    try {
      await banco.db.update(jogadores).set({ timeId: forasteiro.id }).where(eq(jogadores.id, alvo))
      const s = texto(secao(await renderizarJogador(alvo), 'Apitos da estratégia'))
      expect(s).toContain(`${apito.emCasa ? 'vs' : '@'} ${apito.adversarioSigla}`)
      expect(s).not.toContain('—')
    } finally {
      await banco.db.update(jogadores).set({ timeId: original!.timeId }).where(eq(jogadores.id, alvo))
    }
  }, 60_000)

  it('(telas-04) o recorte padrão é Últimos 10 e o caminho para a partida mantém período e atributo', async () => {
    nivelDoTeste = 'MVP'
    const inicial = await renderizarJogador(alvo)
    const ativo = (html: string, rotulo: string) =>
      (html.match(/<a [^>]*>[^<]*<\/a>/g) ?? []).find((a) => a.endsWith(`>${rotulo}</a>`))
    // O segmento ativo se anuncia (o `Segmentado` do v2 usa `aria-current="true"`).
    expect(ativo(inicial, 'Últimos 10')).toContain('aria-current="true"')
    expect(ativo(inicial, 'Temporada')).not.toContain('aria-current')
    // O recorte é DITO, e é o que a tabela mostra: "Últimos 10" nunca vira o
    // rótulo da temporada sobre uma janela cortada — nem na tabela, nem no hero.
    const { tela } = await dadosDoJogador(alvo)
    const jogoAJogo = secao(inicial, 'Jogo a jogo')
    expect(texto(jogoAJogo)).toContain(`Últimos 10 · ${tela.recorte!.disponiveis} partida`)
    expect(linhasDaTabela(jogoAJogo)).toHaveLength(tela.historico.length)
    expect(texto(jogoAJogo)).not.toContain(temporada)
    const heroi = inicial.slice(inicial.indexOf('<h1'), inicial.indexOf('Time atual'))
    expect(texto(heroi)).toContain('Últimos 10 ·')
    expect(texto(heroi)).not.toContain(temporada)

    const html = await renderizarJogador(alvo, { periodo: '5', atributo: 'REBOTES' })
    expect(texto(html)).toContain('Desempenho · Rebotes')
    expect(html).toContain(`jogador=${alvo}&amp;periodo=5&amp;atributo=REBOTES`)
  }, 60_000)

  it('(telas-04) "Temporada" nomeia a temporada e a tabela não mistura partida de outra', async () => {
    nivelDoTeste = 'MVP'
    const { tela } = await dadosDoJogador(alvo, { periodo: 'temporada' })
    const [casa, visitante] = await banco.db.select().from(times).limit(2)
    // Março de 2025: com `mes_inicio: 10`, é a temporada ANTERIOR à da tela.
    const instante = new Date('2025-03-15T23:00:00.000Z')
    const [antiga] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: instante,
        dataReferencia: '2025-03-15',
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'ENCERRADO',
        placarCasa: 101,
        placarVisitante: 99,
      })
      .returning()
    try {
      await banco.db.insert(estatisticasJogo).values({
        jogoId: antiga!.id,
        jogadorId: alvo,
        minutos: '44.00',
        pontos: 51,
        rebotesTotal: 14,
        assistencias: 11,
      })
      const s = secao(await renderizarJogador(alvo, { periodo: 'temporada' }), 'Jogo a jogo')
      expect(texto(s)).toContain(`Temporada ${temporada}`)
      expect(s).not.toContain(antiga!.id)
      expect(linhasDaTabela(s)).toHaveLength(tela.historico.length)
    } finally {
      await banco.db.delete(estatisticasJogo).where(ondeBox(antiga!.id, alvo))
      await banco.db.delete(jogos).where(eq(jogos.id, antiga!.id))
    }
  }, 60_000)

  it('(telas-04) jogo a jogo é tabela com a coluna Nota; o nome é o único h1; 2P% nos números completos', async () => {
    nivelDoTeste = 'MVP'
    const { tela } = await dadosDoJogador(alvo)
    const html = await renderizarJogador(alvo)
    const s = secao(html, 'Jogo a jogo')
    expect(s).toContain('<table')
    expect(s).toContain('abbr="nota da partida"')
    const comNota = tela.historico.find((l) => l.nota !== null)
    expect(comNota).toBeDefined()
    expect(s).toContain(renderToStaticMarkup(createElement(NotaPartida, { nota: comNota!.nota })))

    const titulos = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) ?? []
    expect(titulos).toHaveLength(1)
    expect(texto(titulos[0]!)).toBe(tela.perfil.nome)
    // (telas-demo) 2P% no perfil — pedido da proposta comercial.
    expect(texto(secao(html, 'Números completos'))).toContain('2P%')
  }, 60_000)

  it('(telas-04) regras de escrita do jogador; a linha do apito é inteira, com "+"', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizarJogador(alvo)
    regrasDeEscrita(html, 'jogador')
    expect(texto(secao(html, 'Apitos da estratégia'))).toMatch(/(Pontos|Rebotes|Assistências) \d+\+/)
  }, 60_000)
})

// ===========================================================================
// TIME (telas-04-estatisticas)
// ===========================================================================

describe('Estatísticas do v2 — time', () => {
  const hierarquia = (html: string, porExtenso = 'Pontos') => secao(html, `Hierarquia NIP · ${porExtenso}`)

  it('(telas-04) a hierarquia do CJ em ordem, cada posição com o nível do jogador no atributo', async () => {
    nivelDoTeste = 'MVP'
    const linhas = itens(hierarquia(await renderizarTime(sujeito.timeId)))
    const esperadas = [...sujeito.hierarquia].sort((a, b) => a.posicao - b.posicao)
    expect(linhas).toHaveLength(esperadas.length)
    esperadas.forEach((l, i) => {
      expect(texto(linhas[i]!)).toContain(String(l.posicao))
      expect(texto(linhas[i]!)).toContain(l.nome)
      expect(texto(linhas[i]!)).toContain(NIVEL_ESCRITO[l.nivel])
    })
  }, 60_000)

  it('(telas-04) o desfalque do nº 1 vira PREFIXO em destaque, e "Fora" sai só nele', async () => {
    nivelDoTeste = 'MVP'
    const primeiro = [...sujeito.hierarquia].sort((a, b) => a.posicao - b.posicao)[0]!
    try {
      await banco.db
        .insert(lesoesEscalacao)
        .values({ jogoId: sujeito.jogoId, jogadorId: primeiro.jogadorId, status: 'FORA' })
      const s = hierarquia(await renderizarTime(sujeito.timeId))
      expect(s.match(/>Fora</g) ?? []).toHaveLength(1)
      const [doPrimeiro, ...demais] = itens(s)
      expect(texto(doPrimeiro!)).toContain(primeiro.nome)
      expect(doPrimeiro).toContain('data-abre="true"')
      for (const linha of demais) expect(linha).not.toContain('data-abre="true"')
    } finally {
      await banco.db
        .delete(lesoesEscalacao)
        .where(
          and(
            eq(lesoesEscalacao.jogoId, sujeito.jogoId),
            eq(lesoesEscalacao.jogadorId, primeiro.jogadorId),
          ),
        )
    }
  }, 60_000)

  it('(telas-04) sem desfalque no jogo do dia, nenhuma linha vira oportunidade', async () => {
    nivelDoTeste = 'MVP'
    const s = hierarquia(await renderizarTime(sujeito.timeId))
    expect(s).not.toContain('>Fora<')
    expect(s).not.toContain('data-abre="true"')
  }, 60_000)

  it('(telas-04) o seletor de atributo troca o atributo LIDO; desconhecido cai em Pontos', async () => {
    nivelDoTeste = 'MVP'
    const rebotes = await hierarquiaDoTime(banco.db, sujeito.timeId, 'REBOTES', sujeito.jogoId)
    const divergente = sujeito.hierarquia.find(
      (p) => rebotes.find((r) => r.jogadorId === p.jogadorId)?.nivel !== p.nivel,
    )
    expect(divergente, 'a lista do CJ classifica o mesmo jogador por atributo').toBeDefined()
    const emRebotes = rebotes.find((r) => r.jogadorId === divergente!.jogadorId)!

    const html = await renderizarTime(sujeito.timeId, { atributo: 'REBOTES' })
    const linha = itens(hierarquia(html, 'Rebotes')).find((l) => texto(l).includes(divergente!.nome))!
    expect(texto(linha)).toContain(NIVEL_ESCRITO[emRebotes.nivel])
    expect(texto(linha)).not.toContain(NIVEL_ESCRITO[divergente!.nivel])
    // Os três atributos a um clique, e o ativo se anuncia.
    for (const valor of ['PONTOS', 'REBOTES', 'ASSISTENCIAS']) expect(html).toContain(`?atributo=${valor}`)
    const aba = (html.match(/<a [^>]*>/g) ?? []).find((a) => a.includes('?atributo=REBOTES"'))
    expect(aba).toContain('aria-current="page"')

    expect(texto(await renderizarTime(sujeito.timeId, { atributo: 'CHUTES' }))).toContain(
      'Hierarquia NIP · Pontos',
    )
  }, 60_000)

  it('(telas-04) a hierarquia é "curadoria NIP" e o elenco é o "time atual" do PROVEDOR', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizarTime(sujeito.timeId)
    expect(texto(hierarquia(html))).toContain('curadoria NIP')
    const elenco = texto(secao(html, 'Elenco'))
    expect(elenco).toContain('time atual')
    // A exceção única do CLAUDE.md: aqui é `jogadores.time_id`, não a lista do CJ.
    const doProvedor = await banco.db
      .select({ nome: jogadores.nomeCompleto })
      .from(jogadores)
      .where(eq(jogadores.timeId, sujeito.timeId))
    expect(doProvedor.length).toBeGreaterThan(0)
    for (const j of doProvedor) expect(elenco).toContain(j.nome)
  }, 60_000)

  it('(telas-04/telas-demo) a logo no cabeçalho; o box score por jogo tem os quartos e o total', async () => {
    nivelDoTeste = 'MVP'
    const [time] = await banco.db.select().from(times).where(eq(times.id, sujeito.timeId))
    const html = await renderizarTime(sujeito.timeId)
    expect(html).toContain(`src="/times/${time!.sigla}.svg"`)
    const s = secao(html, 'Box score por jogo')
    expect(s).toContain('<table')
    expect(texto(s)).toContain('da mais recente para a mais antiga')
    for (const quarto of ['1º', '2º', '3º', '4º']) expect(s).toContain(`abbr="pontos no ${quarto} quarto"`)
    expect(s).toContain('abbr="total de pontos"')
  }, 60_000)

  it('(telas-04) GRÁTIS: box score por jogo é silhueta; campanha, hierarquia e elenco abertos', async () => {
    nivelDoTeste = 'GRATIS'
    const html = await renderizarTime(sujeito.timeId)
    expect(secao(html, 'Box score por jogo')).toContain('começa no plano')
    expect(secao(html, 'Box score por jogo')).not.toContain('<table')
    expect(hierarquia(html)).not.toContain('Ver planos')
    expect(itens(hierarquia(html)).length).toBeGreaterThan(0)
    expect(secao(html, 'Elenco')).not.toContain('Ver planos')
  }, 60_000)

  it('(telas-04) regras de escrita do time', async () => {
    nivelDoTeste = 'MVP'
    regrasDeEscrita(await renderizarTime(sujeito.timeId), 'time')
  }, 60_000)
})

// ===========================================================================
// ÍNDICE (telas-04-estatisticas, telas-demo, telas-05-classificacao)
// ===========================================================================

describe('Estatísticas do v2 — índice', () => {
  it('(telas-04) jogos do dia: uma linha por jogo, visitante @ mandante, status e logos', async () => {
    nivelDoTeste = 'GRATIS'
    const doDia = await telaJogosDoDia(banco.db, HOJE, FUSO)
    expect(doDia.jogos.length).toBeGreaterThan(0)
    const s = secao(await renderizarIndice(), 'Jogos do dia')
    const linhas = itens(s)
    expect(linhas).toHaveLength(doDia.jogos.length)
    doDia.jogos.forEach((jogo, i) => {
      const linha = texto(linhas[i]!)
      expect(linha.indexOf(jogo.visitante.sigla)).toBeGreaterThan(-1)
      expect(linha.indexOf(jogo.visitante.sigla)).toBeLessThan(linha.lastIndexOf(jogo.casa.sigla))
      if (jogo.status === 'AGENDADO') expect(linha).toContain(hora(jogo.dataHoraUtc, FUSO))
      if (jogo.status === 'AO_VIVO') expect(linha).toContain(`${jogo.quartoAtual ?? 1}º Q`)
      if (jogo.status === 'ENCERRADO') expect(linha).toContain('Final')
      expect(linhas[i]).toContain(`src="/times/${jogo.visitante.sigla}.svg"`)
      expect(linhas[i]).toContain(`src="/times/${jogo.casa.sigla}.svg"`)
      // A porta da partida leva a data navegada, para o "voltar" pousar no mesmo dia.
      expect(linhas[i]).toContain(`href="/estatisticas/jogo/${jogo.id}?data=${HOJE}"`)
    })
  }, 60_000)

  it('(telas-04) o jogo em andamento mostra o parcial sem declarar vencedor', async () => {
    nivelDoTeste = 'GRATIS'
    const doDia = await telaJogosDoDia(banco.db, HOJE, FUSO)
    const aoVivo = doDia.jogos.find((j) => j.status === 'AO_VIVO')
    expect(aoVivo, 'a temporada simulada tem jogo em andamento hoje').toBeDefined()
    const linha = itens(secao(await renderizarIndice(), 'Jogos do dia')).find((l) =>
      l.includes(aoVivo!.id),
    )!
    expect(linha).toContain(`>${aoVivo!.casa.placar}<`)
    expect(linha).toContain(`>${aoVivo!.visitante.placar}<`)
    expect(linha).not.toContain('data-forte="false"')
  }, 60_000)

  it('(telas-demo) os horários saem no fuso do ruleset, nunca no do servidor', async () => {
    nivelDoTeste = 'GRATIS'
    const [agendado] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, HOJE), eq(jogos.status, 'AGENDADO')))
      .limit(1)
    expect(agendado).toBeDefined()
    const s = secao(await renderizarIndice(), 'Jogos do dia')
    expect(s).toContain(hora(agendado!.dataHoraUtc, FUSO))
    // Num servidor em UTC, um jogo das 21:00 de Brasília sairia 00:00.
    expect(s).not.toContain('00:00')
  }, 60_000)

  it('(telas-04) num dia já encerrado a linha traz o placar final e o status escrito', async () => {
    nivelDoTeste = 'GRATIS'
    const encerrado = await umJogo('ENCERRADO')
    const html = await renderizarIndice({ data: encerrado.dataReferencia })
    const titulo =
      encerrado.dataReferencia === HOJE ? 'Jogos do dia' : `Jogos de ${diaDaRodada(encerrado.dataReferencia)}`
    const linha = texto(
      itens(secao(html, titulo)).find((l) =>
        l.includes(encerrado.id),
      )!,
    )
    expect(linha).toContain('Final')
    expect(linha).toContain(String(encerrado.placarCasa))
    expect(linha).toContain(String(encerrado.placarVisitante))
  }, 60_000)

  it('(telas-demo) navega por data: anterior e seguinte apontam para o dia certo; data inválida cai em hoje', async () => {
    nivelDoTeste = 'GRATIS'
    const html = await renderizarIndice()
    const ontem = somarDias(HOJE, -1)
    const amanha = somarDias(HOJE, 1)
    // Cada seta amarrada ao SEU dia: trocar as duas no JSX não pode passar.
    const ancora = (rotulo: string) => (html.match(/<a [^>]*>/g) ?? []).find((a) => a.includes(`aria-label="${rotulo}"`))
    expect(ancora('Dia anterior')).toContain(`href="/estatisticas?data=${ontem}"`)
    expect(ancora('Dia seguinte')).toContain(`href="/estatisticas?data=${amanha}"`)
    expect(await renderizarIndice({ data: 'ontem' })).toContain('Jogos do dia')
  }, 60_000)

  it('(telas-demo) o título diz a data navegada, e o vazio não mente "hoje"', async () => {
    nivelDoTeste = 'GRATIS'
    const ontem = somarDias(HOJE, -1)
    const amanha = somarDias(HOJE, 1)
    expect(texto(await renderizarIndice({ data: ontem }))).toContain(`Jogos de ${diaDaRodada(ontem)}`)
    const vazio = texto(await renderizarIndice({ data: amanha }))
    expect(vazio).not.toContain('Nenhum jogo hoje')
    expect(vazio).toContain(`Nenhum jogo em ${diaDaRodada(amanha)}`)
  }, 60_000)

  it('(telas-05-classificacao) uma tabela por conferência, posição reinicia em cada uma, trilho 6 + 4', async () => {
    nivelDoTeste = 'GRATIS'
    const dados = await telaDaClassificacao(banco.db, temporada)
    const conferencias = [...new Set(dados.linhas.map((l) => l.conferencia))]
    expect(conferencias).toHaveLength(2)
    const html = await renderizarIndice()
    expect(html).toContain('id="classificacao"')
    for (const conferencia of conferencias) {
      const grupo = dados.linhas.filter((l) => l.conferencia === conferencia)
      const s = secao(html, `Classificação · ${conferencia}`)
      const linhas = linhasDaTabela(s)
      expect(linhas).toHaveLength(grupo.length)
      grupo.forEach((time, i) => {
        const linha = linhas.find((l) => l.includes(`href="${rotaDoTime(time.timeId)}"`))!
        expect(linha, time.sigla).toBeDefined()
        expect(linhas.indexOf(linha)).toBe(i)
        expect(texto(linha)).toContain(time.sigla)
        expect(texto(linha)).toContain(`${time.vitorias}–${time.derrotas}`)
        expect(linha).toContain(`src="/times/${time.sigla}.svg"`)
        // Os pontinhos dos últimos 5 são NOMEADOS um a um.
        expect(linha.match(/aria-label="(vitória|derrota)"/g)?.length ?? 0).toBe(time.forma.length)
      })
      // 1º a Nº DENTRO da conferência — não a numeração da liga.
      const posicoes = linhas.map((l) => Number(/<th[^>]*>[\s\S]*?>(\d+)</.exec(l)?.[1]))
      expect(posicoes).toEqual(grupo.map((_, i) => i + 1))
      expect(s.match(/data-t="playoff"/g) ?? []).toHaveLength(6)
      expect(s.match(/data-t="play-in"/g) ?? []).toHaveLength(4)
      // E o corte fica ESCRITO sob a tabela: forma nunca é canal único.
      expect(texto(s)).toContain('play-in até a 10ª')
    }
  }, 60_000)

  it('(telas-04) time sem partida encerrada mostra "—" nos últimos 5', async () => {
    nivelDoTeste = 'GRATIS'
    const [novo] = await banco.db.insert(times).values({ sigla: 'ZZZ', nome: 'Clube sem partida' }).returning()
    await banco.db.insert(classificacao).values({
      temporada,
      timeId: novo!.id,
      vitorias: 0,
      derrotas: 0,
      posicao: 99,
      capturadoEm: new Date(0),
    })
    try {
      const html = await renderizarIndice()
      // Sem conferência no cadastro: um grupo ROTULADO, nunca "Leste" por padrão.
      const s = secao(html, 'Classificação · sem conferência')
      const linha = linhasDaTabela(s).find((l) => l.includes(`href="${rotaDoTime(novo!.id)}"`))!
      expect(linha).toBeDefined()
      expect(linha).not.toContain('aria-label="vitória"')
      expect(linha).not.toContain('aria-label="derrota"')
      expect(texto(linha)).toContain('—')
    } finally {
      await banco.db.delete(classificacao).where(eq(classificacao.timeId, novo!.id))
      await banco.db.delete(times).where(eq(times.id, novo!.id))
    }
  }, 60_000)

  it('(telas-05-classificacao) temporada sem classificação não anuncia um grupo que não existe', async () => {
    nivelDoTeste = 'GRATIS'
    await banco.db.delete(classificacao).where(eq(classificacao.temporada, temporada))
    try {
      const html = await renderizarIndice()
      expect(html).toContain('Sem classificação registrada para esta temporada.')
      expect(html).not.toContain('sem conferência')
      expect(html).not.toContain('play-in até')
    } finally {
      await semearClassificacao(banco.db, await rulesetAtivo(), HOJE)
    }
  }, 60_000)

  it('(telas-04) regras de escrita do índice', async () => {
    nivelDoTeste = 'GRATIS'
    regrasDeEscrita(await renderizarIndice(), 'índice')
  }, 60_000)
})

// ===========================================================================
// PARTIDA (telas-04-estatisticas, telas-demo)
// ===========================================================================

describe('Estatísticas do v2 — partida', () => {
  it('(telas-04) o 1º quarto é a coluna que o Fire Live observa — dito uma vez; as logos dos dois lados', async () => {
    nivelDoTeste = 'MVP'
    const jogo = await umJogo('ENCERRADO')
    const tela = (await telaDoJogo(banco.db, jogo.id, {}))!
    const html = await renderizarJogo(jogo.id)
    const s = secao(html, 'Pontos por quarto')
    expect(s).toContain('abbr="1º quarto — o que o Fire Live observa"')
    expect(texto(html).match(/1º Q · o que o Fire Live observa/g) ?? []).toHaveLength(1)
    expect(linhasDaTabela(s)).toHaveLength(2)
    expect(html).toContain(`src="/times/${tela.casa.sigla}.svg"`)
    expect(html).toContain(`src="/times/${tela.visitante.sigla}.svg"`)
  }, 60_000)

  it('(telas-demo) encerrado: líderes, sem refresh ao vivo; box score com rosto e porta para o jogador', async () => {
    nivelDoTeste = 'MVP'
    const jogo = await umJogo('ENCERRADO')
    const tela = (await telaDoJogo(banco.db, jogo.id, {}))!
    const geral = await renderizarJogo(jogo.id)
    expect(geral).toContain('Líderes da partida')
    expect(geral).not.toContain('data-atualiza-ao-vivo')

    const box = await renderizarJogo(jogo.id, { aba: 'box' })
    expect(box).toMatch(/<caption[^>]*>Box score de [^<]*<\/caption>/)
    const inicio = box.search(new RegExp(`<section[^>]*aria-label="${tela.casa.sigla} · [^"]*"`))
    expect(inicio, 'a seção do box score do mandante').toBeGreaterThan(-1)
    const casa = linhasDaTabela(box.slice(inicio, box.indexOf('</section>', inicio)))
    expect(casa.length).toBe(tela.casa.boxScore.length)
    // (telas-demo) a nota da partida é o badge de sempre, com vírgula.
    const comNota = tela.casa.boxScore.findIndex((l) => l.nota !== null)
    expect(comNota).toBeGreaterThan(-1)
    expect(casa[comNota]).toContain(
      renderToStaticMarkup(createElement(NotaPartida, { nota: tela.casa.boxScore[comNota]!.nota })),
    )
    expect(texto(casa[comNota]!)).toMatch(/\b\d{1,2},\d\b/)
    for (const linha of casa) {
      expect(linha).toMatch(/href="\/estatisticas\/jogador\/[0-9a-f-]+"/)
      expect(linha).toContain('width:28px;height:28px')
      // Dado canônico: nenhum rosto veste anel de apito.
      expect(linha).not.toContain('box-shadow')
    }
  }, 60_000)

  it('(telas-demo) AO VIVO: o NOSSO refresh monta, o parcial aparece e ninguém vence', async () => {
    nivelDoTeste = 'MVP'
    const jogo = await umJogo('AO_VIVO')
    const html = await renderizarJogo(jogo.id)
    expect(html).toContain('data-atualiza-ao-vivo="30000"')
    expect(html).toContain('Pontos por quarto')
    expect(html).not.toContain('Líderes da partida')
    const box = await renderizarJogo(jogo.id, { aba: 'box' })
    expect(box).not.toContain('Box score em atualização')
    expect(box).toMatch(/<caption[^>]*>Box score de /)
  }, 60_000)

  it('a tela de partida usa o refresh do Ao Vivo (aba visível + jitter); a cópia do v2 saiu', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    expect(existsSync('src/features/estatisticas/AtualizarAoVivo.tsx')).toBe(false)
    const fonte = readFileSync('src/features/estatisticas/TelaJogo.tsx', 'utf8')
    expect(fonte).toContain("from '@/features/ao-vivo/AtualizarAoVivo'")
    expect(fonte).not.toMatch(/setInterval|router\.refresh/)
  })

  it('(telas-04) o desfalque que está na lista do CJ sai com a posição e o nível, rotulado "Curadoria NIP"', async () => {
    nivelDoTeste = 'MVP'
    const doDia = await telaJogosDoDia(banco.db, HOJE, FUSO)
    let escolhido: { jogoId: string; timeId: string; linha: LinhaHierarquia } | undefined
    procura: for (const jogo of doDia.jogos) {
      if (jogo.status === 'ENCERRADO') continue
      for (const lado of [jogo.casa, jogo.visitante]) {
        for (const linha of await hierarquiaDoTime(banco.db, lado.id, 'PONTOS', jogo.id)) {
          const [j] = await banco.db.select().from(jogadores).where(eq(jogadores.id, linha.jogadorId))
          if (j?.timeId === lado.id) {
            escolhido = { jogoId: jogo.id, timeId: lado.id, linha }
            break procura
          }
        }
      }
    }
    expect(escolhido, 'jogo por vir hoje com a lista do CJ no elenco real').toBeDefined()
    const [semClasse] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Atleta sem classificação', timeId: escolhido!.timeId })
      .returning()
    try {
      await banco.db.insert(lesoesEscalacao).values([
        { jogoId: escolhido!.jogoId, jogadorId: escolhido!.linha.jogadorId, status: 'FORA' },
        { jogoId: escolhido!.jogoId, jogadorId: semClasse!.id, status: 'FORA' },
      ])
      const s = secao(await renderizarJogo(escolhido!.jogoId), 'Desfalques')
      const linhas = itens(s).map(texto)
      const classificado = linhas.find((l) => l.includes(escolhido!.linha.nome))!
      expect(classificado).toContain(`nº ${escolhido!.linha.posicao}`)
      expect(classificado).toContain(NIVEL_ESCRITO[escolhido!.linha.nivel])
      expect(classificado).toContain('Curadoria NIP')
      expect(classificado.match(/nº \d+/g) ?? []).toHaveLength(1)
      const outro = linhas.find((l) => l.includes(semClasse!.nomeCompleto))!
      expect(outro).toBeDefined()
      expect(outro).not.toMatch(/nº \d+/)
    } finally {
      await banco.db
        .delete(lesoesEscalacao)
        .where(
          and(
            eq(lesoesEscalacao.jogoId, escolhido!.jogoId),
            inArray(lesoesEscalacao.jogadorId, [escolhido!.linha.jogadorId, semClasse!.id]),
          ),
        )
      await banco.db.delete(jogadores).where(eq(jogadores.id, semClasse!.id))
    }
  }, 60_000)

  it('(telas-demo) par inédito: os confrontos dizem "Primeiro confronto", não somem', async () => {
    nivelDoTeste = 'MVP'
    const todos = await banco.db.select().from(times)
    const marcados = await banco.db
      .select({ c: jogos.timeCasaId, v: jogos.timeVisitanteId })
      .from(jogos)
    const ja = new Set(marcados.flatMap((j) => [`${j.c}|${j.v}`, `${j.v}|${j.c}`]))
    const par = todos.flatMap((a) =>
      todos.filter((b) => b.id !== a.id && !ja.has(`${a.id}|${b.id}`)).map((b) => [a, b] as const),
    )[0]
    expect(par, 'um par que nunca se enfrentou na janela simulada').toBeDefined()
    const amanha = somarDias(HOJE, 1)
    const [novo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date(`${amanha}T20:00:00.000Z`),
        dataReferencia: amanha,
        timeCasaId: par![0].id,
        timeVisitanteId: par![1].id,
        status: 'AGENDADO',
      })
      .returning()
    try {
      const geral = await renderizarJogo(novo!.id)
      expect(geral).not.toContain('Líderes da partida')
      expect(await renderizarJogo(novo!.id, { aba: 'confrontos' })).toContain(
        'Primeiro confronto da temporada',
      )
    } finally {
      await banco.db.delete(jogos).where(eq(jogos.id, novo!.id))
    }
  }, 60_000)

  it('GRÁTIS: box score e confrontos são silhueta; pontos por quarto e líderes abertos', async () => {
    nivelDoTeste = 'GRATIS'
    const jogo = await umJogo('ENCERRADO')
    const geral = await renderizarJogo(jogo.id)
    expect(geral).toContain('Líderes da partida')
    expect(geral).toContain('Pontos por quarto')
    for (const aba of ['box', 'confrontos']) {
      const html = await renderizarJogo(jogo.id, { aba })
      expect(html, aba).toContain('começa no plano')
      expect(html, aba).not.toMatch(/<caption[^>]*>Box score de/)
      expect(html, aba).not.toContain('/estatisticas/jogador/')
    }
  }, 60_000)

  it('(telas-04/telas-demo) regras de escrita da partida, em todo estado — e nada de "nível"', async () => {
    nivelDoTeste = 'MVP'
    for (const status of ['AGENDADO', 'AO_VIVO', 'ENCERRADO'] as const) {
      const jogo = await umJogo(status)
      for (const aba of ['geral', 'box', 'confrontos']) {
        const html = await renderizarJogo(jogo.id, { aba })
        regrasDeEscrita(html, `${status}/${aba}`)
        expect(texto(html).toLowerCase(), `${status}/${aba}`).not.toMatch(/(?<!\p{L})nível/u)
      }
    }
  }, 120_000)
})
