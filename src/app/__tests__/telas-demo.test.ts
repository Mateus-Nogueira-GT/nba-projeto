import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { jogadores } from '../../modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { Ruleset } from '../../modules/motor/ruleset/schema'

/**
 * FUMAÇA DAS TELAS NOVAS.
 *
 * O `next build` prova que compilam; não prova que renderizam. Estas duas
 * telas leem estruturas que acabaram de nascer (conferência agrupada por
 * jogador, plano de banca) e um erro de runtime aqui só apareceria com o
 * cliente na frente da tela.
 *
 * Renderiza o componente de servidor de verdade, com o banco de verdade
 * semeado pela demo. Só sessão e direito de acesso são simulados — são a
 * fronteira de autenticação, não o que está sob teste.
 *
 * O SEED É A TEMPORADA SIMULADA, não o dia roteirizado.
 *
 * `semearDemo` continua existindo — é a fixture dos exemplos literais do
 * documento do CJ (Luka fora abrindo OPD para Reaves, LeBron em oscilação,
 * Curry turbo) que outras suítes usam para ficarem legíveis. Mas esta suíte é
 * a fumaça das telas de PRODUÇÃO, e produção semeia com `simularAte`: o que o
 * cliente vê é uma temporada sorteada, com quem joga hoje decidido pelo
 * calendário e os apitos publicados pelo motor antes de o dia ser jogado.
 * Testar as telas contra o roteiro seria testá-las contra um mundo que
 * ninguém mais monta.
 *
 * Consequência para quem editar este arquivo: NENHUMA asserção pode nomear um
 * jogador, um time ou um horário. Quando a tela precisa de um sujeito
 * concreto, ele é LIDO do banco (ou do feed) e a asserção é sobre ele.
 */

