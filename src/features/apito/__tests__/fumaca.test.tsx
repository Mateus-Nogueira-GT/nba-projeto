import { and, eq, ne } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  casas,
  estatisticasJogo,
  estatisticasQuarto,
  feedSnapshot,
  jogadores,
  jogos,
  mediasJogador,
  niveis,
  niveisVersao,
  ofertasAfiliados,
  oddsSnapshot,
  times,
  usuarios,
} from '@/modules/dominio/db/schema'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { materializarFeedFireLive, type ConteudoFeedFireLive, type ItemFireLive } from '@/modules/entrega/fire-live/feed'
import { lerFeedFireLive } from '@/modules/entrega/fire-live/leitura'
import { cotacoesPorCasa } from '@/modules/entrega/odds/leitura'
import { lerFeed, linhasDoJogador, publicarListaSecreta } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'
import {
  criarCampanhaComLink,
  criarCasaComercial,
  criarOferta,
  criarParceiro,
  definirSaidaDoApito,
  type AtorAfiliados,
} from '@/modules/plataforma/afiliados/servico'

/**
 * FUMAÇA DO DETALHE DO APITO DO V2 — as DUAS portas de entrada.
 *
 * O detalhe abre de dois jeitos: a página cheia (`/apito/<id>`, link direto,
 * push, recarregar) e o painel interceptado (`@painel/(.)apito`, clique na
 * Lista). As duas passam por `carregarApito`, que chama `exigirNivel('MVP')`
 * antes de qualquer leitura — este arquivo prova isso pelas duas portas.
 *
 * Herda as invariantes das suítes aposentadas junto com a página antiga:
 * `apito-meia-noite.test.ts` (o apito que atravessa a meia-noite no 1º
 * quarto) e `telas-04-detalhe.test.ts` (casas em texto e a saída rastreada do
 * ADR-0004; o sujeito do Fire Live; a seção do 1º quarto só no MESMO atributo).
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelDoTeste) }
})
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    // O painel só se desenha na rota a que pertence (`Painel.tsx`).
    usePathname: () => '/apito/x',
    useSearchParams: () => new URLSearchParams(),
  }
})

type Porta = 'pagina' | 'painel'
type Busca = Record<string, string | string[] | undefined>

async function renderizar(porta: Porta, jogadorId: string, busca: Busca = {}): Promise<string> {
  const { default: Pagina } =
    porta === 'pagina'
      ? await import('@/app/(app)/apito/[jogadorId]/page')
      : await import('@/app/(app)/@painel/(.)apito/[jogadorId]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ jogadorId }), searchParams: Promise.resolve(busca) }),
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

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('detalhe do apito — temporada simulada', () => {
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
    banco = await bancoDeTeste()
    await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
    await banco.db
      .insert(usuarios)
      .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
      .onConflictDoNothing()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
  }, 180_000)

  afterAll(async () => {
    vi.useRealTimers()
    await banco.fechar()
  })

  async function umApito() {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.confianca !== null && i.linha !== null)
    expect(item, 'lista de hoje sem apito com linha e confiança').toBeDefined()
    return item!
  }

  it.each<Porta>(['pagina', 'painel'])('%s: o GRÁTIS recebe o redirect de exigirNivel', async (porta) => {
    const alvo = await umApito()
    nivelDoTeste = 'GRATIS'
    try {
      const destino = await destinoDoRedirect(renderizar(porta, alvo.jogadorId, { atributo: alvo.atributo }))
      expect(destino).toContain('/assinar?nivel=MVP')
      expect(destino).toContain(encodeURIComponent(`/apito/${alvo.jogadorId}`))
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it.each<Porta>(['pagina', 'painel'])('%s: o MVP vê a linha e a confiança', async (porta) => {
    const alvo = await umApito()
    const html = await renderizar(porta, alvo.jogadorId, { atributo: alvo.atributo })
    const visivel = texto(html)
    expect(visivel).toContain(alvo.nome)
    expect(visivel).toContain(`${alvo.linha}+`)
    expect(visivel).toContain(`${Math.round(alvo.confianca!)}%`)
    expect(visivel).toContain('Confiança')
    // A única vez que a palavra proibida aparece é NEGADA (P12), e na forma
    // única da metodologia — a mesma que `marca-e-vocabulario.test.ts` aceita.
    expect(visivel.replace('não é probabilidade de acerto', '').toLowerCase()).not.toContain(
      'probabilidade',
    )
  }, 60_000)

  it.each<Porta>(['pagina', 'painel'])('%s: `?atributo=` inválido não lança', async (porta) => {
    const alvo = await umApito()
    const html = await renderizar(porta, alvo.jogadorId, { atributo: 'CHUTES' })
    expect(texto(html)).toContain(alvo.nome)
    const lixo = await renderizar(porta, alvo.jogadorId, { atributo: ['PONTOS', 'x'] })
    expect(lixo.length).toBeGreaterThan(0)
  }, 60_000)

  it('(telas-04-detalhe) as casas saem em TEXTO, sem logo nem link, com o aviso do ADR-0004', async () => {
    const alvo = await umApito()
    const grade = await cotacoesPorCasa(banco.db, [alvo.jogoId], alvo.jogadorId, alvo.atributo)
    expect(grade.length).toBeGreaterThan(0)
    const html = await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })
    const tabela = html.match(/<table\b[\s\S]*?<\/table>/)?.[0]
    expect(tabela).toBeDefined()
    for (const casa of grade) expect(tabela).toContain(casa.casa)
    // Leitura, não vitrine de casa: nem logo, nem link, dentro da grade.
    expect(tabela).not.toContain('<img')
    expect(tabela).not.toContain('<a ')
    // A grade é uma TABELA de verdade: cabeçalho com escopo e legenda.
    expect(tabela).toContain('scope="col"')
    expect(tabela).toContain('<caption')
    expect(html).toContain('Referência de mercado: a odd da sua casa pode ser outra.')
    expect(html).toContain('Nenhuma aposta é feita por aqui.')
  }, 60_000)

  it('(telas-04-detalhe) sem link marcado não há saída; com link, a saída rastreada e patrocinada — nunca um formulário de aposta', async () => {
    const alvo = await umApito()
    expect(await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })).not.toContain('href="/ir/')

    // Parceiro → oferta ATIVA → campanha → link, a mesma porta da entrega.
    const sufixo = Math.random().toString(36).slice(2)
    const [admin] = await banco.db
      .insert(usuarios)
      .values({ email: `admin-cta-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' })
      .returning()
    const ator: AtorAfiliados = { usuarioId: admin!.id, papel: 'ADMIN' }
    const agora = new Date('2026-09-12T00:00:00.000Z')
    const casa = await criarCasaComercial(banco.db, ator, `Casa CTA ${sufixo}`, agora)
    const oferta = await criarOferta(
      banco.db,
      ator,
      {
        casaId: casa.id,
        nome: `Oferta CTA ${sufixo}`,
        modalidade: 'HIBRIDO',
        moeda: 'BRL',
        urlDestino: 'https://casa-cta.test/nba',
        hostDestino: 'casa-cta.test',
      },
      agora,
    )
    await banco.db.update(ofertasAfiliados).set({ status: 'ATIVA' }).where(eq(ofertasAfiliados.id, oferta.id))
    const parceiro = await criarParceiro(
      banco.db,
      ator,
      { codigo: `parceiro-cta-${sufixo}`, nomePublico: 'Parceiro CTA' },
      agora,
    )
    const link = await criarCampanhaComLink(
      banco.db,
      ator,
      {
        parceiroId: parceiro.id,
        ofertaId: oferta.id,
        nome: `Campanha CTA ${sufixo}`,
        canal: 'SOCIAL',
        codigo: `cta-link-${sufixo}`,
        tipoDestino: 'CASA',
      },
      agora,
    )
    try {
      await definirSaidaDoApito(banco.db, ator, link.id, agora)
      const html = await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })
      // A chave contém `|`: crua, truncaria a query string.
      expect(html).toContain(`href="/ir/${link.codigo}?apito=${encodeURIComponent(alvo.chave)}"`)
      expect(html).toMatch(/rel="[^"]*\bsponsored\b[^"]*"/)
      expect(html.toLowerCase()).toContain('a odd da sua casa pode ser outra')
      expect(html).not.toMatch(/<form[^>]*aposta/i)
      expect(html).not.toContain('name="valor"')
    } finally {
      await definirSaidaDoApito(banco.db, ator, null, agora)
    }
  }, 60_000)

  /** Crava um item no snapshot de Fire Live de um jogo ainda não encerrado. */
  async function comItemAoVivo<T>(
    item: (modelo: ItemFireLive) => ItemFireLive,
    corpo: () => Promise<T>,
  ): Promise<T> {
    const ruleset = await rulesetAtivo()
    const vivo = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    const modelo = vivo.itens[0]
    expect(modelo, 'dia simulado sem apito de Fire Live').toBeDefined()
    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .innerJoin(jogos, eq(jogos.id, feedSnapshot.jogoId))
      .where(
        and(
          eq(feedSnapshot.dataReferencia, HOJE),
          eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
          ne(jogos.status, 'ENCERRADO'),
        ),
      )
      .limit(1)
    expect(linha, 'dia simulado sem snapshot de Fire Live').toBeDefined()
    const original = linha!.feed_snapshot.conteudoJson as ConteudoFeedFireLive
    const cravado = item(modelo!)
    try {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: { ...original, itens: [cravado, ...original.itens] } })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))
      const conferencia = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
      expect(conferencia.itens.map((i) => i.chave)).toContain(cravado.chave)
      return await corpo()
    } finally {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: original })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))
    }
  }

  it('(telas-04-detalhe) o apito SÓ do Fire Live abre a mesma página, com o 1º quarto', async () => {
    const ruleset = await rulesetAtivo()
    const vivo = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    const naLista = new Set(((await lerFeed(banco.db, HOJE))?.conteudo.itens ?? []).map((i) => i.jogadorId))
    const item = vivo.itens.find((i) => !naLista.has(i.jogadorId))
    expect(item, 'dia simulado sem apito de Fire Live fora da lista pré-live').toBeDefined()
    const visivel = texto(await renderizar('pagina', item!.jogadorId))
    expect(visivel).toContain('Fire Live · 1º quarto')
    expect(visivel).toContain(`${item!.valorNoQuarto} de ${item!.alvo1Q}`)
    // O alvo do 1º quarto nunca vira "linha" pré-live.
    expect(visivel).toContain('Este apito nasceu ao vivo')
  }, 60_000)

  it('(telas-04-detalhe) a seção do 1º quarto só entra quando o apito ao vivo é do MESMO atributo', async () => {
    const alvo = await umApito()
    const outro = alvo.atributo === 'REBOTES' ? 'ASSISTENCIAS' : 'REBOTES'
    const visivel = await comItemAoVivo(
      (m) => ({ ...m, chave: `${m.chave}|teste`, jogadorId: alvo.jogadorId, atributo: outro, alvo1Q: 7, valorNoQuarto: 5 }),
      async () => texto(await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })),
    )
    expect(visivel).not.toContain('1º quarto')
    expect(visivel).toContain(`${alvo.linha}+`)
  }, 60_000)

  it('(telas-04-detalhe) apito pré-live que TAMBÉM cruzou o alvo do 1º quarto continua da Lista Secreta', async () => {
    const alvo = await umApito()
    const visivel = await comItemAoVivo(
      (m) => ({ ...m, chave: `${m.chave}|mesmo`, jogadorId: alvo.jogadorId, atributo: alvo.atributo, alvo1Q: 7, valorNoQuarto: 5 }),
      async () => texto(await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })),
    )
    // O sujeito continua o pré-live (dele a linha e as casas); o 1º quarto
    // entra como SEÇÃO, porque é o mesmo mercado sendo observado ao vivo.
    expect(visivel).not.toContain('Fire Live · 1º quarto')
    expect(visivel).toContain('1º quarto')
    expect(visivel).toContain(`${alvo.linha}+`)
    expect(visivel).toContain('5 de 7')
  }, 60_000)

  it('(telas-demo) o detalhe tem as seções da análise e leva às estatísticas do jogador', async () => {
    const alvo = await umApito()
    const html = await renderizar('pagina', alvo.jogadorId, { atributo: alvo.atributo })
    const visivel = texto(html)
    for (const secao of ['Por que entrou', 'O jogo', 'Linhas de', 'Forma em'])
      expect(visivel).toContain(secao)
    // O rodapé diz o que o número É — a nota de confiança da análise.
    expect(visivel).toContain('nota de confiança')
    expect(html).toContain(`href="/estatisticas/jogador/${alvo.jogadorId}"`)
    expect(visivel).not.toContain('ALTÍSSIMO VALOR')
    // Sem /i: "+15 Pontos 1,40–1,60" é a pílula de mercado seguida da ODD
    // (decimal por natureza) — o que se proíbe é a LINHA com meio ponto.
    expect(visivel).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST)\s+\d+,\d/)
  }, 60_000)

  it('jogador sem apito hoje: estado vazio, sem lançar', async () => {
    const html = await renderizar('pagina', '00000000-0000-4000-8000-00000000abcd')
    expect(html).toContain('Sem apito para este jogador hoje')
  }, 60_000)
})

