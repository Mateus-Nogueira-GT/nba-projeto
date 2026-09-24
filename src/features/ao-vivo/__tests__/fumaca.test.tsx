import { and, eq, inArray } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  estatisticasTimeJogo,
  feedSnapshot,
  jogadoresOcultos,
  jogos,
  times,
  usuarios,
} from '@/modules/dominio/db/schema'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import type { FeedFireLive } from '@/modules/entrega/fire-live/leitura'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * FUMAÇA DO AO VIVO (FIRE LIVE) DO V2 — ligada ao NOSSO back.
 *
 * O Fire Live é só o 1º quarto e é o produto pago mais pesado: o grátis nunca
 * recebe item do feed, e o refresh ao vivo precisa continuar barato (só com
 * jogo no 1º quarto, só com a aba visível, com jitter — a parte de cliente
 * está em `atualizar-ao-vivo.test.ts`).
 *
 * Arnês da fumaça da Lista: a página de verdade (`(app)/fire-live/page.tsx` →
 * `features/ao-vivo/carregar.ts`) sobre um PGlite semeado pela temporada
 * simulada — 21 dias de histórico garantem jogo no 1º quarto em 15/01 — com
 * sessão e acesso simulados e o nível MUTÁVEL por `nivelDoTeste`.
 *
 * Regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador, time ou
 * horário — o sujeito é lido do banco.
 *
 * Herda as invariantes de `telas-04-firelive.test.ts` (aposentado junto com a
 * tela antiga), dos casos de Fire Live de `telas-demo.test.ts` e
 * `telas-05-gratis.test.ts` e de `planos-fire-live.test.ts`: cada caso diz de
 * onde veio.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
/** Dentro do hiato: o calendário já virou para 2026-27, a bola ainda não subiu. */
const HIATO = new Date('2026-10-02T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'

/** O sufixo curto do atributo, como a linha escreve a régua. */
const CURTO: Record<string, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'
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
// `renderToStaticMarkup` não monta o App Router: `AtualizarAoVivo` e os
// componentes de cliente recebem ganchos neutros. `redirect` é o de verdade.
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/fire-live',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()`. Só `Date` — timers travariam o PGlite.
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
  const { default: Pagina } = await import('@/app/(app)/fire-live/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

/** O mesmo feed que a página paga lê — o sujeito das asserções sai daqui. */
async function feedDaTela(): Promise<FeedFireLive> {
  const { lerFeedFireLive } = await import('@/modules/entrega/fire-live/leitura')
  const ruleset = await rulesetAtivo()
  return lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
}

/** Os jogos de hoje como o banco os tem, com as siglas. */
async function jogosDeHoje() {
  const partidas = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE))
  const sigla = new Map((await banco.db.select().from(times)).map((t) => [t.id, t.sigla] as const))
  return partidas.map((p) => ({
    ...p,
    casaSigla: sigla.get(p.timeCasaId)!,
    visitanteSigla: sigla.get(p.timeVisitanteId)!,
  }))
}

/** O HTML sem o replay de formulário que o React injeta: script não é tela. */
const semScript = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '')

const semEntidades = (t: string) =>
  t
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** O texto que o assinante lê, sem marcação e sem entidade. */
const texto = (html: string) =>
  semEntidades(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )

const ocorrencias = (html: string, trecho: string) => html.split(trecho).length - 1

/** Uma linha por apito: `data-live-key` só existe na linha do painel. */
const linhas = (html: string) => ocorrencias(html, 'data-live-key=')

/**
 * O PAINEL do jogo selecionado — placar e linhas —, sem o seletor da rodada,
 * que escreve o estado de TODOS os jogos.
 */
function painel(html: string): string {
  const inicio = html.indexOf('data-live-score')
  if (inicio < 0) return ''
  const fim = html.indexOf('</section>', inicio)
  return html.slice(inicio, fim < 0 ? undefined : fim)
}

