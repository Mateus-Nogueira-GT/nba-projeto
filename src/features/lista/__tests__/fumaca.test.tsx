import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { feedSnapshot, usuarios } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { ConteudoFeed, ItemFeed } from '@/modules/entrega/tipos-feed'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { horaEmTexto } from '@/ui/formato'

/**
 * FUMAÇA DA LISTA DO V2 — ligada ao NOSSO back.
 *
 * O v2 foi escrito contra uma fachada sempre ADMIN e sem cache. Aqui a página
 * de verdade (`src/app/(app)/page.tsx` → `features/lista/carregar.ts`) roda
 * sobre um PGlite semeado pela temporada simulada, com sessão e acesso
 * simulados (a fronteira de autenticação não está sob teste) e o nível
 * MUTÁVEL por `nivelDoTeste`, no padrão de `planos-home.test.ts`.
 *
 * Mesma regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador,
 * time ou horário — o sujeito é lido do banco.
 *
 * Herda as invariantes das suítes da home antiga (telas-04-lista,
 * telas-05-gratis, telas-demo), aposentadas junto com ela: cada caso abaixo
 * diz de onde veio.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'
// Quanto o `getDb()` simulado devolve — trocado só pelo caso do banco vazio.
let dbAtual: () => unknown = () => banco.db

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
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
  getDb: () => dbAtual(),
  fecharDb: async () => {},
}))
// `renderToStaticMarkup` não monta o App Router: os ganchos de rota dos
// componentes de cliente (a linha marcada como atual, a folha do celular)
// recebem valores neutros. `redirect`/`notFound` continuam os de verdade.
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  // Produção está em `niveis.atributos: [PONTOS]`. O recorte por atributo e o
  // chip de quantidade que o preserva só existem com mais de um atributo —
  // religa os três num CLONE do ruleset, só para o seed (como telas-demo).
  const rulesetDaSemente = structuredClone(await rulesetAtivo())
  rulesetDaSemente.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
  await simularAte(banco.db, rulesetDaSemente, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()`: sem congelar o relógio no instante
  // semeado ela consultaria o dia real. Só `Date` — timers travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

type Busca = Record<string, string | string[] | undefined>

async function renderizar(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function itensDeHoje(): Promise<ItemFeed[]> {
  const [feed] = await banco.db
    .select()
    .from(feedSnapshot)
    .where(and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
  return (feed!.conteudoJson as ConteudoFeed).itens
}

describe('Lista do v2 — portão de nível', () => {
  it('MVP vê a tabela com um apito do feed, pelo cache', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const primeiro = (await itensDeHoje())[0]!
    expect(html).toContain(primeiro.nome)
    expect(html).not.toMatch(/probabilidade/i)
  }, 60_000)

  it('GRÁTIS não recebe nenhum jogadorId do feed no HTML', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar()
      const itens = await itensDeHoje()
      expect(itens.length).toBeGreaterThan(0)
      for (const i of itens) expect(html).not.toContain(i.jogadorId)
      // (telas-05-gratis) Nem o NOME de quem apitou, nem link de detalhe, nem
      // o assistente — que é do MVP para cima.
      for (const i of itens) expect(html).not.toContain(i.nome)
      expect(html).not.toContain('href="/apito/')
      expect(html).not.toContain('Pergunte sobre a lista de hoje')
      // O convite leva ao plano certo, voltando para cá.
      expect(html).toMatch(/href="\/assinar\?nivel=MVP/)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('GRÁTIS: o dado que a tela recebe não tem campo para item do feed — só números', async () => {
    // Trava a forma, e não o HTML: um item que entrasse no objeto do grátis
    // chegaria ao componente mesmo que a tela não o desenhasse hoje.
    nivelDoTeste = 'GRATIS'
    try {
      const { carregarLista } = await import('@/features/lista/carregar')
      const { lerEstadoDaTabela } = await import('@/features/lista/estado')
      const dados = await carregarLista(lerEstadoDaTabela({}))
      expect(dados.tipo).toBe('gratis')
      expect(Object.keys(dados).sort()).toEqual(['bloqueados', 'fuso', 'hoje', 'jogos', 'tipo'])
      if (dados.tipo !== 'gratis') throw new Error('inalcançável')
      expect(Object.keys(dados.bloqueados).sort()).toEqual(['porJogo', 'total'])
      expect(typeof dados.bloqueados.total).toBe('number')
      for (const n of Object.values(dados.bloqueados.porJogo)) expect(typeof n).toBe('number')
      // As chaves de `porJogo` são ids de JOGO do dia, nunca de jogador.
      const jogos = new Set(dados.jogos.map((j) => j.id))
      for (const k of Object.keys(dados.bloqueados.porJogo)) expect(jogos.has(k)).toBe(true)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('(telas-05-gratis) a chamada para assinar volta no meio da rolagem', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar()
      const { jogosDoDiaResumo } = await import('@/modules/entrega/lista-por-jogo')
      const jogos = await jogosDoDiaResumo(banco.db, HOJE, FUSO)
      expect(jogos.length, 'a semente precisa de pelo menos quatro jogos').toBeGreaterThan(3)
      // UMA repetição depois do terceiro jogo: no scroll longo a do topo sai da tela.
      const convites = [...html.matchAll(/href="\/assinar\?nivel=MVP/g)]
      expect(convites.length).toBe(2)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('banco sem semente: a Lista diz que não há lista, sem lançar', async () => {
    const vazio = await bancoDeTeste()
    await vazio.db
      .insert(usuarios)
      .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
      .onConflictDoNothing()
    dbAtual = () => vazio.db
    try {
      const html = await renderizar()
      // Sem jogo e sem temporada nenhuma não é hiato (banco vazio não afirma
      // nada): é o "sem jogos hoje", com a saída para a noite passada.
      expect(html).toContain('Sem jogos hoje')
      expect(html).toContain('href="/resultados"')
    } finally {
      dbAtual = () => banco.db
      await vazio.fechar()
    }
  }, 60_000)
})

describe('Lista do v2 — o que a home antiga garantia', () => {
  it('(telas-04-lista) a linha leva ao apito COM o atributo', async () => {
    const html = await renderizar()
    expect(html).toMatch(/href="\/apito\/[0-9a-f-]+\?atributo=(PONTOS|REBOTES|ASSISTENCIAS)"/)
  }, 60_000)

  it('(D1) a confiança de cada linha fica, como nota — nunca "probabilidade"', async () => {
    const html = await renderizar()
    expect(html).toContain('Confiança')
    const comNota = (await itensDeHoje()).find((i) => i.confianca !== null)
    expect(comNota).toBeDefined()
    expect(texto(html)).toContain(`${Math.round(comNota!.confianca!)}`)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  }, 60_000)

  it('(telas-demo) o recorte por atributo devolve só aquele atributo', async () => {
    const itens = await itensDeHoje()
    const deRebote = new Set(itens.filter((i) => i.atributo === 'REBOTES').map((i) => i.chave))
    expect(deRebote.size).toBeGreaterThan(0)
    const html = await renderizar({ atributo: 'REBOTES' })
    const links = [...html.matchAll(/href="\/apito\/[0-9a-f-]+\?atributo=([A-Z]+)"/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) expect(a).toBe('REBOTES')
  }, 60_000)

  it('(navegacao) com filtro, o contador diz "N de M": o número da tela é o que ela MOSTRA (correções de lógica 19/09)', async () => {
    const cheia = texto(await renderizar())
    const total = cheia.match(/(\d+) entradas em \d+ jogos/)?.[1]
    expect(total, 'o subtítulo conta as entradas publicadas').toBeDefined()
    // sem filtro os dois números coincidem e a frase é a de sempre
    expect(cheia).toContain(`${total} entradas`)
    expect(cheia).not.toMatch(/\d+ de \d+ entradas/)

    const filtrada = texto(await renderizar({ atributo: 'REBOTES' }))
    const [, visiveis, publicadas] = filtrada.match(/(\d+) de (\d+) entradas/) ?? []
    expect(publicadas).toBe(total)
    expect(Number(visiveis)).toBeGreaterThan(0)
    expect(Number(visiveis)).toBeLessThan(Number(publicadas))
  }, 60_000)

  it('(telas-demo) trocar a quantidade PRESERVA o recorte de atributo', async () => {
    const html = await renderizar({ atributo: 'REBOTES' })
    const quantidades = [...html.matchAll(/href="(\/\?[^"]*quantidade=\d[^"]*)"/g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&'),
    )
    expect(quantidades.length).toBeGreaterThan(0)
    for (const href of quantidades) expect(href).toContain('atributo=REBOTES')
  }, 60_000)

  it('(telas-04-lista) recorte que zera a lista diz que não há apito com esses filtros', async () => {
    const html = await renderizar({ time: 'ZZZ' })
    expect(html).toContain('Nenhum apito com esses filtros')
  }, 60_000)

  it('(telas-04-lista) antes da publicação a tela diz a que horas sai a próxima lista', async () => {
    const { jogosDoDiaResumo } = await import('@/modules/entrega/lista-por-jogo')
    const ruleset = await rulesetAtivo()
    const primeiro = (await jogosDoDiaResumo(banco.db, HOJE, FUSO))[0]!
    const saida = new Date(
      primeiro.dataHoraUtc.getTime() - ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000,
    )
    const onde = and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA'))
    const [linha] = await banco.db.select().from(feedSnapshot).where(onde)
    try {
      await banco.db.delete(feedSnapshot).where(onde)
      const html = await renderizar()
      expect(html).toContain(`Próxima lista às ${horaEmTexto(saida, FUSO)}`)
      expect(html).toContain('href="/resultados"')
    } finally {
      await banco.db.insert(feedSnapshot).values(linha!)
    }
  }, 60_000)

  it('(telas-demo) às 21h30 de Brasília a lista ainda é a de hoje', async () => {
    // 00:30Z é 21:30 do dia ANTERIOR em Brasília: por UTC, a tela pediria a
    // lista de amanhã e mostraria o vazio na hora em que os jogos começam.
    vi.setSystemTime(new Date(`${somarDias(HOJE, 1)}T00:30:00.000Z`))
    try {
      const html = await renderizar()
      expect(html).not.toContain('Próxima lista às')
      expect(texto(html)).toMatch(/entradas em \d+ jogos/)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('(telas-demo) o resumo do dia aparece — e sem ele a tela não abre buraco', async () => {
    const onde = and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA'))
    const [linha] = await banco.db.select().from(feedSnapshot).where(onde).limit(1)
    const original = linha!.conteudoJson as ConteudoFeed
    expect(typeof original.resumoDoDia).toBe('string')
    expect(await renderizar()).toContain(original.resumoDoDia!)
    try {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: { ...original, resumoDoDia: null } })
        .where(onde)
      const sem = await renderizar()
      expect(sem).not.toContain(original.resumoDoDia!)
      expect(sem).toContain('Lista do dia')
    } finally {
      await banco.db.update(feedSnapshot).set({ conteudoJson: original }).where(onde)
    }
  }, 60_000)

  it('(telas-04-lista) linha inteira com "+", nada de meio ponto, nem o vocabulário proibido', async () => {
    for (const busca of [{}, { ordem: 'POR_NIVEL' }, { lente: 'ODDS' }, { lente: 'HIERARQUIA' }]) {
      const html = (await renderizar(busca)).replace(/<script[\s\S]*?<\/script>/g, '')
      const semTags = texto(html)
      expect(semTags).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST)\s+\d+,\d/i)
      expect(html.toLowerCase()).not.toContain('probabilidade')
      expect(html.toLowerCase()).not.toContain('meio ponto')
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('Carlos')
      expect(html).not.toMatch(/lista do CJ/i)
    }
  }, 60_000)
})

/**
 * O HIATO NA LISTA (herdado de `telas-06-temporada-exibida.test.ts`, aposentado
 * na Tarefa 5). Sem apito retroativo, a Lista fica vazia por ~32 dias entre o
 * lançamento e a primeira bola; o que ela NÃO pode é repetir "sem jogos hoje"
 * — o texto de uma terça de folga — porque por um mês isso lê como app
 * quebrado.
 */
describe('Lista do v2 — hiato entre temporadas', () => {
  /** Dentro do hiato: o calendário já virou para 2026-27, a bola ainda não subiu. */
  const HIATO = new Date('2026-10-02T18:00:00.000Z')

  it('(telas-06) explica o hiato e aponta a aba que tem conteúdo, sem inventar data', async () => {
    vi.setSystemTime(HIATO)
    try {
      const visivel = texto(await renderizar())
      expect(visivel).toContain('A temporada ainda não começou')
      expect(visivel).not.toContain('Sem jogos hoje')
      // A saída: a aba que tem conteúdo de verdade.
      expect(visivel).toContain('STATS')
      // Sem jogo AGENDADO no banco, nada de "volta em novembro": inventar data
      // é inventar fato (regra 3 do CLAUDE.md).
      expect(visivel).toContain('entre temporadas')
      expect(visivel).not.toMatch(/volta em \d/)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)
})
