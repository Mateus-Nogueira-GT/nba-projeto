import { gravarConferencia, prepararFotosConferencia } from './conferencia'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { FeedFireLive } from '../../modules/entrega/fire-live/leitura'
import { identidadeDoTime } from '../../design-system/times'

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
  await prepararFotosConferencia(banco.db)
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

  it('o card abre a análise do mesmo atributo e o nome continua levando às estatísticas', async () => {
    const feed = await feedDaTela()
    const escolhido = feed.itens[0]
    expect(escolhido).toBeDefined()
    const html = semScript(await renderizar({ jogo: escolhido!.jogoId }))
    for (const item of feed.itens.filter((candidato) => candidato.jogoId === escolhido!.jogoId)) {
      expect(html).toContain(`href="/apito/${item.jogadorId}?atributo=${item.atributo}"`)
      expect(html).toContain(`href="/estatisticas/jogador/${item.jogadorId}"`)
    }
  }, 60_000)

  it('a barra CALA em todo card: hoje cada item É um apito, e o feed não traz o valor no instante do push', async () => {
    // O TERCEIRO CARD DO ARTBOARD ESCREVE "ainda sem apito" (`FireLive.dc.html`,
    // l. 147): é o alvo dentro do 1º quarto que ainda não virou push. Ele NÃO
    // sai de `lerFeedFireLive`: o feed lista apitos, e `ItemFireLive.apitadoEm`
    // é obrigatório (feed.ts) — todo item tem o instante do push. Por isso a
    // página não passa `apitouEm` ao card e a barra cala (ausente ≠ `null`,
    // barra-alvo.test.ts). Também não escreve "apitou aqui": o feed traz o
    // INSTANTE do push, não o valor do jogador naquele instante — e número que
    // a tela não tem, a tela não inventa (nem com `valorNoQuarto` no lugar).
    //
    // A 2.2 procurou o valor no instante do push e ele NÃO EXISTE: `apitos`
    // grava o alvo (`alvo_1q`) e o instante (`gerado_em`), nunca quanto o
    // jogador tinha quando a marca caiu. Enquanto a materialização não gravar
    // esse número, a barra segue calada — e é este teste que prova que a tela
    // não o substituiu pelo `valorNoQuarto` de agora, que é outra coisa.
    // Os alvos AGUARDANDO da 2.2 são JOGOS, não cards: entram como cabeçalho
    // mudo com a contagem, sem card nenhum (ver a suíte da tela, abaixo).
    const feed = await feedDaTela()
    expect(feed.itens.length).toBeGreaterThan(0)
    for (const item of feed.itens)
      expect(item.apitadoEm, `${item.chave} sem o instante do push`).toBeTruthy()

    const jogoId = feed.itens[0]!.jogoId
    const html = semScript(await renderizar({ jogo: jogoId }))
    // um card por alvo apitado do jogo selecionado — e nenhum deles é o alvo
    // aguardando do artboard.
    expect(cards(html)).toHaveLength(feed.itens.filter((item) => item.jogoId === jogoId).length)
    expect(ocorrencias(html, 'ainda sem apito')).toBe(0)
    expect(ocorrencias(html, 'apitou aqui')).toBe(0)
  }, 60_000)
})

// ===========================================================================
// A TELA POR JOGO (2.2) — placar do 1º Q no cabeçalho, três estados, carimbo
// ===========================================================================

/** Os jogos de hoje como o banco os tem — o sujeito das asserções sai daqui. */
async function jogosDeHoje() {
  const { jogos, times } = await import('../../modules/dominio/db/schema')
  const { eq } = await import('drizzle-orm')
  const partidas = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE))
  const listaTimes = await banco.db.select().from(times)
  const sigla = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  return partidas.map((p) => ({
    ...p,
    casaSigla: sigla.get(p.timeCasaId)!,
    visitanteSigla: sigla.get(p.timeVisitanteId)!,
  }))
}