describe('Ao Vivo do v2 — portão de nível', () => {
  it('MVP com jogo no 1º quarto vê o alvo, e a linha abre a análise do mesmo atributo', async () => {
    nivelDoTeste = 'MVP'
    const feed = await feedDaTela()
    const item = feed.itens[0]
    expect(item, 'a temporada simulada precisa de apito ao vivo em 15/01').toBeDefined()
    const html = semScript(await renderizar({ jogo: item!.jogoId }))
    expect(texto(html)).toContain(item!.nome)
    expect(html).toContain(`href="/apito/${item!.jogadorId}?atributo=${item!.atributo}"`)
    // (planos-fire-live) o convite é do grátis, não do assinante.
    expect(html).not.toContain('começa no')
  }, 60_000)

  it('(planos-fire-live) GRÁTIS vê os jogos e o convite — nunca um apito, o modo fire ou o refresh', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const feed = await feedDaTela()
      expect(feed.itens.length).toBeGreaterThan(0)
      const html = await renderizar()
      expect(html).toContain('começa no')
      expect(html).toMatch(/href="\/assinar\?nivel=MVP&(amp;)?voltar=%2Ffire-live"/)
      // Varre TODO o feed que o pago leria, não só o primeiro item.
      for (const i of feed.itens) {
        expect(html).not.toContain(i.jogadorId)
        expect(texto(html)).not.toContain(i.nome)
      }
      expect(html).not.toContain('href="/apito/')
      expect(html).not.toContain('data-live-key')
      expect(html).not.toMatch(/modo fire/i)
      expect(html).not.toMatch(/confian[çc]a/i)
      expect(html.toLowerCase()).not.toContain('probabilidade')
      // O refresh ao vivo é do assinante: o grátis não paga o `router.refresh`
      // de 30 s numa página `force-dynamic` (a tela antiga também não montava).
      expect(html).not.toContain('data-atualiza-ao-vivo')
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('GRÁTIS: o dado que a tela recebe não tem campo para item do Fire Live', async () => {
    // Trava a FORMA, e não o HTML: um item que entrasse no objeto do grátis
    // chegaria ao componente mesmo que a tela não o desenhasse hoje.
    nivelDoTeste = 'GRATIS'
    try {
      const { carregarAoVivo, lerRecorte } = await import('@/features/ao-vivo/carregar')
      const dados = await carregarAoVivo(lerRecorte({}))
      expect(dados.tipo).toBe('gratis')
      expect(Object.keys(dados).sort()).toEqual(['agora', 'fuso', 'jogos', 'tipo'])
      if (dados.tipo !== 'gratis') throw new Error('inalcançável')
      // Cada jogo é o resumo público do calendário (placar e quarto), sem apito.
      const feed = await feedDaTela()
      const serializado = JSON.stringify(dados.jogos)
      for (const i of feed.itens) expect(serializado).not.toContain(i.jogadorId)
      for (const j of dados.jogos) expect(Object.keys(j)).not.toContain('itens')
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('(telas-05-gratis) a silhueta do grátis é forma pura: igual em todo jogo, sem dado', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar()
      const silhuetas = [
        ...html.matchAll(/<div class="[^"]*silhueta[^"]*">[\s\S]*?<\/svg><\/span><\/div>/g),
      ].map((m) => m[0])
      expect(silhuetas.length).toBeGreaterThan(1)
      expect(new Set(silhuetas).size).toBe(1)
      // Nenhum texto dentro dela, nem o universo do modo fire.
      expect(texto(silhuetas[0]!)).toBe('')
      expect(silhuetas[0]).not.toMatch(/fogo|fire|quente/i)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('banco sem semente: a tela diz que não há jogo, sem lançar e sem refresh', async () => {
    const vazio = await bancoDeTeste()
    await vazio.db
      .insert(usuarios)
      .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
      .onConflictDoNothing()
    dbAtual = () => vazio.db
    try {
      const html = await renderizar()
      // Banco vazio não é hiato: sem dado nenhum não se afirma que a
      // temporada não começou.
      expect(html).toContain('Sem jogos hoje')
      expect(html).not.toContain('A temporada ainda não começou')
      expect(html).not.toContain('data-atualiza-ao-vivo')
    } finally {
      dbAtual = () => banco.db
      await vazio.fechar()
    }
  }, 60_000)
})

describe('Ao Vivo do v2 — hiato entre temporadas', () => {
  it('(telas-06) no hiato a tela explica que a temporada não começou, sem inventar data', async () => {
    vi.setSystemTime(HIATO)
    try {
      const visivel = texto(await renderizar())
      expect(visivel).toContain('A temporada ainda não começou')
      expect(visivel).toContain('entre temporadas')
      expect(visivel).not.toContain('A NBA não tem partidas hoje')
      expect(visivel).not.toMatch(/volta em \d/)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('no hiato, com o próximo jogo já agendado no banco, a tela diz quando a NBA volta', async () => {
    const [a, b] = await banco.db.select().from(times).limit(2)
    const [novo] = await banco.db
      .insert(jogos)
      .values({
        timeCasaId: a!.id,
        timeVisitanteId: b!.id,
        dataHoraUtc: new Date('2026-11-03T23:00:00Z'),
        dataReferencia: '2026-11-03',
        status: 'AGENDADO' as const,
      })
      .returning()
    vi.setSystemTime(HIATO)
    try {
      const html = await renderizar()
      expect(html).toContain('A temporada ainda não começou')
      expect(texto(html)).toContain('A NBA volta em 2026-11-03')
      expect(html).not.toContain('data-atualiza-ao-vivo')
    } finally {
      vi.setSystemTime(AGORA)
      await banco.db.delete(jogos).where(eq(jogos.id, novo!.id))
    }
  }, 60_000)
})

describe('Ao Vivo do v2 — refresh barato (I5)', () => {
  it('(telas-demo) o refresh ao vivo monta com jogo no 1º quarto — e só então', async () => {
    const comJogo = await renderizar()
    expect(comJogo).toContain('data-atualiza-ao-vivo="30000"')

    const vivos = await banco.db.select().from(jogos).where(eq(jogos.status, 'AO_VIVO'))
    expect(vivos.length).toBeGreaterThan(0)
    try {
      for (const j of vivos) {
        await banco.db
          .update(jogos)
          .set({ status: 'AGENDADO', quartoAtual: null })
          .where(eq(jogos.id, j.id))
      }
      expect(await renderizar()).not.toContain('data-atualiza-ao-vivo')
    } finally {
      for (const j of vivos) {
        await banco.db
          .update(jogos)
          .set({ status: j.status, quartoAtual: j.quartoAtual })
          .where(eq(jogos.id, j.id))
      }
    }
  }, 60_000)

  it('a tela usa o NOSSO AtualizarAoVivo (visibilidade + jitter), não um refresh próprio', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/features/ao-vivo/AtualizarAoVivo.tsx', 'utf8')
    expect(fonte).toContain("document.visibilityState === 'visible'")
    expect(fonte).toContain('proximoIntervalo(intervaloMs)')
    expect(fonte).not.toContain('setInterval(')
    const tela = readFileSync('src/features/ao-vivo/TelaAoVivo.tsx', 'utf8')
    expect(tela).toContain("from './AtualizarAoVivo'")
    expect(tela).not.toMatch(/setInterval|router\.refresh/)
  })
})

describe('Ao Vivo do v2 — regras de escrita da tela (telas-04-firelive)', () => {
  it('nunca "probabilidade" nem "provável", alvo inteiro, nada de meio ponto nem reticências', async () => {
    const feed = await feedDaTela()
    const sigla = feed.itens[0]?.timeSigla
    expect(sigla).toBeDefined()
    const telas = await Promise.all([
      renderizar(),
      renderizar({ time: sigla }),
      renderizar({ time: 'ZZZ' }),
    ])
    for (const bruto of telas) {
      const html = semScript(bruto)
      expect(html.toLowerCase()).not.toContain('probabilidade')
      expect(html.toLowerCase()).not.toContain('provável')
      expect(html.toLowerCase()).not.toMatch(/nível da partida|nota do jogo/)
      expect(texto(html)).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST)\s+\d+,\d/)
      expect(texto(html)).not.toMatch(/\/ \d+,\d/)
      expect(html.toLowerCase()).not.toContain('meio ponto')
      // Odd nunca solta: se um dia a tela escrever odd, é faixa ou média.
      for (const achado of texto(html).matchAll(/ODD ([^·]*)/g)) {
        expect(achado[1]!.trim()).toMatch(/^(MÉDIA \d,\d{2}|\d,\d{2}–\d,\d{2})/)
      }
      // O Fire Live não tem nota de confiança: nenhum "%" nem decimal solto.
      expect(html).not.toMatch(/>\d{1,3}%</)
      expect(html).not.toMatch(/>\d+,\d+</)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('…')
      expect(html).not.toMatch(/\.\.\./)
    }
  }, 60_000)

  it('a régua escreve o ALVO do 1º quarto do item, inteiro e com a unidade — alvo zero nunca', async () => {
    const item = (await feedDaTela()).itens.find((i) => i.alvo1Q !== null && i.alvo1Q > 0)
    expect(item, 'a temporada simulada precisa de apito com alvo do 1º Q').toBeDefined()
    const visivel = texto(await renderizar({ jogo: item!.jogoId }))
    expect(visivel).toContain(`/ ${item!.alvo1Q} ${CURTO[item!.atributo]}`)
    expect(visivel).not.toMatch(/\/ 0 (PTS|REB|AST)/)
    expect(visivel).not.toMatch(/faltam? 0 /)
  }, 60_000)

  it('cada linha abre a análise do mesmo atributo e o nome leva às estatísticas', async () => {
    const feed = await feedDaTela()
    const escolhido = feed.itens[0]!
    const html = semScript(await renderizar({ jogo: escolhido.jogoId }))
    for (const item of feed.itens.filter((c) => c.jogoId === escolhido.jogoId)) {
      expect(html).toContain(`href="/apito/${item.jogadorId}?atributo=${item.atributo}"`)
      expect(html).toContain(`href="/estatisticas/jogador/${item.jogadorId}"`)
    }
  }, 60_000)

  it('uma linha por apito do jogo, e a barra não inventa o valor no instante do push', async () => {
    const feed = await feedDaTela()
    for (const item of feed.itens)
      expect(item.apitadoEm, `${item.chave} sem o instante do push`).toBeTruthy()
    const jogoId = feed.itens[0]!.jogoId
    const html = semScript(await renderizar({ jogo: jogoId }))
    expect(linhas(html)).toBe(feed.itens.filter((i) => i.jogoId === jogoId).length)
    expect(ocorrencias(html, 'ainda sem apito')).toBe(0)
    expect(ocorrencias(html, 'apitou aqui')).toBe(0)
  }, 60_000)

  it('a frase do push aparece UMA vez por tela', async () => {
    const html = semScript(await renderizar()).toLowerCase()
    expect(ocorrencias(html, 'o apito chega no push')).toBe(1)
  }, 60_000)

  it('o carimbo "Atualizado" está na tela — nunca esconder a defasagem', async () => {
    expect(texto(await renderizar())).toMatch(/Atualizado (agora|há \d+ (min|h|d))\./)
  }, 60_000)
})

describe('Ao Vivo do v2 — por jogo, com os três estados (telas-04-firelive)', () => {
  it('um único jogo no painel e a rodada navegável no seletor', async () => {
    const html = semScript(await renderizar())
    expect(html).toContain('aria-label="Escolher jogo"')
    expect(ocorrencias(html, 'aria-current="page"')).toBe(1)
    expect(ocorrencias(html, 'data-live-score')).toBe(1)
    expect(ocorrencias(html, 'href="/fire-live?jogo=')).toBeGreaterThan(1)
  }, 60_000)

  it('um link de jogo fora do recorte cai para o destaque, sem tela vazia', async () => {
    const html = semScript(await renderizar({ jogo: 'jogo-inexistente' }))
    expect(html).toContain('Este jogo não está mais neste recorte')
    expect(ocorrencias(html, 'data-live-score')).toBe(1)
  }, 60_000)

  it('(telas-demo) cada jogo no 1º quarto: selo ao vivo, placar do banco e a barra rumo ao alvo', async () => {
    const ruleset = await rulesetAtivo()
    const emPrimeiroQuarto = (await jogosDeHoje()).filter(
      (j) => j.status === 'AO_VIVO' && j.quartoAtual === ruleset.fire_live.quarto,
    )
    expect(
      emPrimeiroQuarto.length,
      'a temporada simulada precisa de jogo no 1º quarto',
    ).toBeGreaterThan(0)
    const geral = semScript(await renderizar())
    expect(geral).toContain('Fire Live')
    expect(geral).toContain('Acontecendo')
    for (const jogo of emPrimeiroQuarto) {
      expect(geral).toContain(`href="/fire-live?jogo=${jogo.id}"`)
      const doJogo = painel(semScript(await renderizar({ jogo: jogo.id })))
      const visivel = texto(doJogo)
      expect(visivel).toContain('1º Q ao vivo')
      expect(visivel).toContain(`${jogo.placarVisitante} – ${jogo.placarCasa}`)
      expect(visivel).toContain(jogo.casaSigla)
      expect(visivel).toContain(jogo.visitanteSigla)
    }
    const comApito = (await feedDaTela()).itens.find((i) => i.alvo1Q !== null && i.alvo1Q > 0)!
    const visivel = texto(await renderizar({ jogo: comApito.jogoId }))
    expect(visivel).toMatch(/Alvo batido|faltam? \d/)
    expect(await renderizar({ jogo: comApito.jogoId })).toContain('role="progressbar"')
  }, 60_000)

  it('os três chips são os três estados e recortam a tela pela URL', async () => {
    const html = semScript(await renderizar())
    expect(html).toContain('No 1º Q agora')
    expect(html).toContain('Aguardando')
    expect(html).toContain('1º Q encerrado')
    expect(html).toContain('estado=agora')
    expect(html).toContain('estado=aguardando')
    expect(html).toContain('estado=encerrado')
    // O alvo que espera ainda não é apito: nenhuma linha, e o jogo continua.
    const soAguardando = semScript(await renderizar({ estado: 'aguardando' }))
    expect(linhas(soAguardando)).toBe(0)
    expect(soAguardando).toContain('Aguardando o 1º quarto')
  }, 60_000)

  it('jogo agendado fica MUDO, com a contagem de alvos e a frase do push uma vez', async () => {
    const agendados = (await jogosDeHoje()).filter((j) => j.status === 'AGENDADO')
    expect(agendados.length, 'a rodada simulada precisa de jogo ainda por começar').toBeGreaterThan(
      0,
    )
    const html = semScript(await renderizar({ estado: 'aguardando' }))
    expect(html).toContain('data-mudo="true"')
    expect(texto(html)).toMatch(/\d+ alvos? aguardando o 1º quarto/)
    expect(ocorrencias(html, 'O push avisa no instante do apito')).toBe(1)
  }, 60_000)

  it('o apito do jogo que já saiu do 1º quarto CONTINUA na tela, com o fim do 1º Q', async () => {
    const ruleset = await rulesetAtivo()
    const item = (await feedDaTela()).itens[0]!
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    try {
      // O quarto virou entre um ciclo e outro: o estado se lê do JOGO.
      await banco.db
        .update(jogos)
        .set({ quartoAtual: ruleset.fire_live.quarto + 1 })
        .where(eq(jogos.id, item.jogoId))
      const doJogo = painel(semScript(await renderizar({ jogo: item.jogoId })))
      expect(texto(doJogo)).toContain(item.nome)
      expect(doJogo).toContain('Fim do 1º Q')
      expect(doJogo).not.toContain('1º Q ao vivo')
    } finally {
      await banco.db
        .update(jogos)
        .set({ quartoAtual: antes!.quartoAtual })
        .where(eq(jogos.id, item.jogoId))
    }
  }, 60_000)

  it('depois do 1º quarto o placar fica no Q1 oficial, nunca o total da partida', async () => {
    const item = (await feedDaTela()).itens[0]!
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
      expect(texto(painel(html))).toContain(`${visitante.pontosQ1} – ${casa.pontosQ1}`)
      expect(html).not.toContain('>102<')
      expect(texto(html)).not.toContain('102 – 98')

      // Sem box do Q1 não há número para congelar — o total não o substitui.
      await banco.db
        .delete(estatisticasTimeJogo)
        .where(eq(estatisticasTimeJogo.jogoId, item.jogoId))
      const semBox = semScript(await renderizar({ jogo: item.jogoId }))
      expect(semBox).not.toContain('>102<')
      expect(painel(semBox)).toContain('Fim do 1º Q')
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

  it('o jogo da rodada que passa da meia-noite mantém placar e estado ao vivo', async () => {
    const item = (await feedDaTela()).itens[0]!
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    try {
      // 01h30 local do dia seguinte, ainda vinculado à rodada de HOJE.
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: new Date('2026-01-16T04:30:00Z') })
        .where(eq(jogos.id, item.jogoId))
      const doJogo = texto(painel(semScript(await renderizar({ jogo: item.jogoId }))))
      expect(doJogo).toContain('1º Q ao vivo')
      expect(doJogo).toContain(`${antes!.placarVisitante} – ${antes!.placarCasa}`)
      expect(doJogo).not.toContain('Aguardando o 1º quarto')
    } finally {
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: antes!.dataHoraUtc })
        .where(eq(jogos.id, item.jogoId))
    }
  }, 60_000)
})

describe('Ao Vivo do v2 — vazios e ocultos (telas-04-firelive, telas-demo)', () => {
  it('filtro da URL que zera a tela diz "Nada com esse filtro", com a saída', async () => {
    const html = await renderizar({ time: 'ZZZ' })
    expect(html).toContain('Nada com esse filtro')
    expect(html).toContain('Ver todos')
  }, 60_000)

  it('o filtro sem seção tem vazio próprio mesmo antes do primeiro apito', async () => {
    const onde = and(
      eq(feedSnapshot.dataReferencia, HOJE),
      eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
    )
    const snapshots = await banco.db.select().from(feedSnapshot).where(onde)
    try {
      for (const linha of snapshots) {
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
      for (const linha of snapshots) {
        await banco.db
          .update(feedSnapshot)
          .set({ conteudoJson: linha.conteudoJson })
          .where(eq(feedSnapshot.id, linha.id))
      }
    }
  }, 60_000)

  it('jogador oculto sai da linha e entra na lista de reativar', async () => {
    const alvo = (await feedDaTela()).itens[0]!
    const antes = await renderizar({ jogo: alvo.jogoId })
    expect(antes).toContain(`href="/estatisticas/jogador/${alvo.jogadorId}"`)
    await banco.db
      .insert(jogadoresOcultos)
      .values({ usuarioId: USUARIO, jogadorId: alvo.jogadorId })
      .onConflictDoNothing()
    try {
      const depois = await renderizar({ jogo: alvo.jogoId })
      expect(depois).not.toContain(`href="/estatisticas/jogador/${alvo.jogadorId}"`)
      expect(depois).toContain('Jogadores ocultos')
      expect(texto(depois)).toContain(alvo.nome)
      expect(depois).toContain('Mostrar de novo')
    } finally {
      await banco.db.delete(jogadoresOcultos).where(eq(jogadoresOcultos.jogadorId, alvo.jogadorId))
    }
  }, 60_000)

  it('apitos ocultos de um jogo não viram "ninguém cruzou o alvo"', async () => {
    const feed = await feedDaTela()
    const jogoId = feed.itens[0]!.jogoId
    const ids = [...new Set(feed.itens.filter((i) => i.jogoId === jogoId).map((i) => i.jogadorId))]
    await banco.db
      .insert(jogadoresOcultos)
      .values(ids.map((jogadorId) => ({ usuarioId: USUARIO, jogadorId })))
      .onConflictDoNothing()
    try {
      const html = semScript(await renderizar({ jogo: jogoId }))
      expect(linhas(html)).toBe(0)
      expect(html).toContain('Apitos deste jogo ocultos')
      expect(html).not.toContain('Ninguém cruzou o alvo neste jogo ainda')
    } finally {
      await banco.db.delete(jogadoresOcultos).where(inArray(jogadoresOcultos.jogadorId, ids))
    }
  }, 60_000)

  it('todos os apitados ocultos ganham a explicação própria, não a do filtro', async () => {
    const ids = [...new Set((await feedDaTela()).itens.map((i) => i.jogadorId))]
    await banco.db
      .insert(jogadoresOcultos)
      .values(ids.map((jogadorId) => ({ usuarioId: USUARIO, jogadorId })))
      .onConflictDoNothing()
    try {
      const html = await renderizar()
      expect(html).toContain('Todos os apitados estão ocultos')
      expect(html).not.toContain('Nada com esse filtro')
      expect(html).toContain('Jogadores ocultos')
    } finally {
      await banco.db.delete(jogadoresOcultos).where(inArray(jogadoresOcultos.jogadorId, ids))
    }
  }, 60_000)

  it('acompanhar é a estrela da linha; o botão solto não volta', async () => {
    const item = (await feedDaTela()).itens[0]!
    const html = await renderizar({ jogo: item.jogoId })
    expect(semEntidades(html)).toContain(`aria-label="Acompanhar ${item.nome}"`)
    expect(html).not.toContain('+ Acompanhar jogador')
  }, 60_000)
})