describe('o mesmo apito atravessa a meia-noite durante o 1º quarto (ex-apito-meia-noite)', () => {
  const RODADA = '2026-01-15'
  const ANTES = new Date('2026-01-16T02:58:00Z')
  const DEPOIS = new Date('2026-01-16T03:02:00Z')
  let jogadorId: string
  let antes: string
  let depois: string

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
    banco = await bancoDeTeste()
    const ruleset = await rulesetAtivo()
    const [casa, visitante] = await banco.db
      .insert(times)
      .values([
        { sigla: 'LAL', nome: 'Lakers' },
        { sigla: 'ADV', nome: 'Adversário' },
      ])
      .returning()
    const [jogador] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Jogador de Meia-Noite', timeId: casa!.id })
      .returning()
    jogadorId = jogador!.id
    const [versao] = await banco.db.insert(niveisVersao).values({ versao: 'meia-noite', ativa: true }).returning()
    await banco.db.insert(niveis).values({
      niveisVersaoId: versao!.id,
      jogadorId,
      timeId: casa!.id,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    })
    await banco.db.insert(mediasJogador).values({
      jogadorId,
      temporada: '2025-26',
      janela: 'TEMPORADA',
      jogos: 20,
      ppg: '30.00',
    })
    const [historico] = await banco.db
      .insert(jogos)
      .values({
        dataReferencia: '2026-01-14',
        dataHoraUtc: new Date('2026-01-14T23:00:00Z'),
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'ENCERRADO',
      })
      .returning()
    await banco.db.insert(estatisticasJogo).values({ jogadorId, jogoId: historico!.id, pontos: 20, minutos: '30' })
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataReferencia: RODADA,
        dataHoraUtc: new Date('2026-01-16T02:50:00Z'),
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'AGENDADO',
      })
      .returning()
    const publicacao = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: RODADA,
      agora: new Date('2026-01-16T01:50:00Z'),
    })
    expect(publicacao).toMatchObject({ publicou: true, itens: 4 })
    const lista = await linhasDoJogador(banco.db, RODADA, jogadorId, 'PONTOS')
    expect(lista.itens[0]).toMatchObject({ linha: 20, confianca: 95, mediaTemporada: 30 })

    const [operadora] = await banco.db.insert(casas).values({ nome: 'Casa de teste' }).returning()
    await banco.db.insert(oddsSnapshot).values({
      casaId: operadora!.id,
      jogoId: jogo!.id,
      jogadorId,
      atributo: 'PONTOS',
      linha: '20',
      oddOver: '1.750',
      capturadoEm: ANTES,
    })
    await banco.db.update(jogos).set({ status: 'AO_VIVO', quartoAtual: 1 }).where(eq(jogos.id, jogo!.id))
    await banco.db
      .insert(estatisticasQuarto)
      .values({ jogoId: jogo!.id, jogadorId, quarto: 1, pontos: 11, minutos: '8' })
    await banco.db.insert(apitos).values({
      rulesetVersao: `v${ruleset.version}`,
      jogoId: jogo!.id,
      jogadorId,
      atributo: 'PONTOS',
      estrategia: 'FIRE_LIVE',
      nivelJogador: 'MVP',
      nivelApito: 1,
      alvo1q: 11,
      geradoEm: ANTES,
    })
    expect(await materializarFeedFireLive(banco.db, ruleset, jogo!.id, ANTES)).toMatchObject({ itens: 1 })

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ANTES)
    antes = await renderizar('pagina', jogadorId, { atributo: 'PONTOS' })
    vi.setSystemTime(DEPOIS)
    depois = await renderizar('pagina', jogadorId, { atributo: 'PONTOS' })
  }, 120_000)

  afterAll(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await banco.fechar()
  })

  it('mantém o 1º quarto do Fire Live antes e depois da virada', () => {
    expect(texto(antes)).toContain('1º quarto')
    expect(texto(depois)).toContain('1º quarto')
  })

  it('preserva a linha e a nota pré-live — a análise é a da rodada em que o jogo começou', () => {
    for (const html of [antes, depois]) {
      const visivel = texto(html)
      expect(visivel).toContain('20+')
      expect(visivel).toContain('95%')
      expect(visivel).not.toContain('Este apito nasceu ao vivo')
    }
  })

  it('preserva a tabela das linhas e casas do mesmo jogo', () => {
    const tabelaAntes = antes.match(/<table\b[\s\S]*?<\/table>/)?.[0]
    expect(tabelaAntes).toBeDefined()
    expect(texto(tabelaAntes!)).toContain('Casa de teste')
    expect(depois.match(/<table\b[\s\S]*?<\/table>/)?.[0]).toBe(tabelaAntes)
  })
})