describe('Fire Live · 04 — por jogo, com os três estados', () => {
  it('mantém um único jogo no painel e deixa a rodada navegável no seletor', async () => {
    const html = semScript(await renderizar())
    expect(html).toContain('aria-label="Escolher jogo do Fire Live"')
    expect(ocorrencias(html, 'aria-current="page"')).toBe(2)
    // Um aria-current pertence ao jogo e o outro à aba fixa Ao Vivo.
    expect(ocorrencias(html, 'class="jogo-placar-quente"')).toBe(1)
    expect(ocorrencias(html, 'class="quadra-ao-vivo"')).toBe(1)
    expect(ocorrencias(html, 'href="/fire-live?jogo=')).toBeGreaterThan(1)
  }, 60_000)

  it('um link de jogo fora do recorte cai para o destaque sem tela vazia', async () => {
    const html = semScript(await renderizar({ jogo: 'jogo-inexistente' }))
    expect(html).toContain('Este jogo não está mais neste recorte')
    expect(ocorrencias(html, 'class="jogo-placar-quente"')).toBe(1)
  }, 60_000)

  it('um cabeçalho QUENTE por jogo no 1º quarto, com o placar que o banco tem', async () => {
    const ruleset = await rulesetAtivo()
    const emPrimeiroQuarto = (await jogosDeHoje()).filter(
      (j) => j.status === 'AO_VIVO' && j.quartoAtual === ruleset.fire_live.quarto,
    )
    expect(
      emPrimeiroQuarto.length,
      'a temporada simulada precisa de jogo no 1º quarto',
    ).toBeGreaterThan(0)

    const html = semScript(await renderizar())
    // Um cabeçalho ao vivo por jogo no 1º quarto — a grade de placares soltos
    // virou a fronteira de seção da tela (spec 04, §4.2).
    expect(ocorrencias(html, 'º Q · AO VIVO')).toBe(emPrimeiroQuarto.length)
    for (const jogo of emPrimeiroQuarto) {
      expect(html).toContain(`${jogo.placarVisitante} · ${jogo.placarCasa}`)
      expect(html).toContain(identidadeDoTime(jogo.casaSigla).nome)
      expect(html).toContain(identidadeDoTime(jogo.visitanteSigla).nome)
      expect(html).toContain(`src="/times/${jogo.casaSigla}.svg"`)
      expect(html).toContain(`src="/times/${jogo.visitanteSigla}.svg"`)
    }
    expect(ocorrencias(html, 'class="quadra-ao-vivo"')).toBe(
      ocorrencias(html, 'class="jogo-placar-quente"'),
    )
  }, 60_000)

  it('os três chips são os três estados, e recortam a tela pela URL', async () => {
    const html = semScript(await renderizar())
    await gravarConferencia('identidade-04-firelive', html)
    expect(html).toContain('No 1º Q agora')
    expect(html).toContain('Aguardando')
    expect(html).toContain('1º Q encerrado')
    expect(html).toContain('estado=agora')
    expect(html).toContain('estado=aguardando')
    expect(html).toContain('estado=encerrado')

    // O recorte é de verdade: com "aguardando" a tela não mostra card nenhum
    // (o alvo que espera ainda não é apito), e continua mostrando os jogos.
    const soAguardando = semScript(await renderizar({ estado: 'aguardando' }))
    expect(cards(soAguardando)).toHaveLength(0)
    expect(soAguardando).toContain('AGUARDANDO O 1º Q')
  }, 60_000)

  it('jogo agendado vira cabeçalho MUDO com a contagem de alvos que esperam', async () => {
    const agendados = (await jogosDeHoje()).filter((j) => j.status === 'AGENDADO')
    expect(agendados.length, 'a rodada simulada precisa de jogo ainda por começar').toBeGreaterThan(
      0,
    )

    const html = semScript(await renderizar({ estado: 'aguardando' }))
    // O cabeçalho mudo: transparente, apagado, com o horário no lugar do placar.
    expect(html).toContain('AGUARDANDO O 1º Q')
    expect(html).toMatch(/opacity:\.?0?\.7/)
    // E a contagem, que é o que ele veio dizer.
    expect(html).toMatch(/\d+ alvos? aguardando o 1º quarto/)
    // A frase do push abre a PRIMEIRA espera e não se repete nas seguintes:
    // a regra da spec é uma vez por tela, não uma vez por seção.
    expect(ocorrencias(html, 'O push avisa no instante do apito')).toBe(1)
  }, 60_000)

  it('o carimbo "atualizado há" está na tela — nunca esconder a defasagem', async () => {
    const html = semScript(await renderizar())
    expect(html).toMatch(/Atualizado há \d+ s/)
  }, 60_000)

  it('o apito do jogo que já saiu do 1º quarto CONTINUA na tela, com FIM 1º Q', async () => {
    const ruleset = await rulesetAtivo()
    const feed = await feedDaTela()
    const item = feed.itens[0]
    expect(item, 'a temporada simulada precisa de apito ao vivo').toBeDefined()

    const { jogos } = await import('../../modules/dominio/db/schema')
    const { eq } = await import('drizzle-orm')
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, item!.jogoId))
    try {
      // O quarto virou entre um ciclo e outro: o snapshot é o mesmo, e é a
      // TELA que precisa perceber — o estado se lê do jogo, não do snapshot.
      await banco.db
        .update(jogos)
        .set({ quartoAtual: ruleset.fire_live.quarto + 1 })
        .where(eq(jogos.id, item!.jogoId))

      const html = semScript(await renderizar({ jogo: item!.jogoId }))
      expect(html).toContain(item!.nome)
      expect(html).toContain('FIM 1º Q')
      expect(html).not.toContain('1º Q · AO VIVO')
    } finally {
      await banco.db
        .update(jogos)
        .set({ quartoAtual: antes!.quartoAtual })
        .where(eq(jogos.id, item!.jogoId))
    }
  }, 60_000)

  it('o placar depois do 1º quarto fica no Q1 oficial, sem mostrar o total da partida', async () => {
    const item = (await feedDaTela()).itens[0]!
    const { jogos, estatisticasTimeJogo } = await import('../../modules/dominio/db/schema')
    const { eq } = await import('drizzle-orm')
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    const boxes = await banco.db
      .select()
      .from(estatisticasTimeJogo)
      .where(eq(estatisticasTimeJogo.jogoId, item.jogoId))
    const casa = boxes.find((b) => b.timeId === antes!.timeCasaId)!
    const visitante = boxes.find((b) => b.timeId === antes!.timeVisitanteId)!
    expect(casa).toBeDefined()
    expect(visitante).toBeDefined()
    try {
      await banco.db
        .update(jogos)
        .set({ quartoAtual: 2, placarCasa: 98, placarVisitante: 102 })
        .where(eq(jogos.id, item.jogoId))
      const html = semScript(await renderizar({ jogo: item.jogoId }))
      await gravarConferencia('identidade-04-firelive-encerrado', html)
      expect(html).toContain(`${visitante.pontosQ1} · ${casa.pontosQ1}`)
      expect(html).not.toContain('102 · 98')
      expect(html).not.toContain('2º Q · AO VIVO')

      // Sem box do Q1, não há número para congelar. O placar total não o substitui.
      await banco.db
        .delete(estatisticasTimeJogo)
        .where(eq(estatisticasTimeJogo.jogoId, item.jogoId))
      const semBox = semScript(await renderizar({ jogo: item.jogoId }))
      expect(semBox).not.toContain('102 · 98')
      expect(semBox).toContain('FIM 1º Q')
    } finally {
      await banco.db
        .update(jogos)
        .set({
          quartoAtual: antes!.quartoAtual,
          placarCasa: antes!.placarCasa,
          placarVisitante: antes!.placarVisitante,
        })
        .where(eq(jogos.id, item.jogoId))
      await banco.db.insert(estatisticasTimeJogo).values(boxes).onConflictDoNothing()
    }
  }, 60_000)

  it('a frase do push aparece UMA vez por tela — nem zero, nem em cada seção', async () => {
    const html = semScript(await renderizar()).toLowerCase()
    expect(ocorrencias(html, 'o apito chega no push')).toBe(1)
  }, 60_000)

  it('o jogo da rodada depois da meia-noite mantém placar, mando e estado ao vivo', async () => {
    const item = (await feedDaTela()).itens[0]!
    const { jogos } = await import('../../modules/dominio/db/schema')
    const { eq } = await import('drizzle-orm')
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    try {
      // 01h30 local do dia seguinte, ainda vinculado à rodada de HOJE.
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: new Date('2026-01-16T04:30:00Z') })
        .where(eq(jogos.id, item.jogoId))
      const html = semScript(await renderizar({ jogo: item.jogoId }))
      expect(html).toContain('1º Q · AO VIVO')
      expect(html).toContain(`${antes!.placarVisitante} · ${antes!.placarCasa}`)
      expect(html).not.toContain('AGUARDANDO O 1º Q')
    } finally {
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: antes!.dataHoraUtc })
        .where(eq(jogos.id, item.jogoId))
    }
  }, 60_000)

  it('apitos ocultos não viram a afirmação de que ninguém cruzou o alvo', async () => {
    const feed = await feedDaTela()
    const jogoId = feed.itens[0]!.jogoId
    const { ocultarJogador, exibirJogador } =
      await import('../../modules/plataforma/jogadores-ocultos')
    const ids = [...new Set(feed.itens.filter((i) => i.jogoId === jogoId).map((i) => i.jogadorId))]
    try {
      for (const id of ids) await ocultarJogador(banco.db, USUARIO_DEMO, id)
      const html = semScript(await renderizar({ jogo: jogoId }))
      expect(cards(html)).toHaveLength(0)
      expect(html).toContain('Apitos deste jogo ocultos')
      expect(html).not.toContain('Ninguém cruzou o alvo neste jogo ainda')
    } finally {
      for (const id of ids) await exibirJogador(banco.db, USUARIO_DEMO, id)
    }
  }, 60_000)

  it('o filtro sem seção tem vazio próprio mesmo antes do primeiro apito', async () => {
    const { feedSnapshot } = await import('../../modules/dominio/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const linhas = await banco.db
      .select()
      .from(feedSnapshot)
      .where(and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'FIRE_LIVE')))
    try {
      for (const linha of linhas) {
        const conteudo = linha.conteudoJson as { itens: unknown[] }
        await banco.db
          .update(feedSnapshot)
          .set({ conteudoJson: { ...conteudo, itens: [] } })
          .where(eq(feedSnapshot.id, linha.id))
      }
      const html = semScript(await renderizar({ estado: 'encerrado' }))
      expect(html).toContain('Nada com esse filtro')
      expect(html).not.toContain('Observando o 1º quarto')
      expect(html).not.toContain('Há apitos hoje')
    } finally {
      for (const linha of linhas) {
        await banco.db
          .update(feedSnapshot)
          .set({ conteudoJson: linha.conteudoJson })
          .where(eq(feedSnapshot.id, linha.id))
      }
    }
  }, 60_000)
})