// Pelo carregador da ENTREGA, não pelo do motor: a fronteira proíbe `src/app`
// de importar valor do motor, e o teste vive dentro de src/app.
// Instante fixo: 15:00 em Brasília. Um horário fixo é o que permite afirmar
// alguma coisa sobre fuso — com `new Date()` o teste passaria ou falharia
// conforme a hora em que a suíte roda.
const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
/** O ruleset usado para semear e republicar esta suíte — ver comentário no beforeAll. */
let rulesetDaDemo: Ruleset

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@teste.com',
  }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
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
// `renderToStaticMarkup` não monta o App Router: só a tela de partida usa
// `useRouter` (AtualizarAoVivo), e sem este mock ela derruba o teste com
// "invariant expected app router to be mounted". Preserva o resto do módulo
// de verdade (`redirect`, `notFound`) — várias outras telas deste arquivo
// dependem deles.
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  // Cadastro público abre por padrão (spec de planos, §7); a config falha
  // alto sem APP_PUBLIC_URL, e /entrar e /assinar a leem no render.
  process.env.APP_PUBLIC_URL = 'https://app.example.com'
  banco = await bancoDeTeste()
  // Com a porta FAKE: é o que roda no ambiente de demonstração (sem
  // OPENROUTER_API_KEY) e é o que faz a lista nascer com narrativa nos cards e
  // resumo no cabeçalho — sem ela, a tela seria testada num estado que o
  // cliente não vê.
  //
  // 21 DIAS, e não os 49 da spec: é o menor histórico que sustenta ao mesmo
  // tempo as três coisas que estas telas mostram — variedade de nível do apito
  // (1/2/3), a janela de 7 dias da tela de Resultados com green E red, e média
  // amostral suficiente para o Fire Live acender. Com 5 dias a tela de
  // Resultados fica pobre e a variedade de níveis some; com 49 a suíte paga
  // minutos de PGlite por nada.
  // Produção está em `niveis.atributos: [PONTOS]` (Tarefa 7): rebotes e
  // assistências ficam desligados até o CJ mandar % e odds. Esta suíte audita
  // as três abas do card, então religa os três num clone do ruleset de
  // produção só para o seed — nunca no arquivo de produção, e as chamadas
  // avulsas a `rulesetAtivo()` nesta suíte continuam lendo o de produção.
  rulesetDaDemo = structuredClone(await rulesetAtivo())
  rulesetDaDemo.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
  await simularAte(banco.db, rulesetDaDemo, AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  // O usuário da sessão simulada existe de verdade: telas passaram a consultar
  // preferências por usuarioId (jogadores_ocultos), e uuid inválido quebraria.
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  // As telas leem o relógio para saber que dia é hoje. Sem congelá-lo, elas
  // pediriam a rodada do dia real e encontrariam um banco semeado para outro.
  // Só `Date` é falsificado: falsificar os timers travaria o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

describe('Lista Secreta', () => {
  // Front v2 (Tarefa 3): os casos que liam a MARCAÇÃO da home antiga (cabeçalho
  // do mockup, barrinhas, resumo do dia no topo, detalhe redesenhado, hero
  // frio) saíram com ela; as invariantes foram para
  // `src/features/{lista,apito}/__tests__/fumaca.test.tsx`. Ficam aqui os que
  // valem para qualquer marcação.
  // O "card por jogador E atributo" virou UM card por jogador com abas de
  // atributo na identidade 04 — quem prova isso é `telas-04-lista.test.ts`.
  // Aqui fica o que continua valendo: o recorte por atributo existe e o link
  // do detalhe carrega o atributo.
  it('o recorte por atributo devolve só aquele atributo', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ atributo: 'REBOTES' }) }),
    )

    expect(html).not.toContain('Nada com esse filtro')
    expect(html).toContain('REB')
    expect(html).not.toContain(' · PTS')
  }, 60_000)

  it('trocar a quantidade PRESERVA o recorte de atributo (regressão)', async () => {
    // O usuário filtrou "Rebotes" e depois pediu "2 jogadores". Os chips de
    // quantidade montavam `/?quantidade=N` seco e devolviam a lista inteira,
    // sem aviso — o filtro que ele acabou de escolher sumia no clique.
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ atributo: 'REBOTES' }) }),
    )

    const quantidades = [...html.matchAll(/href="(\/\?[^"]*quantidade=\d[^"]*)"/g)].map(
      (m) => m[1]!,
    )
    expect(quantidades.length).toBeGreaterThan(0)
    for (const href of quantidades) {
      expect(href).toContain('atributo=REBOTES')
    }

    // E "Lista inteira" (quantidade 0, que some da URL) idem.
    expect(html).toMatch(/href="\/\?atributo=REBOTES"/)
  }, 60_000)

})

describe('detalhe do apito', () => {
  it('mostra as linhas do atributo pedido, com a faixa das casas', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const rebote = feed!.conteudo.itens.find((i) => i.atributo === 'REBOTES')!

    const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ jogadorId: rebote.jogadorId }),
        searchParams: Promise.resolve({ atributo: 'REBOTES' }),
      }),
    )

    // O detalhe é sobre o atributo PEDIDO — o rótulo e a sigla vêm do v2
    // (`ui/marcas`), o atributo vem do item do feed. O título da seção das
    // linhas diz qual é ("Linhas de rebotes"), o texto o repete (rótulo ou
    // sigla, em qualquer caixa), e a seção de PONTOS não aparece. O literal
    // "REB" solto era vocabulário do card antigo (Tarefa 12).
    const { ATRIBUTO_CURTO, ROTULO_ATRIBUTO } = await import('@/ui/marcas')
    const rotulo = ROTULO_ATRIBUTO[rebote.atributo]
    expect(rotulo).toBe('Rebotes')
    const visivel = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(visivel).toContain(`Linhas de ${rotulo.toLowerCase()}`)
    expect(visivel).toMatch(new RegExp(`\\b(${ATRIBUTO_CURTO[rebote.atributo]}|${rotulo})\\b`, 'i'))
    expect(visivel).not.toContain(`Linhas de ${ROTULO_ATRIBUTO.PONTOS.toLowerCase()}`)
    // O seed cotou três casas: a tela não pode cair na tabela de referência.
    expect(html).toContain('Faixa entre 3 casas')
    // P12: o percentual nunca é chamado de probabilidade sem negação na frente —
    // e a negação é a frase homologada, a ÚNICA forma que o teste da marca
    // aceita (`marca-e-vocabulario` › "não é probabilidade de acerto").
    expect(html).toContain('não é probabilidade de acerto')
  }, 60_000)

})

