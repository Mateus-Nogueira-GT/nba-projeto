import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { feedSnapshot, jogos, times, usuarios } from '@/modules/dominio/db/schema'
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
      expect(Object.keys(dados).sort()).toEqual(['bloqueados', 'fuso', 'hoje', 'jogos', 'seletor', 'tipo'])
      // O seletor de temporada (spec 25/09) carrega só RÓTULOS de temporada.
      expect(Object.keys(dados.seletor).sort()).toEqual(['temporada', 'temporadas'])
      for (const t of [dados.seletor.temporada, ...dados.seletor.temporadas]) expect(t).toMatch(/^\d{4}(-\d{2})?$/)
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

// ===========================================================================
// A TEMPORADA ANTERIOR (spec 25/09, decisão 6) — aberta para o grátis
// ===========================================================================

describe('Lista do v2 — temporada anterior', () => {
  /** Um ano antes da temporada simulada: nunca é a temporada do calendário do teste. */
  const DIA_ANTERIOR = '2024-11-04'
  /** A temporada de AGORA (2026-01-15) no calendário do ruleset. */
  const TEMPORADA_DO_CALENDARIO = '2025-26'
  let TEMPORADA_ANTERIOR = ''
  let NOME_DO_APITADO = ''

  /** O fino invólucro que a spec da tarefa nomeia: nível + busca. */
  async function renderizarListaComo(nivel: NivelDoPlano, busca: Busca = {}): Promise<string> {
    nivelDoTeste = nivel
    try {
      return await renderizar(busca)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }

  beforeAll(async () => {
    const { semearDiaAnterior } = await import('@/modules/entrega/retroativo/__tests__/semente-tela')
    const semente = await semearDiaAnterior(banco.db, await rulesetAtivo(), DIA_ANTERIOR)
    TEMPORADA_ANTERIOR = semente.temporada
    NOME_DO_APITADO = semente.apitados[0]!.nome
  }, 60_000)

  it('temporada anterior: o grátis vê a Lista do dia', async () => {
    const html = await renderizarListaComo('GRATIS', { temporada: TEMPORADA_ANTERIOR, data: DIA_ANTERIOR })
    expect(html).toContain(NOME_DO_APITADO)
    expect(texto(html)).toContain(
      'A metodologia NIP aplicada à temporada passada. Nenhum destes apitos foi publicado na época.',
    )
    // Cada linha leva ao resultado DAQUELE dia, nunca ao apito de hoje.
    expect(html).toContain(`href="/resultados/${DIA_ANTERIOR}?temporada=${TEMPORADA_ANTERIOR}"`)
    expect(html).not.toContain('href="/apito/')
    // Sem odd: nem coluna, nem pílula, nem a lente de odds.
    expect(html).not.toContain('Ordenar por odd')
    expect(html).not.toMatch(/>Odds?</)
    // E nenhum convite a assinar: não há nada bloqueado aqui.
    expect(html).not.toMatch(/href="\/assinar/)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  }, 60_000)

  it('temporada anterior sem ?data= (ou com data fora dela) abre a primeira data disponível', async () => {
    for (const data of [undefined, HOJE, 'lixo']) {
      const html = await renderizarListaComo('GRATIS', { temporada: TEMPORADA_ANTERIOR, ...(data ? { data } : {}) })
      expect(html).toContain(NOME_DO_APITADO)
      expect(html).toContain(`/resultados/${DIA_ANTERIOR}?temporada=${TEMPORADA_ANTERIOR}`)
    }
  }, 60_000)

  it('os controles da temporada anterior preservam a temporada e a data', async () => {
    const html = await renderizarListaComo('GRATIS', { temporada: TEMPORADA_ANTERIOR, data: DIA_ANTERIOR })
    // Os chips (links) e o destino das ações de preferência (formulários).
    const quantidades = [...html.matchAll(/href="(\/\?[^"]*quantidade=\d[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
    const destinos = [...html.matchAll(/name="destino" value="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
    expect(quantidades.length).toBeGreaterThan(0)
    expect(destinos.length).toBeGreaterThan(0)
    for (const href of [...quantidades, ...destinos]) {
      expect(href).toContain(`temporada=${TEMPORADA_ANTERIOR}`)
      expect(href).toContain(`data=${DIA_ANTERIOR}`)
    }
    // A busca reenvia os dois.
    expect(html).toContain(`name="temporada" value="${TEMPORADA_ANTERIOR}"`)
    expect(html).toContain(`name="data" value="${DIA_ANTERIOR}"`)
  }, 60_000)

  it('temporada do calendário na URL NÃO abre a Lista paga para o grátis', async () => {
    const JOGADORES_DO_FEED_DE_HOJE = (await itensDeHoje()).map((i) => i.jogadorId)
    expect(JOGADORES_DO_FEED_DE_HOJE.length).toBeGreaterThan(0)
    for (const busca of [
      { temporada: TEMPORADA_DO_CALENDARIO },
      { temporada: TEMPORADA_DO_CALENDARIO, data: DIA_ANTERIOR },
      { temporada: 'lixo' },
      { temporada: 'lixo', data: DIA_ANTERIOR },
      { data: HOJE },
    ]) {
      const html = await renderizarListaComo('GRATIS', busca)
      for (const id of JOGADORES_DO_FEED_DE_HOJE) expect(html).not.toContain(id)
      expect(html).toMatch(/href="\/assinar\?nivel=MVP/)
      expect(html).not.toContain('aplicada à temporada passada')
    }
  }, 60_000)

  it('temporada do calendário na URL: o assinante vê a Lista de hoje, igual a sem o parâmetro', async () => {
    const sem = await renderizarListaComo('MVP')
    const com = await renderizarListaComo('MVP', { temporada: TEMPORADA_DO_CALENDARIO })
    expect(com).toContain((await itensDeHoje())[0]!.nome)
    expect(com).not.toContain('aplicada à temporada passada')
    // O mesmo conteúdo; só os links diferem — levam a escolha (fix round 1).
    expect(texto(com)).toBe(texto(sem))
    expect(sem).not.toContain('temporada=' + TEMPORADA_DO_CALENDARIO + '&')
  }, 60_000)

  it('o seletor de temporada aparece para o grátis na temporada atual', async () => {
    const html = await renderizarListaComo('GRATIS')
    expect(html).toContain(`href="/?temporada=${TEMPORADA_ANTERIOR}"`)
  }, 60_000)
})

// ===========================================================================
// O PADRÃO COM A EXIBIDA ATRASADA (fix round 1): hiato × noite de estreia
// ===========================================================================

describe('Lista do v2 — padrão da temporada com o calendário em 2026-27', () => {
  /** Dentro do hiato: o calendário já virou para 2026-27, nenhum jogo dela ainda. */
  const HIATO = new Date('2026-10-02T18:00:00.000Z')
  /** Noite de estreia: jogo de 2026-27 agendado e a Lista publicada; nenhum encerrado. */
  const ESTREIA = new Date('2026-10-21T21:00:00.000Z')
  const DIA_DA_ESTREIA = '2026-10-21'
  /** Um dia de 2025-26 fora da janela simulada, com Lista retroativa. */
  const DIA_2025 = '2025-11-04'
  let NOME_2025 = ''
  let ITENS_DA_ESTREIA: ItemFeed[] = []

  async function comoNivel(nivel: NivelDoPlano, busca: Busca = {}): Promise<string> {
    nivelDoTeste = nivel
    try {
      // As dicas de preload de imagem saem só na primeira renderização de cada
      // imagem no processo: não são da tela, e comparar HTML as ignora.
      return (await renderizar(busca)).replace(/<link rel="preload"[^>]*>/g, '')
    } finally {
      nivelDoTeste = 'MVP'
    }
  }

  beforeAll(async () => {
    const { semearDiaAnterior } = await import('@/modules/entrega/retroativo/__tests__/semente-tela')
    NOME_2025 = (await semearDiaAnterior(banco.db, await rulesetAtivo(), DIA_2025)).apitados[0]!.nome
  }, 60_000)

  describe('no hiato (nenhum jogo de 2026-27)', () => {
    beforeAll(() => {
      vi.setSystemTime(HIATO)
    })
    afterAll(() => {
      vi.setSystemTime(AGORA)
    })

    it('(a) sem parâmetro, abre a Lista da temporada anterior — aberta para o grátis', async () => {
      const html = await comoNivel('GRATIS')
      expect(html).toContain(NOME_2025)
      expect(html).toContain('aplicada à temporada passada')
      expect(html).not.toMatch(/href="\/assinar/)
    }, 60_000)

    it('(d) lixo e parâmetro repetido são o mesmo que nenhum parâmetro', async () => {
      const semParametro = await comoNivel('GRATIS')
      expect(await comoNivel('GRATIS', { temporada: 'lixo' })).toBe(semParametro)
      expect(await comoNivel('GRATIS', { temporada: '1999-00' })).toBe(semParametro)
      expect(await comoNivel('GRATIS', { temporada: ['2026-27', '2025-26'] })).toBe(semParametro)
    }, 60_000)

    it('(c) escolher 2026-27 é o caminho de hoje (o hiato), sem nada da temporada anterior', async () => {
      const html = await comoNivel('GRATIS', { temporada: '2026-27' })
      expect(html).not.toContain('aplicada à temporada passada')
      expect(html).not.toContain(NOME_2025)
      const assinante = texto(await comoNivel('MVP', { temporada: '2026-27' }))
      expect(assinante).toContain('A temporada ainda não começou')
    }, 60_000)
  })

  describe('na noite de estreia (2026-27 agendado, nenhum encerrado)', () => {
    let jogoId = ''
    beforeAll(async () => {
      const [casa, visitante] = await banco.db.select({ id: times.id }).from(times).limit(2)
      const [jogo] = await banco.db
        .insert(jogos)
        .values({
          timeCasaId: casa!.id,
          timeVisitanteId: visitante!.id,
          status: 'AGENDADO',
          dataReferencia: DIA_DA_ESTREIA,
          dataHoraUtc: new Date(`${DIA_DA_ESTREIA}T23:30:00.000Z`),
        })
        .returning({ id: jogos.id })
      jogoId = jogo!.id
      // A Lista da estreia publicada: os itens de hoje, na rodada da estreia.
      const [hoje] = await banco.db
        .select()
        .from(feedSnapshot)
        .where(and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
      const conteudo = { ...(hoje!.conteudoJson as ConteudoFeed), dataReferencia: DIA_DA_ESTREIA }
      ITENS_DA_ESTREIA = conteudo.itens
      await banco.db.insert(feedSnapshot).values({
        dataReferencia: DIA_DA_ESTREIA,
        estrategia: 'LISTA_SECRETA',
        jogoId: hoje!.jogoId,
        conteudoJson: conteudo,
        hash: 'estreia',
      })
      vi.setSystemTime(ESTREIA)
    })
    afterAll(async () => {
      vi.setSystemTime(AGORA)
      await banco.db
        .delete(feedSnapshot)
        .where(and(eq(feedSnapshot.dataReferencia, DIA_DA_ESTREIA), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
      await banco.db.delete(jogos).where(eq(jogos.id, jogoId))
    })

    it('(b) sem parâmetro, é a Lista de hoje: o assinante a vê, o grátis não recebe item do feed', async () => {
      expect(ITENS_DA_ESTREIA.length).toBeGreaterThan(0)
      const assinante = await comoNivel('MVP')
      expect(assinante).toContain(ITENS_DA_ESTREIA[0]!.nome)
      expect(assinante).not.toContain('aplicada à temporada passada')
      const gratis = await comoNivel('GRATIS')
      for (const i of ITENS_DA_ESTREIA) expect(gratis).not.toContain(i.jogadorId)
      expect(gratis).not.toContain('aplicada à temporada passada')
      expect(gratis).toMatch(/href="\/assinar\?nivel=MVP/)
    }, 60_000)

    it('(c) ?temporada=2026-27 é o caminho de hoje: o grátis não recebe item do feed', async () => {
      const gratis = await comoNivel('GRATIS', { temporada: '2026-27' })
      for (const i of ITENS_DA_ESTREIA) expect(gratis).not.toContain(i.jogadorId)
      expect(gratis).not.toContain('aplicada à temporada passada')
    }, 60_000)

    it('(d) lixo é o mesmo que nenhum parâmetro', async () => {
      expect(await comoNivel('GRATIS', { temporada: 'lixo' })).toBe(await comoNivel('GRATIS'))
      expect(await comoNivel('MVP', { temporada: 'lixo' })).toBe(await comoNivel('MVP'))
    }, 60_000)

    it('(e) depois de escolher 2026-27, ordenar e filtrar mantêm temporada=2026-27', async () => {
      const html = await comoNivel('MVP', { temporada: '2026-27' })
      const ordenar = [...html.matchAll(/href="(\/\?[^"]*ordenar=[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
      const quantidades = [...html.matchAll(/href="(\/\?[^"]*quantidade=\d[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
      const destinos = [...html.matchAll(/name="destino" value="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
      expect(ordenar.length).toBeGreaterThan(0)
      expect(quantidades.length).toBeGreaterThan(0)
      for (const href of [...ordenar, ...quantidades, ...destinos]) expect(href).toContain('temporada=2026-27')
      expect(html).toContain('name="temporada" value="2026-27"')
      // Sem a escolha, os links não carregam temporada nenhuma.
      expect(await comoNivel('MVP')).not.toMatch(/href="\/\?[^"]*ordenar=[^"]*temporada=/)
    }, 60_000)
  })
})