// Front v2 (Tarefa 4): os casos do Fire Live (refresh só com jogo no 1º
// quarto; cabeçalho, placar, selo e barra) migraram para
// `src/features/ao-vivo/__tests__/fumaca.test.tsx`.

// Front v2 (Tarefa 6): o atalho `/resultados` (a última rodada com
// conferência) virou route handler e migrou para
// `src/features/resultados/__tests__/fumaca.test.tsx`.

describe('a rodada segue o fuso do cliente', () => {
  it('às 21h30 de Brasília a lista ainda é a de hoje', async () => {
    // 00:30Z é 21:30 do dia ANTERIOR em Brasília. O cálculo antigo, por UTC,
    // já pedia a lista de amanhã — e o assinante via a tela vazia justamente
    // na hora em que os jogos estavam começando.
    const vinte_e_uma_e_meia = new Date(`${somarDias(HOJE, 1)}T00:30:00.000Z`)
    vi.setSystemTime(vinte_e_uma_e_meia)

    try {
      expect(dataDeReferencia(new Date(), FUSO)).toBe(HOJE)
      expect(new Date().toISOString().slice(0, 10)).not.toBe(HOJE)

      const { default: Pagina } = await import('../(app)/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

      // O estado "sem lista" da 04 é "Próxima lista às HH:MM"; publicada, o
      // o CONTADOR do cabeçalho conta a rodada (identidade 05): o número num
      // <strong> e o que ele conta ao lado.
      expect(html).not.toContain('Próxima lista às')
      expect(html).toMatch(/entradas em \d+ jogos/)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  // Front v2 (Tarefa 5): "os horários dos jogos saem no fuso" migrou para
  // `src/features/estatisticas/__tests__/fumaca.test.tsx` (índice).
})

describe('Estatísticas — identidade 03 (conferência em lote)', () => {
  it('o box score do time tem NÚMEROS, não uma parede de travessões', async () => {
    // A demo semeava box score de JOGADOR e nunca o do TIME. A tela de time
    // lê `estatisticas_time_jogo`, então cada partida encerrada aparecia com
    // quartos, REB, AST, TO, FG% e 3P% todos em "—". Para o cliente é a tela
    // mais quebrada do app; para o código, tudo funcionava — só faltava dado.
    const { times, jogos } = await import('../../modules/dominio/db/schema')
    const { eq: igual } = await import('drizzle-orm')

    // Um time com jogo ENCERRADO — é sobre esses que a tela promete números.
    const [encerrado] = await banco.db
      .select()
      .from(jogos)
      .where(igual(jogos.status, 'ENCERRADO'))
      .limit(1)
    const [time] = await banco.db
      .select()
      .from(times)
      .where(igual(times.id, encerrado!.timeCasaId))
      .limit(1)

    const { telaDoTime } = await import('../../modules/entrega/estatisticas/time')
    const { temporadaDe, calendarioDoRuleset } = await import('../../modules/dominio/temporada')
    const ruleset = await rulesetAtivo()
    const tela = await telaDoTime(banco.db, time!.id, {
      temporada: temporadaDe(AGORA, calendarioDoRuleset(ruleset)),
    })

    // Jogo AO VIVO tem placar parcial e NÃO tem box score fechado — a
    // asserção é sobre os encerrados, que a tela promete completos.
    const idsEncerrados = new Set(
      (await banco.db.select().from(jogos).where(igual(jogos.status, 'ENCERRADO'))).map(
        (j) => j.id,
      ),
    )
    const encerrados = tela!.jogosDoTime.filter((j) => idsEncerrados.has(j.jogoId))
    expect(encerrados.length).toBeGreaterThan(0)
    for (const jogo of encerrados) {
      expect(jogo.nosso).not.toBeNull()
      expect(jogo.deles).not.toBeNull()
      // Os quartos FECHAM com o total: um box score que não soma é pior que
      // um ausente, porque parece dado.
      const q = jogo.nosso!
      expect(q.q1 + q.q2 + q.q3 + q.q4 + q.prorrogacao).toBe(q.total)
      expect(q.total).toBeGreaterThan(0)
      expect(jogo.rebotesTotal).not.toBeNull()
      expect(jogo.assistencias).not.toBeNull()
      expect(jogo.fgPercentual).not.toBeNull()
    }

    // E o jogo AO VIVO não recebe veredito: a coluna "Res" derivava V/D de
    // qualquer placar não-nulo, então uma partida no 1º quarto aparecia como
    // "V 51–32" — a tela declarava vencedor de um jogo em andamento.
    const aoVivo = tela!.jogosDoTime.filter((j) => !idsEncerrados.has(j.jogoId))
    for (const jogo of aoVivo) {
      expect(jogo.resultado).toBeNull()
    }
  }, 60_000)

  // Front v2 (Tarefa 5): "as três telas vestem a identidade" (gradiente e
  // Bebas do design-system antigo) saiu com as telas antigas; o 2P% do perfil
  // e os quartos + total do box score do time migraram para a fumaça de
  // `src/features/estatisticas/__tests__/fumaca.test.tsx`.
})

// Front v2 (Tarefa 6): os casos da Gestão (cada linha leva ao detalhe do
// apito, o aviso de modelo de demonstração, banca inválida sem NaN) migraram
// para `src/features/gestao/__tests__/fumaca.test.tsx`.

describe('a aba teórica', () => {
  it('mostra a régua de 5 faixas turquesa com rótulos, não a escala antiga', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    // Os rótulos vêm do RULESET, não de uma lista aqui: a régua é exibição e o
    // texto dela muda por YAML (em 12/09 o grau 5 deixou de ser "CONFIANÇA
    // MÁXIMA"). O que o teste trava é que as CINCO faixas aparecem, com o
    // texto que o ruleset ativo declara.
    const { rulesetAtivo } = await import('../../modules/entrega/ruleset-ativo')
    const faixas = (await rulesetAtivo()).confianca_exibicao.faixas
    expect(faixas).toHaveLength(5)
    for (const f of faixas) expect(html, `faixa grau ${f.grau}`).toContain(f.rotulo)
  }, 60_000)

  it('avisa que a régua é de demonstração quando o ruleset diz isso', async () => {
    const { rulesetAtivo } = await import('../../modules/entrega/ruleset-ativo')
    const ruleset = await rulesetAtivo()
    // A homologação de 18/08/2026 marcou a régua como demonstração — se isso
    // mudar no ruleset, o teste falha e lembra de rever o texto do aviso.
    expect(ruleset.confianca_exibicao.origem).toBe('demonstracao')

    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    // Âncora no texto exclusivo do aviso da RÉGUA — não em "demonstração"
    // sozinho, que também aparece na seção (não relacionada) de rebotes e
    // assistências. Se só o aviso da régua for apagado, esta asserção tem
    // que cair.
    expect(html).toContain('Régua de demonstração')
    expect(html).toContain('ainda não')
    expect(html).toContain('vieram da curadoria NIP')
  }, 60_000)

  it('não fala mais em círculo para o indicador do apito — o Avatar é um quadrado arredondado', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html).not.toContain('círculo')
  }, 60_000)
})

// Front v2 (Tarefa 8): "telas restantes — identidade 03" acabou. A última tela
// que vestia o gradiente do design-system antigo era /entrar; ela agora é a do
// v2 (`features/publico/LayoutAcesso`, tokens de `src/ui/tokens.css`), e a
// fumaça dela mora em `features/publico/__tests__/fumaca.test.tsx`.

describe('regras transversais da identidade', () => {
  it('nenhuma tela contém meio ponto, ALTÍSSIMO VALOR, três pontos, "Carlos" ou a lista do CJ', async () => {
    const comSearchParams = ['../(app)/page', '../(app)/fire-live/page', '../(app)/gestao/page']
    for (const rota of comSearchParams) {
      const { default: Pagina } = await import(rota)
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('3 PONTOS')
      expect(html).not.toContain('Carlos')
      expect(html).not.toContain('lista do CJ')
      expect(html).not.toContain('LISTA DO CJ')
    }

    // A rodada de /resultados vem da ROTA, não de searchParams.
    const { default: Resultados } = await import('../(app)/resultados/[data]/page')
    const htmlResultados = renderToStaticMarkup(
      await Resultados({ params: Promise.resolve({ data: HOJE }) }),
    )
    expect(htmlResultados).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
    expect(htmlResultados).not.toContain('ALTÍSSIMO VALOR')
    expect(htmlResultados).not.toContain('3 PONTOS')
    expect(htmlResultados).not.toContain('Carlos')
    expect(htmlResultados).not.toContain('lista do CJ')
    expect(htmlResultados).not.toContain('LISTA DO CJ')
  }, 60_000)

  // A rede acima cobre só 4 rotas — e nenhuma delas é onde "NA LISTA DO CJ" e
  // o vazio da hierarquia de fato moravam. É exatamente a família de
  // estatísticas (a aba que lê as duas visões de time) e as telas de texto
  // fixo (como-funciona) que precisam da mesma rede. `/assinar` e
  // `/preferencias` ficam de fora — ver a nota abaixo do teste.
  it('nem em estatísticas, como-funciona, entrar, no detalhe do apito, na conta ou no cadastro aparece "Carlos" ou a lista do CJ', async () => {
    const { jogadores: tabelaJogadores, times: tabelaTimes, jogos: tabelaJogos } = await import(
      '../../modules/dominio/db/schema'
    )
    const [umJogador] = await banco.db.select().from(tabelaJogadores).limit(1)
    const [umTime] = await banco.db.select().from(tabelaTimes).limit(1)
    const [umJogo] = await banco.db.select().from(tabelaJogos).limit(1)

    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const apitado = feed!.conteudo.itens[0]
    expect(apitado, 'lista de hoje sem nenhum apito para render o detalhe').toBeDefined()

    const { default: IndiceEstatisticas } = await import('../(app)/estatisticas/page')
    const { default: PaginaJogador } = await import('../(app)/estatisticas/jogador/[id]/page')
    const { default: PaginaTime } = await import('../(app)/estatisticas/time/[id]/page')
    const { default: PaginaJogo } = await import('../(app)/estatisticas/jogo/[id]/page')
    const { default: ComoFunciona } = await import('../(app)/como-funciona/page')
    const { default: Entrar } = await import('../(publico)/entrar/page')
    const { default: Apito } = await import('../(app)/apito/[jogadorId]/page')
    const { default: Conta } = await import('../(app)/conta/page')
    const { default: Cadastrar } = await import('../(publico)/cadastrar/page')

    const htmls = [
      renderToStaticMarkup(await IndiceEstatisticas({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(
        await PaginaJogador({ params: Promise.resolve({ id: umJogador!.id }) }),
      ),
      renderToStaticMarkup(
        await PaginaTime({
          params: Promise.resolve({ id: umTime!.id }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(
        await PaginaJogo({
          params: Promise.resolve({ id: umJogo!.id }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(await ComoFunciona()),
      renderToStaticMarkup(await Entrar({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(
        await Apito({
          params: Promise.resolve({ jogadorId: apitado!.jogadorId }),
          searchParams: Promise.resolve({ atributo: apitado!.atributo }),
        }),
      ),
      renderToStaticMarkup(await Conta({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(await Cadastrar()),
    ]

    for (const html of htmls) {
      expect(html).not.toContain('Carlos')
      expect(html).not.toContain('lista do CJ')
      expect(html).not.toContain('LISTA DO CJ')
    }
  }, 60_000)
})

// Front v2 (Tarefa 4): "Fire Live — identidade 03" (jogador oculto sai da
// linha e entra na lista de reativar; filtro que zera a tela; todos ocultos)
// migrou para `src/features/ao-vivo/__tests__/fumaca.test.tsx`. O universo
// quente do card era cor do design-system antigo e saiu com ele.

// ===========================================================================
// A FOTO ATRAVESSA AS DUAS TELAS (I3)
// ===========================================================================

// Front v2 (Tarefa 5): "tela de partida" (encerrado com box e nota, AO VIVO
// sem vencedor e com o parcial, pré-jogo e H2H vazio, nada de "nível", box
// score com porta para o jogador) e a navegação por data do índice (setas,
// data inválida, título da data navegada, vazio que não mente "hoje")
// migraram para `src/features/estatisticas/__tests__/fumaca.test.tsx`.

describe('a foto do jogador', () => {
  const FOTO = 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png'

  it('aparece no card da lista E no hero do detalhe — não some no caminho', async () => {
    // O detalhe passava `fotoUrl={null}` literal, embora o item do feed já
    // trouxesse a URL. O assinante via a headshot no card, tocava em "linhas e
    // confiança →" e encontrava o monograma "LJ" — o mesmo jogador, dois
    // rostos. /gestao, /resultados e /estatisticas já passavam a foto.
    const { lerFeed, publicarListaSecreta } = await import('../../modules/entrega/lista-secreta')
    // O mesmo ruleset que semeou o banco (três atributos): republicar com o
    // de produção (só PONTOS) apagaria da lista o item se o sorteio tivesse
    // escolhido um apitado de REBOTES/ASSISTENCIAS.
    const ruleset = rulesetDaDemo

    // O apitado que ganha a foto é LIDO da lista de hoje — o roteiro (que
    // punha o LeBron ali de propósito) não decide mais quem apita. Só ele
    // recebe `fotoUrl`, e é por isso que `<img>` na tela prova o caminho.
    const escolhido = (await lerFeed(banco.db, HOJE))!.conteudo.itens[0]
    expect(escolhido, 'lista de hoje vazia').toBeDefined()

    await banco.db
      .update(jogadores)
      .set({ fotoUrl: FOTO })
      .where(eq(jogadores.id, escolhido!.jogadorId))
    // Republicar basta: o hash cobre o item inteiro, então a foto nova conta
    // como mudança. Antes era preciso apagar o snapshot à mão aqui.
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
    })

    const comFoto = (await lerFeed(banco.db, HOJE))!.conteudo.itens.find(
      (i) => i.jogadorId === escolhido!.jogadorId,
    )!
    expect(comFoto.fotoUrl).toBe(FOTO)

    const { default: Lista } = await import('../(app)/page')
    const htmlLista = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({}) }))
    expect(htmlLista).toContain('<img')

    const { default: Detalhe } = await import('../(app)/apito/[jogadorId]/page')
    const htmlDetalhe = renderToStaticMarkup(
      await Detalhe({
        params: Promise.resolve({ jogadorId: comFoto.jogadorId }),
        searchParams: Promise.resolve({ atributo: comFoto.atributo }),
      }),
    )
    expect(htmlDetalhe).toContain('<img')
    // O monograma DELE — "LJ" era o do LeBron. Pela mesma função que a
    // FotoJogador do v2 usa, para o teste não se afastar do componente se a
    // regra mudar.
    const { iniciais } = await import('@/ui/midia')
    expect(htmlDetalhe).not.toContain(`>${iniciais(comFoto.nome)}<`)
  }, 60_000)
})
