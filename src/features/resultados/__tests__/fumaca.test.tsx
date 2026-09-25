import { readFileSync } from 'node:fs'
import { and, eq, inArray } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogos, times, usuarios } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { lerFeed } from '@/modules/entrega/lista-secreta'
import {
  conferirFireLive,
  greensDoDia,
  recapDaNoite,
  rotaResultados,
  taxaDaTemporada,
  ultimaRodadaConferida,
} from '@/modules/entrega/resultados'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { contar, dataHora, decimal, diaDaRodada } from '@/ui/formato'

/**
 * FUMAÇA DOS RESULTADOS DO V2 — ligada ao NOSSO back.
 *
 * O atalho de verdade (`src/app/(app)/resultados/route.ts`), a página de
 * verdade (`resultados/[data]/page.tsx` → `features/resultados/carregar.ts`)
 * e o slot `@painel/resultados/[data]` sobre um PGlite semeado pela temporada
 * simulada, com sessão e acesso simulados e o nível MUTÁVEL.
 *
 * Regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador, time ou
 * horário — o sujeito é lido do banco e a asserção é sobre ele.
 *
 * Herda as invariantes de `telas-04-resultados.test.ts` (aposentado com a
 * tela antiga) e o atalho de `telas-demo.test.ts`: cada caso diz de onde veio.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const ONTEM = somarDias(HOJE, -1)
/** Um dia antes da janela semeada: existe no calendário, não tem lista. */
const SEM_LISTA = somarDias(HOJE, -40)
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'ALL_STAR'
let sessaoDoTeste: { usuarioId: string; email: string } | null = { usuarioId: USUARIO, email: 'demo@teste.com' }

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => (sessaoDoTeste ? 'token-de-teste' : null),
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
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/resultados',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  // Produção está em `niveis.atributos: [PONTOS]`. Os casos de DNP precisam de
  // jogos com mais de um apitado distinto: religa os três num CLONE do
  // ruleset, só para o seed (como a suíte antiga).
  const rulesetDaSemente = structuredClone(await rulesetAtivo())
  rulesetDaSemente.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
  await simularAte(banco.db, rulesetDaSemente, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

type Busca = Record<string, string | string[] | undefined>

async function renderizar(data: string, busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/resultados/[data]/page')
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ data }), searchParams: Promise.resolve(busca) }))
}

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

const semEntidades = (t: string) =>
  t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** O texto que se lê, um espaço por tag. */
const texto = (html: string) =>
  semEntidades(
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()

/** A seção da Lista Secreta (até a do Fire Live). */
function secaoDaLista(html: string): string {
  const inicio = html.indexOf('id="titulo-lista"')
  expect(inicio, 'seção da Lista ausente').toBeGreaterThan(-1)
  const fim = html.indexOf('id="titulo-fire"', inicio)
  return html.slice(inicio, fim < 0 ? undefined : fim)
}

/** Uma `<li data-v>` por card conferido da Lista — a peça que fecha o ciclo. */
const cardsDaLista = (html: string) =>
  [...secaoDaLista(html).matchAll(/<li\b[^>]*data-v="([^"]+)"[^>]*>[\s\S]*?<\/li>/g)].map((m) => ({
    html: m[0],
    veredito: m[1]!,
  }))

/** O par `<dt>rótulo</dt><dd>valor</dd>(<dd>apoio</dd>)` de um número grande. */
function numero(html: string, rotulo: string): { valor: string; apoio: string | null } {
  const m = html.match(new RegExp(`>${rotulo}</dt><dd[^>]*>([^<]*)</dd>(?:<dd[^>]*>([^<]*)</dd>)?`))
  expect(m, `número "${rotulo}" ausente`).not.toBeNull()
  return { valor: semEntidades(m![1]!), apoio: m![2] === undefined ? null : semEntidades(m![2]) }
}

/** O bloco de um jogo, pelo rótulo `VIS @ CASA`. */
function blocoDoJogo(html: string, jogo: { visitanteSigla: string; casaSigla: string }): string {
  const marca = `aria-label="${jogo.visitanteSigla} @ ${jogo.casaSigla}"`
  const inicio = html.indexOf(marca)
  expect(inicio, marca).toBeGreaterThan(-1)
  const fim = html.indexOf('</ul></section>', inicio)
  return html.slice(inicio, fim)
}

const pct = (taxa: number) => `${Math.round(taxa * 100)}%`

// ===========================================================================
// O ATALHO /resultados E A DATA DA ROTA
// ===========================================================================

describe('Resultados do v2 — o atalho e a rodada da rota', () => {
  it('(telas-04 / telas-demo) /resultados é um 307 para a ÚLTIMA rodada conferida, com os filtros', async () => {
    const { GET } = await import('@/app/(app)/resultados/route')
    const ultima = await ultimaRodadaConferida(banco.db, HOJE)
    // O fixture: hoje está em curso, ontem terminou.
    expect(ultima).toBe(ONTEM)
    const resposta = await GET(new NextRequest('https://nip.test/resultados?estrategia=LISTA_SECRETA'))
    expect(resposta.status).toBe(307)
    expect(resposta.headers.get('location')).toBe(
      `https://nip.test${rotaResultados(ONTEM, { estrategia: 'LISTA_SECRETA' })}`,
    )
  })

  it('sem banco configurado, o atalho cai na rodada de hoje (como a página antiga)', async () => {
    vi.stubEnv('DATABASE_URL', '')
    try {
      const { GET } = await import('@/app/(app)/resultados/route')
      const resposta = await GET(new NextRequest('https://nip.test/resultados'))
      expect(resposta.headers.get('location')).toBe(`https://nip.test/resultados/${HOJE}`)
    } finally {
      vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
    }
  })

  it('(telas-04) data que não é data, ou dia que não existe, volta para hoje', async () => {
    expect(await destinoDoRedirect(renderizar('ontem'))).toBe(`/resultados/${HOJE}`)
    expect(await destinoDoRedirect(renderizar('2026-02-31'))).toBe(`/resultados/${HOJE}`)
    // E o filtro atravessa o redirecionamento.
    expect(await destinoDoRedirect(renderizar('abc', { atributo: 'PONTOS' }))).toBe(
      rotaResultados(HOJE, { atributo: 'PONTOS' }),
    )
  })

  it('sem sessão, a tela manda para /entrar ANTES de qualquer leitura', async () => {
    sessaoDoTeste = null
    try {
      expect(await destinoDoRedirect(renderizar(ONTEM))).toBe(
        `/entrar?destino=${encodeURIComponent(`/resultados/${ONTEM}`)}`,
      )
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  })

  it('(telas-04) o rótulo é o da RODADA, com as setas de ontem e de amanhã', async () => {
    const html = await renderizar(ONTEM)
    expect(texto(html)).toContain(diaDaRodada(ONTEM))
    expect(html).toContain(`href="/resultados/${somarDias(ONTEM, -1)}"`)
    expect(html).toContain(`href="/resultados/${HOJE}"`)
    // E o caminho de volta para a Lista do dia.
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Lista de hoje<\/a>/)
  }, 60_000)

  it('(telas-04) na rodada de hoje a seta de amanhã fica desabilitada, sem href', async () => {
    const html = await renderizar(HOJE)
    expect(html).not.toContain(`href="/resultados/${somarDias(HOJE, 1)}"`)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain(`href="/resultados/${somarDias(HOJE, -1)}"`)
  }, 60_000)

  it('(telas-04) dia sem lista publicada não é tela em branco — e as setas continuam', async () => {
    const html = await renderizar(SEM_LISTA)
    expect(texto(html)).toContain('Sem lista publicada neste dia')
    expect(html).toContain(`href="/resultados/${somarDias(SEM_LISTA, -1)}"`)
    expect(html).toContain(`href="/resultados/${somarDias(SEM_LISTA, 1)}"`)
    expect(html).not.toMatch(/<li\b[^>]*data-v=/)
  }, 60_000)

  it('(resultados-url-invalida) data válida de qualquer ano renderiza vazia, sem lançar', async () => {
    for (const data of ['0001-01-01', '9999-12-31']) {
      await expect(renderizar(data)).resolves.toContain('Sem lista publicada neste dia')
    }
  }, 60_000)
})

// ===========================================================================
// O RECAP DA NOITE
// ===========================================================================

describe('Resultados do v2 — o recap da noite', () => {
  it('(telas-04) os números da noite são os de recapDaNoite — Apitos é o que está em tela', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    expect(recap.noiteEncerrada).toBe(true)
    expect(recap.conferidos).toBeGreaterThan(0)
    expect(numero(html, 'Apitos').valor).toBe(String(recap.publicados))
    expect(numero(html, 'Bateram').valor).toBe(String(recap.bateram))
    const noite = numero(html, 'Na noite')
    expect(noite.valor).toBe(pct(recap.taxa!))
    expect(noite.apoio).toBe(recap.conferidos === recap.publicados ? null : `${recap.bateram} de ${recap.conferidos}`)
    expect(cardsDaLista(html)).toHaveLength(recap.publicados)
    expect(texto(html)).not.toContain('aguardando o fim da noite')
  }, 60_000)

  it('(telas-04) com um DNP na noite, a base da taxa fica escrita ao lado dela', async () => {
    const { estatisticasJogo } = await import('@/modules/dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const alvo = antes.porJogo.flatMap((g) => g.cards).find((c) => c.fez !== null)!
    const onde = and(eq(estatisticasJogo.jogoId, alvo.jogoId), eq(estatisticasJogo.jogadorId, alvo.jogadorId))
    const [linha] = await banco.db.select().from(estatisticasJogo).where(onde)
    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const recap = await recapDaNoite(banco.db, ONTEM)
      const html = await renderizar(ONTEM)
      expect(recap.conferidos).toBeLessThan(recap.publicados)
      const noite = numero(html, 'Na noite')
      expect(noite.valor).toBe(pct(recap.taxa!))
      expect(noite.apoio).toBe(`${recap.bateram} de ${recap.conferidos}`)
      expect(cardsDaLista(html)).toHaveLength(recap.publicados)
    } finally {
      await banco.db.insert(estatisticasJogo).values(linha!)
    }
  }, 60_000)

  it('(telas-04) a temporada mostra taxaDaTemporada, com quantas rodadas e quantos apitos', async () => {
    // Janela larga de propósito: a temporada semeada cabe inteira nela.
    const temporada = await taxaDaTemporada(banco.db, HOJE, 400)
    const html = await renderizar(ONTEM)
    expect(temporada.conferidos).toBeGreaterThan(0)
    const t = numero(html, 'Temporada')
    expect(t.valor).toBe(`${decimal((temporada.acertos / temporada.conferidos) * 100)}%`)
    expect(t.apoio).toBe(
      `${temporada.acertos.toLocaleString('pt-BR')} de ${temporada.conferidos.toLocaleString('pt-BR')} · ${contar(temporada.rodadas, 'rodada')}`,
    )
  }, 60_000)

  it('(telas-04) o apito da noite é o de recapDaNoite, com o que ele fez e a linha mais baixa', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const alvo = recap.apitoDaNoite!
    expect(alvo).toBeDefined()
    const html = await renderizar(ONTEM)
    const inicio = html.indexOf('aria-label="Apito da noite"')
    expect(inicio).toBeGreaterThan(-1)
    const bloco = texto(html.slice(inicio, html.indexOf('</section>', inicio)))
    expect(bloco).toContain(alvo.nome)
    expect(bloco).toContain(String(alvo.fez))
    expect(bloco).toContain(`${Math.min(...alvo.linhas.map((l) => l.linha))}+`)
    expect(bloco).toContain(alvo.timeSigla)
  }, 60_000)

  it('(telas-04) um bloco por jogo, com o placar final e a quebra por quarto', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    expect(recap.porJogo.length).toBeGreaterThan(1)
    expect(html.match(/>Pontos por quarto</g) ?? []).toHaveLength(recap.porJogo.length)
    for (const { jogo } of recap.porJogo) {
      const bloco = blocoDoJogo(html, jogo)
      expect(bloco).toContain(`>${jogo.placarVisitante}<`)
      expect(bloco).toContain(`>${jogo.placarCasa}<`)
      const linhas = [...bloco.matchAll(/<tr><th scope="row">([\s\S]*?)<\/tr>/g)].map((m) => texto(`<th>${m[1]}`))
      expect(linhas).toContain([jogo.visitanteSigla, ...jogo.quartosVisitante].join(' '))
      expect(linhas).toContain([jogo.casaSigla, ...jogo.quartosCasa].join(' '))
    }
  }, 60_000)

  it('(telas-04) sem o box do time o bloco diz que acabou, sem inventar quartos', async () => {
    const { estatisticasTimeJogo } = await import('@/modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo = recap.porJogo[0]!
    const onde = eq(estatisticasTimeJogo.jogoId, grupo.jogo.jogoId)
    const linhas = await banco.db.select().from(estatisticasTimeJogo).where(onde)
    try {
      await banco.db.delete(estatisticasTimeJogo).where(onde)
      const html = await renderizar(ONTEM)
      expect(html.match(/>Pontos por quarto</g) ?? []).toHaveLength(recap.porJogo.length - 1)
      const bloco = blocoDoJogo(html, grupo.jogo)
      expect(bloco).not.toContain('Pontos por quarto')
      expect(texto(bloco)).toContain('Final')
    } finally {
      await banco.db.insert(estatisticasTimeJogo).values(linhas)
    }
  }, 60_000)

  it('(telas-04) os greens do Fire Live seguem em bloco próprio, com o marco batido', async () => {
    // Green só nasce no dia em que o Fire Live rodou — a rodada de hoje.
    const { greensDoDia } = await import('@/modules/entrega/resultados')
    const greens = await greensDoDia(banco.db, HOJE)
    const html = await renderizar(HOJE)
    expect(greens.length).toBeGreaterThan(0)
    const inicio = html.indexOf('id="titulo-greens"')
    expect(inicio).toBeGreaterThan(-1)
    const bloco = texto(html.slice(inicio))
    const unidade = { PONTOS: 'pontos', REBOTES: 'rebotes', ASSISTENCIAS: 'assistências' }
    for (const g of greens) {
      expect(bloco).toContain(g.nome)
      // O valor com a unidade e o quarto; o marco nomeado como marco. Nunca
      // "Pontos 25": atributo + número, nesta tela, é a gramática da LINHA.
      expect(bloco).toContain(`${g.valor} ${unidade[g.atributo]} no 1º quarto`)
      expect(bloco).toContain(`marco ${g.marco}`)
    }
    expect(texto(html)).not.toMatch(/(Pontos|Rebotes|Assistências) \d+\b(?!\+)/)
  }, 60_000)

  it('(planos-home) a rodada que TERMINOU é inteira para o GRÁTIS — a prova social (decisão 9)', async () => {
    // Decisão 9 (15/09) refinada em 24/09: o grátis vê tudo o que já terminou.
    // Ontem, todo jogo está ENCERRADO — a tela é a mesma do assinante.
    nivelDoTeste = 'GRATIS'
    try {
      const recap = await recapDaNoite(banco.db, ONTEM)
      const html = await renderizar(ONTEM)
      expect(recap.noiteEncerrada).toBe(true)
      expect(cardsDaLista(html)).toHaveLength(recap.publicados)
      expect(html).not.toContain('/assinar')
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  }, 60_000)

  it('(24/09) na rodada em curso o GRÁTIS só vê o jogo que TERMINOU — e o pago segue vendo o pré-jogo', async () => {
    // A decisão 9 dizia que Resultados "vaza o sinal com um dia de atraso".
    // Na rodada de hoje não há atraso: o card pré-jogo É o sinal, com nome,
    // linha e odd, horas antes da bola subir. Decisão do parceiro (24/09): o
    // grátis só vê jogo ENCERRADO; em andamento não conta como encerrado.
    const { jogos } = await import('@/modules/dominio/db/schema')
    const antes = await recapDaNoite(banco.db, HOJE)
    // O fixture: um jogo AO_VIVO (o do Fire Live) e os demais AGENDADOS.
    const agendados = antes.porJogo.filter((g) => g.jogo.status === 'AGENDADO')
    expect(agendados.length, 'preciso de um AGENDADO para encerrar e outro para seguir escondido').toBeGreaterThan(1)
    expect(antes.porJogo.some((g) => g.jogo.status === 'AO_VIVO')).toBe(true)
    const [encerrado] = agendados
    const escondidos = antes.porJogo.filter((g) => g.jogo.jogoId !== encerrado!.jogo.jogoId)
    const fireAntes = await conferirFireLive(banco.db, HOJE)
    const greensAntes = await greensDoDia(banco.db, HOJE)
    expect(fireAntes.length).toBeGreaterThan(0)
    expect(greensAntes.length).toBeGreaterThan(0)
    // O Fire Live e os greens são do jogo AO_VIVO — nenhum do que vai encerrar.
    expect(fireAntes.every((c) => c.jogoId !== encerrado!.jogo.jogoId)).toBe(true)

    const nomesVisiveis = encerrado!.cards.map((c) => c.nome)
    const timesVisiveis = new Set(encerrado!.cards.map((c) => c.timeId))
    const onde = eq(jogos.id, encerrado!.jogo.jogoId)
    nivelDoTeste = 'GRATIS'
    try {
      // Um jogo agendado termina (sem box ainda: "aguardando dado oficial" é
      // um jogo que TERMINOU, e o card dele já não serve para apostar).
      await banco.db.update(jogos).set({ status: 'ENCERRADO', quartoAtual: null, placarCasa: 101, placarVisitante: 99 }).where(onde)
      const html = await renderizar(HOJE)
      const t = texto(html)

      // O jogo que terminou está inteiro: um card por apitado, no bloco dele.
      const bloco = blocoDoJogo(html, encerrado!.jogo)
      expect(bloco.match(/<li\b[^>]*data-v="aguardando"/g) ?? []).toHaveLength(encerrado!.cards.length)
      for (const c of encerrado!.cards) expect(html).toContain(`/estatisticas/jogador/${c.jogadorId}`)
      expect(cardsDaLista(html)).toHaveLength(encerrado!.cards.length)

      // O agendado e o que está rolando não deixam rastro: nem bloco, nem id,
      // nem nome, nem "Pré-jogo" / "Em andamento".
      for (const g of escondidos) {
        expect(html).not.toContain(`aria-label="${g.jogo.visitanteSigla} @ ${g.jogo.casaSigla}"`)
        for (const c of g.cards) {
          expect(html, c.nome).not.toContain(c.jogadorId)
          // Guarda contra homônimo parcial: um nome contido num nome visível
          // apareceria por causa do visível, não do escondido.
          if (!nomesVisiveis.some((n) => n.includes(c.nome))) expect(t, c.nome).not.toContain(c.nome)
          // O time do escondido não vai ao filtro — salvo se um visível o tem.
          if (c.timeId && !timesVisiveis.has(c.timeId)) expect(html).not.toContain(`value="${c.timeId}"`)
        }
      }
      expect(t).not.toContain('Pré-jogo')
      expect(t).not.toContain('Em andamento')
      // O Fire Live e os greens do jogo em andamento ficam fora — o bloco
      // dos greens nem aparece.
      for (const c of fireAntes) {
        expect(html, c.nome).not.toContain(c.jogadorId)
        if (!nomesVisiveis.some((n) => n.includes(c.nome))) expect(t, c.nome).not.toContain(c.nome)
      }
      expect(html).not.toContain('id="titulo-greens"')
      for (const g of greensAntes) if (!nomesVisiveis.some((n) => n.includes(g.nome))) expect(t, g.nome).not.toContain(g.nome)
      // Os números contam só o que está em tela; e a noite SEGUE em curso —
      // nada de taxa nem de apito da noite antes do último jogo acabar.
      expect(numero(html, 'Apitos').valor).toBe(String(encerrado!.cards.length))
      expect(numero(html, 'Na noite')).toEqual({ valor: '—', apoio: 'aguardando o fim da noite' })
      expect(html).not.toContain('aria-label="Apito da noite"')
      expect(t).not.toContain('Sem lista publicada neste dia')

      // (b) O pago, na MESMA rodada, segue vendo o pré-jogo e o em andamento.
      nivelDoTeste = 'ALL_STAR'
      const pago = await renderizar(HOJE)
      expect(cardsDaLista(pago)).toHaveLength(antes.publicados)
      expect(texto(secaoDaLista(pago))).toContain('Pré-jogo')
      expect(pago).toContain('id="titulo-greens"')
      for (const c of fireAntes) expect(pago).toContain(`/estatisticas/jogador/${c.jogadorId}`)
    } finally {
      nivelDoTeste = 'ALL_STAR'
      await banco.db
        .update(jogos)
        .set({
          status: 'AGENDADO',
          quartoAtual: encerrado!.jogo.quartoAtual,
          placarCasa: encerrado!.jogo.placarCasa,
          placarVisitante: encerrado!.jogo.placarVisitante,
        })
        .where(onde)
    }
  }, 90_000)

  it('(24/09) sem jogo encerrado na rodada, o GRÁTIS vê um vazio honesto — não "Pré-jogo" nem "sem lista"', async () => {
    const recap = await recapDaNoite(banco.db, HOJE)
    const fire = await conferirFireLive(banco.db, HOJE)
    expect(recap.publicados).toBeGreaterThan(0)
    expect(recap.porJogo.every((g) => g.jogo.status !== 'ENCERRADO')).toBe(true)
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar(HOJE)
      const t = texto(html)
      expect(html).not.toMatch(/<li\b[^>]*data-v=/)
      for (const c of [...recap.porJogo.flatMap((g) => g.cards), ...fire]) expect(html, c.nome).not.toContain(c.jogadorId)
      expect(t).not.toContain('Pré-jogo')
      // A lista EXISTE — dizer que não há lista seria mentir para explicar.
      expect(t).not.toContain('Sem lista publicada neste dia')
      expect(t).not.toContain('nestes filtros')
      expect(t).toContain('Nenhum jogo encerrado ainda')
      expect(numero(html, 'Apitos').valor).toBe('0')
      // As setas continuam: a rodada de ontem está inteira para ele.
      expect(html).toContain(`href="/resultados/${ONTEM}"`)
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  }, 60_000)

  it('o Placar do NIP entra com as rodadas conferidas da janela', async () => {
    const html = await renderizar(ONTEM)
    expect(html).toContain('Placar do NIP')
    expect(texto(html)).toContain('Por nota de confiança')
    expect(texto(html)).toContain('Por nível do jogador')
  }, 60_000)
})

// ===========================================================================
// O CARD CONFERIDO
// ===========================================================================

describe('Resultados do v2 — o card conferido fecha o ciclo', () => {
  it('(telas-04) um card por apitado, com o realizado e o veredito escrito', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const cards = cardsDaLista(html)
    const todos = recap.porJogo.flatMap((g) => g.cards)
    expect(todos.length).toBeGreaterThan(0)
    expect(cards).toHaveLength(todos.length)
    // O veredito ESCRITO — a cor nunca é o único canal.
    expect(cards.filter((c) => c.veredito === 'bateu')).toHaveLength(todos.filter((c) => c.bateuLinhaMaisBaixa === true).length)
    expect(cards.filter((c) => c.veredito === 'falhou')).toHaveLength(todos.filter((c) => c.bateuLinhaMaisBaixa === false).length)
    for (const c of cards.filter((x) => x.veredito === 'bateu')) expect(texto(c.html)).toContain('Bateu')
    for (const c of cards.filter((x) => x.veredito === 'falhou')) expect(texto(c.html)).toContain('Não bateu')
    for (const card of todos.filter((c) => c.fez !== null)) {
      const doCard = cards.find((c) => c.html.includes(`/estatisticas/jogador/${card.jogadorId}`) && texto(c.html).includes(`Realizado ${card.fez}`))
      expect(doCard, card.nome).toBeDefined()
    }
  }, 60_000)

  it('(telas-04) a caixinha da rodada entra no fim da fileira, destacada — uma por card de quem jogou', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const jogaram = recap.porJogo.flatMap((g) => g.cards).filter((c) => c.fez !== null)
    expect(jogaram.length).toBeGreaterThan(0)
    expect(secaoDaLista(html).match(/data-ultimo="true"/g) ?? []).toHaveLength(jogaram.length)
    expect(secaoDaLista(html)).toContain('A última é a desta rodada')
  }, 60_000)

  it('(telas-04) a caixinha desta rodada é a ÚLTIMA da fileira cronológica, e vale o que ele fez', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const feed = await lerFeed(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const alvo = recap.porJogo.flatMap((g) => g.cards).find((c) => c.fez !== null && c.fez > 0)!
    const item = (feed?.conteudo.itens ?? [])
      .filter((i) => i.jogoId === alvo.jogoId && i.jogadorId === alvo.jogadorId && i.atributo === alvo.atributo)
      .sort((a, b) => (a.linha ?? Infinity) - (b.linha ?? Infinity))[0]!
    expect(item).toBeDefined()
    expect((item.ultimos5 ?? []).length).toBeGreaterThan(0)
    const card = cardsDaLista(html).find(
      (c) => c.html.includes(`/estatisticas/jogador/${alvo.jogadorId}`) && c.html.includes(`${alvo.linhaConferida}+`),
    )!
    const fileira = card.html.slice(card.html.indexOf('role="img"'))
    const caixas = [...fileira.matchAll(/(<span[^>]*data-bateu=[^>]*>)(\d+)<\/span>/g)]
    expect(caixas.length).toBeGreaterThan(1)
    // Do mais antigo à esquerda ao jogo desta rodada à direita.
    expect(caixas.map((c) => c[2])).toEqual([
      ...[...(item.ultimos5 ?? []).slice(0, 4)].reverse().map((j) => String(j.valor)),
      String(alvo.fez),
    ])
    expect(caixas.at(-1)![1]).toContain('data-ultimo="true"')
    expect(caixas.slice(0, -1).every((c) => !c[1]!.includes('data-ultimo'))).toBe(true)
  }, 60_000)

  it('(telas-04) quem não entrou em quadra é NEUTRO: DNP, sem ✓ e sem ✕', async () => {
    const { estatisticasJogo } = await import('@/modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    // Um jogo com DOIS apitados diferentes: o jogo segue conferido e só este
    // jogador vira DNP — não "o box do jogo ainda não chegou".
    const grupo = recap.porJogo.find((g) => new Set(g.cards.map((c) => c.jogadorId)).size > 1)!
    const alvo = grupo.cards[0]!
    const doAlvo = grupo.cards.filter((c) => c.jogadorId === alvo.jogadorId)
    const onde = and(eq(estatisticasJogo.jogoId, alvo.jogoId), eq(estatisticasJogo.jogadorId, alvo.jogadorId))
    const [linha] = await banco.db.select().from(estatisticasJogo).where(onde)
    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const html = await renderizar(ONTEM)
      const dnp = cardsDaLista(html).filter((c) => c.veredito === 'dnp')
      expect(dnp).toHaveLength(doAlvo.length)
      for (const c of dnp) {
        expect(texto(c.html)).toContain('DNP · neutro')
        expect(c.html).not.toMatch(/[✓✕]/)
      }
      expect(secaoDaLista(html).match(/data-ultimo="true"/g) ?? []).toHaveLength(
        recap.porJogo.flatMap((g) => g.cards).filter((c) => c.fez !== null).length - doAlvo.length,
      )
    } finally {
      await banco.db.insert(estatisticasJogo).values(linha!)
    }
  }, 60_000)

  it('(telas-04) box do jogo chegou e o apitado não jogou: DNP, não "aguardando dado oficial"', async () => {
    const { estatisticasJogo } = await import('@/modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo =
      recap.porJogo.find((g) => new Set(g.cards.map((c) => c.jogadorId)).size === 1) ?? recap.porJogo[0]!
    const apitados = [...new Set(grupo.cards.map((c) => c.jogadorId))]
    const onde = and(eq(estatisticasJogo.jogoId, grupo.jogo.jogoId), inArray(estatisticasJogo.jogadorId, apitados))
    const linhas = await banco.db.select().from(estatisticasJogo).where(onde)
    const restante = await banco.db
      .select({ jogadorId: estatisticasJogo.jogadorId })
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, grupo.jogo.jogoId))
    expect(restante.length).toBeGreaterThan(linhas.length)
    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const html = await renderizar(ONTEM)
      const bloco = blocoDoJogo(html, grupo.jogo)
      expect(bloco.match(/data-v="dnp"/g)?.length ?? 0).toBeGreaterThanOrEqual(grupo.cards.length)
      expect(texto(html).toLowerCase()).not.toContain('aguardando dado oficial')
    } finally {
      await banco.db.insert(estatisticasJogo).values(linhas)
    }
  }, 60_000)

  it('(telas-04) jogo encerrado SEM box não inventa veredito: carimbo do PRÓPRIO jogo', async () => {
    const { estatisticasJogo, jogos } = await import('@/modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const [semBox, tocado, esquecido] = recap.porJogo
    expect(recap.porJogo.length).toBeGreaterThan(2)
    // O jogo sem box foi visto há tempo; um vizinho acabou de ser atualizado;
    // outro está ainda mais velho. O carimbo é o do jogo que espera o box.
    const antigo = new Date(semBox!.jogo.dataHoraUtc.getTime() + 3 * 3_600_000)
    const recente = new Date(antigo.getTime() + 5 * 3_600_000)
    const maisVelho = new Date(antigo.getTime() - 5 * 3_600_000)
    const ondeBox = eq(estatisticasJogo.jogoId, semBox!.jogo.jogoId)
    const linhas = await banco.db.select().from(estatisticasJogo).where(ondeBox)
    const carimbar = (jogoId: string, quando: Date) =>
      banco.db.update(jogos).set({ atualizadoEm: quando }).where(eq(jogos.id, jogoId))
    try {
      await banco.db.delete(estatisticasJogo).where(ondeBox)
      await carimbar(semBox!.jogo.jogoId, antigo)
      await carimbar(tocado!.jogo.jogoId, recente)
      await carimbar(esquecido!.jogo.jogoId, maisVelho)
      const html = await renderizar(ONTEM)
      const bloco = blocoDoJogo(html, semBox!.jogo)
      expect(bloco.match(/<li\b[^>]*data-v="aguardando"/g) ?? []).toHaveLength(semBox!.cards.length)
      const t = texto(bloco)
      expect(t).toContain('Aguardando dado oficial')
      expect(t).not.toMatch(/Realizado \d/)
      expect(t).not.toContain('DNP')
      expect(t).toContain(dataHora(antigo, FUSO))
      expect(texto(html)).not.toContain(dataHora(recente, FUSO))
      expect(texto(html)).not.toContain(dataHora(maisVelho, FUSO))
    } finally {
      await banco.db.insert(estatisticasJogo).values(linhas)
      await carimbar(semBox!.jogo.jogoId, semBox!.jogo.atualizadoEm)
      await carimbar(tocado!.jogo.jogoId, tocado!.jogo.atualizadoEm)
      await carimbar(esquecido!.jogo.jogoId, esquecido!.jogo.atualizadoEm)
    }
  }, 60_000)

  it('(telas-04) a rodada AINDA EM CURSO não vira veredito: sem realizado, sem apito da noite', async () => {
    const { jogos } = await import('@/modules/dominio/db/schema')
    const encerrados = await banco.db
      .select({ id: jogos.id })
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, HOJE), eq(jogos.status, 'ENCERRADO')))
    const recap = await recapDaNoite(banco.db, HOJE)
    const html = await renderizar(HOJE)
    expect(encerrados).toHaveLength(0)
    expect(recap.noiteEncerrada).toBe(false)
    expect(recap.publicados).toBeGreaterThan(0)
    const cards = cardsDaLista(html)
    expect(cards).toHaveLength(recap.publicados)
    expect(cards.every((c) => ['pre', 'vivo', 'aguardando'].includes(c.veredito))).toBe(true)
    expect(cards.some((c) => c.veredito === 'pre')).toBe(true)
    expect(texto(secaoDaLista(html))).toContain('Pré-jogo')
    expect(texto(secaoDaLista(html))).not.toMatch(/Realizado \d/)
    // Os números: apitos em tela, e nada de taxa inventada.
    expect(numero(html, 'Apitos').valor).toBe(String(recap.publicados))
    expect(numero(html, 'Bateram').valor).toBe('—')
    expect(numero(html, 'Na noite')).toEqual({ valor: '—', apoio: 'aguardando o fim da noite' })
    expect(html).not.toContain('aria-label="Apito da noite"')
  }, 60_000)

  it('(telas-04) jogo da rodada fora da janela local do dia não muda o estado dos cards', async () => {
    const { jogos } = await import('@/modules/dominio/db/schema')
    const { intervaloDoDia } = await import('@/modules/dominio/rodada')
    const recap = await recapDaNoite(banco.db, HOJE)
    const alvo = recap.porJogo.find((g) => g.jogo.status === 'AGENDADO')!
    expect(alvo).toBeDefined()
    const antes = cardsDaLista(await renderizar(HOJE))
    const { fim } = intervaloDoDia(HOJE, FUSO)
    try {
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: new Date(fim.getTime() + 3_600_000) })
        .where(eq(jogos.id, alvo.jogo.jogoId))
      const depois = cardsDaLista(await renderizar(HOJE))
      expect(depois.map((c) => c.veredito).sort()).toEqual(antes.map((c) => c.veredito).sort())
    } finally {
      await banco.db.update(jogos).set({ dataHoraUtc: alvo.jogo.dataHoraUtc }).where(eq(jogos.id, alvo.jogo.jogoId))
    }
  }, 60_000)

  it('(telas-04) o mando sai no card: "vs ADV" para o mandante, "@ ADV" para o visitante — por ID', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const cards = cardsDaLista(await renderizar(ONTEM))
    let fora = 0
    let casa = 0
    for (const { jogo, cards: doJogo } of recap.porJogo) {
      for (const card of doJogo) {
        const li = cards.find((c) => c.html.includes(`/estatisticas/jogador/${card.jogadorId}`))
        expect(li).toBeDefined()
        const t = texto(li!.html)
        // Entre a sigla e o mando pode vir a posição ("CHA · F · vs ATL").
        if (card.timeId === jogo.visitanteId) {
          expect(t).toMatch(new RegExp(`${card.timeSigla}( · [A-Z-]+)? · @ ${jogo.casaSigla}\\b`))
          fora++
        } else if (card.timeId === jogo.casaId) {
          expect(t).toMatch(new RegExp(`${card.timeSigla}( · [A-Z-]+)? · vs ${jogo.visitanteSigla}\\b`))
          casa++
        }
      }
    }
    // A noite tem os dois lados: sem isso o teste passaria com "vs" fixo.
    expect(fora).toBeGreaterThan(0)
    expect(casa).toBeGreaterThan(0)
  }, 60_000)

  it('(telas-04) o mando vem da LISTA do CJ: o time REAL do provedor não mexe no card', async () => {
    const { jogadores, times } = await import('@/modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo = recap.porJogo.find((g) => g.cards.some((c) => c.timeId !== null))!
    const alvo = grupo.cards.find((c) => c.timeId !== null)!
    const [real] = await banco.db.select({ timeId: jogadores.timeId }).from(jogadores).where(eq(jogadores.id, alvo.jogadorId))
    const forasteiro = (await banco.db.select({ id: times.id, sigla: times.sigla }).from(times)).find(
      (t) => t.id !== alvo.timeId && t.id !== grupo.jogo.casaId && t.id !== grupo.jogo.visitanteId,
    )!
    const apoio = new RegExp(
      alvo.timeId === grupo.jogo.casaId
        ? `${alvo.timeSigla}( · [A-Z-]+)? · vs ${grupo.jogo.visitanteSigla}\\b`
        : `${alvo.timeSigla}( · [A-Z-]+)? · @ ${grupo.jogo.casaSigla}\\b`,
    )
    try {
      await banco.db.update(jogadores).set({ timeId: forasteiro.id }).where(eq(jogadores.id, alvo.jogadorId))
      const li = cardsDaLista(await renderizar(ONTEM)).find((c) => c.html.includes(`/estatisticas/jogador/${alvo.jogadorId}`))!
      expect(li).toBeDefined()
      expect(texto(li.html)).toMatch(apoio)
      expect(texto(li.html)).not.toMatch(new RegExp(`\\b${forasteiro.sigla}\\b`))
    } finally {
      await banco.db.update(jogadores).set({ timeId: real!.timeId }).where(eq(jogadores.id, alvo.jogadorId))
    }
  }, 60_000)

  it('(telas-04) a odd do card vem na forma do ruleset, e nenhum card escreve percentual', async () => {
    const cards = cardsDaLista(await renderizar(HOJE))
    expect(cards.length).toBeGreaterThan(0)
    const odds = cards.flatMap((c) => [...texto(c.html).matchAll(/Odd (\d+,\d{2}(?:–\d+,\d{2})?)/g)].map((m) => m[1]))
    expect(odds.length, 'nenhum card da rodada em curso trouxe odd').toBeGreaterThan(0)
    for (const odd of odds) expect(odd).toMatch(/^\d+,\d{2}(–\d+,\d{2})?$/)
    for (const c of cards) expect(texto(c.html)).not.toContain('%')
  }, 60_000)

  it('(telas-04) antes do veredito a linha mostra a média ao lado da linha prevista', async () => {
    const lista = texto(secaoDaLista(await renderizar(HOJE)))
    expect(lista).toContain('Linha prevista · jogo inteiro')
    expect(lista).toMatch(/média \d+(,\d)?/)
  }, 60_000)
})

// ===========================================================================
// FILTROS E ESCRITA
// ===========================================================================

describe('Resultados do v2 — filtros e escrita', () => {
  it('(telas-04) atributo/time recortam os cards e as setas mantêm o filtro', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const alvo = recap.porJogo.flatMap((g) => g.cards).find((c) => c.timeId !== null)!
    const html = await renderizar(ONTEM, { estrategia: 'LISTA_SECRETA', atributo: alvo.atributo, time: alvo.timeId! })
    const esperados = recap.porJogo.flatMap((g) => g.cards).filter((c) => c.atributo === alvo.atributo && c.timeId === alvo.timeId)
    expect(cardsDaLista(html)).toHaveLength(esperados.length)
    expect(html).toContain(
      `/resultados/${somarDias(ONTEM, -1)}?estrategia=LISTA_SECRETA&amp;atributo=${alvo.atributo}&amp;time=${alvo.timeId}`,
    )
    expect(texto(html)).toContain('Resumo dos filtros · jogo inteiro')
    expect(texto(html)).toContain('Nos filtros')
    // Estratégia Lista Secreta: o Fire Live sai da tela.
    expect(html).not.toContain('id="titulo-fire"')
  }, 60_000)

  it('(telas-04) a taxa nunca divide elemento com o % de confiança de um apito', async () => {
    const html = await renderizar(ONTEM)
    const t = texto(html)
    expect(t.toLowerCase()).not.toContain('acerto do apito')
    for (const c of cardsDaLista(html)) expect(texto(c.html)).not.toContain('%')
    // O único percentual com casa decimal da tela é o da temporada.
    const decimais = [...t.matchAll(/\d+,\d+\s?%/g)].map((m) => m[0])
    expect(decimais).toHaveLength(1)
    expect(decimais[0]).toBe(numero(html, 'Temporada').valor)
  }, 60_000)

  it('(telas-04 / telas-demo) regras de escrita da identidade, no encerrado e no em curso', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    for (const data of [ONTEM, HOJE]) {
      const t = texto(await renderizar(data))
      expect(t.toLowerCase()).not.toContain('probabilidade')
      // A nota da partida não entra em tela de estratégia — e nunca se chama nível.
      expect(t).not.toMatch(/\bNOTA\b/)
      expect(t.toLowerCase()).not.toContain('nota da partida')
      expect(t.toLowerCase()).not.toContain('nível da partida')
      // Linha SEMPRE inteira, com "+".
      expect(t).not.toMatch(/\d+,\d+\+/)
      expect(t.toLowerCase()).not.toContain('meio ponto')
      expect(t).not.toContain('ALTÍSSIMO VALOR')
      expect(t).not.toContain('3 PONTOS')
      expect(t).not.toContain('Carlos')
      expect(t.toLowerCase()).not.toContain('lista do cj')
      expect(t).not.toContain('...')
      expect(t).not.toContain('…')
      // A tela termina onde o mockup termina: sem parágrafo autoral.
      expect(t).not.toContain('Um apitado conta como acerto')
    }
    const alvo = recap.apitoDaNoite!
    expect(texto(await renderizar(ONTEM))).toContain(`${Math.min(...alvo.linhas.map((l) => l.linha))}+`)
  }, 60_000)
})

// ===========================================================================
// A COLUNA DA SEÇÃO E AS REGRAS DE FONTE
// ===========================================================================

describe('Resultados do v2 — a coluna da seção (@painel/resultados/[data])', () => {
  async function renderizarPainel(data: string, busca: Busca = {}) {
    const { default: Painel } = await import('@/app/(app)/@painel/resultados/[data]/page')
    return Painel({ params: Promise.resolve({ data }), searchParams: Promise.resolve(busca) })
  }

  it('tem portão próprio: sem sessão vai para /entrar com a MESMA rota da página', async () => {
    sessaoDoTeste = null
    try {
      expect(await destinoDoRedirect(renderizarPainel(ONTEM, { atributo: 'PONTOS' }))).toBe(
        `/entrar?destino=${encodeURIComponent(rotaResultados(ONTEM, { atributo: 'PONTOS' }))}`,
      )
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  })

  it('com sessão, é a coluna da rodada', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const elemento = await renderizarPainel(ONTEM)
      expect(elemento.props).toMatchObject({ modo: 'resumo', rota: '/resultados', rotulo: 'Coluna da rodada' })
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  })
})

describe('Resultados do v2 — fonte', () => {
  const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const fonte = () => semComentarios(readFileSync('src/features/resultados/carregar.ts', 'utf8'))

  it('o carregador lê feed, temporada e placar pelos caches — depois do portão', () => {
    const f = fonte()
    const portao = f.indexOf("exigirNivel('GRATIS'")
    expect(portao).toBeGreaterThan(0)
    // O corte do plano (24/09) é decidido logo depois do portão, pelo mesmo
    // `atende` das outras telas — não por uma leitura de nível própria.
    expect(f.indexOf("atende(acesso.nivel, 'MVP')")).toBeGreaterThan(portao)
    for (const leitura of ['lerFeedCacheado(', 'taxaDaTemporadaCacheada(', 'placarCacheado(', 'recapDaNoite(']) {
      expect(f.indexOf(leitura), leitura).toBeGreaterThan(portao)
    }
    expect(f).not.toMatch(/[^a-zA-Z](lerFeed|taxaDaTemporada|conferirRodadas|linhasDoJogador)\(/)
    expect(f).not.toContain("'use cache'")
  })

  it('o slot desenha a coluna só depois do portão', () => {
    const painel = readFileSync('src/app/(app)/@painel/resultados/[data]/page.tsx', 'utf8')
    expect(painel.indexOf("exigirNivel('GRATIS'")).toBeGreaterThan(0)
    expect(painel.indexOf('<LateralDaRodada')).toBeGreaterThan(painel.indexOf("exigirNivel('GRATIS'"))
  })
})

// ===========================================================================
// A TEMPORADA ANTERIOR (spec 25/09) — aberta para o grátis, só leitura
// ===========================================================================

describe('Resultados do v2 — temporada anterior', () => {
  /** Um ano antes da temporada simulada: nunca é a temporada do calendário do teste. */
  const DIA_ANTERIOR = '2024-11-04'
  let TEMPORADA_ANTERIOR = ''
  let NOME_DO_APITADO = ''

  /** Nível, rota e busca — o fino invólucro que a spec da tarefa nomeia. */
  async function renderizarComo(nivel: NivelDoPlano, caminho: string, busca: Busca = {}): Promise<string> {
    nivelDoTeste = nivel
    try {
      if (caminho === '/resultados') {
        const { GET } = await import('@/app/(app)/resultados/route')
        const url = new URL('https://nip.test/resultados')
        for (const [k, v] of Object.entries(busca)) if (typeof v === 'string') url.searchParams.set(k, v)
        const resposta = await GET(new NextRequest(url))
        return resposta.headers.get('location') ?? ''
      }
      return await renderizar(caminho.replace('/resultados/', ''), busca)
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  }

  beforeAll(async () => {
    const { semearDiaAnterior } = await import('@/modules/entrega/retroativo/__tests__/semente-tela')
    const semente = await semearDiaAnterior(banco.db, await rulesetAtivo(), DIA_ANTERIOR)
    TEMPORADA_ANTERIOR = semente.temporada
    NOME_DO_APITADO = semente.apitados[0]!.nome
  }, 60_000)

  it('temporada anterior: o grátis vê os apitos em Resultados, com o veredito', async () => {
    const html = await renderizarComo('GRATIS', `/resultados/${DIA_ANTERIOR}`, { temporada: TEMPORADA_ANTERIOR })
    expect(html).toContain(NOME_DO_APITADO)
    expect(html).toMatch(/Bateu|Não bateu/)
    expect(html).toContain('aplicada à temporada passada')
    expect(texto(html)).toContain('Nenhum destes apitos foi publicado na época.')
    // O seletor mostra as duas temporadas, e a desta tela está marcada.
    expect(html).toContain(`/resultados?temporada=${TEMPORADA_ANTERIOR}`)
    expect(html).not.toMatch(/probabilidade/i)
  }, 60_000)

  it('sem ?temporada=, uma data da temporada anterior implica a temporada dela', async () => {
    const html = await renderizarComo('GRATIS', `/resultados/${DIA_ANTERIOR}`)
    expect(html).toContain(NOME_DO_APITADO)
    expect(html).toContain('aplicada à temporada passada')
  }, 60_000)

  it('as setas da temporada anterior andam pelas datas dela, levando a temporada', async () => {
    const html = await renderizarComo('GRATIS', `/resultados/${DIA_ANTERIOR}`, { temporada: TEMPORADA_ANTERIOR })
    // Só há um dia semeado: não há rodada anterior nem próxima dentro da temporada.
    expect(html).toContain('aria-label="Rodada anterior (indisponível)"')
    expect(html).toContain('aria-label="Próxima rodada (indisponível)"')
    // A Lista do dia é a da MESMA temporada, não a de hoje.
    expect(html).toContain(`href="/?temporada=${TEMPORADA_ANTERIOR}&amp;data=${DIA_ANTERIOR}"`)
  }, 60_000)

  it('a temporada do calendário segue com o corte do grátis de hoje — e a escolha fica nos links', async () => {
    const html = await renderizarComo('GRATIS', `/resultados/${HOJE}`, { temporada: '2025-26' })
    expect(html).not.toContain('aplicada à temporada passada')
    // O mesmo conteúdo do caminho sem o parâmetro: nada muda para a temporada atual.
    nivelDoTeste = 'GRATIS'
    try {
      expect(texto(html)).toBe(texto(await renderizar(HOJE)))
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
    // Escolhida no seletor, ela viaja nas abas, setas e no formulário (fix round 1).
    expect(html).toContain(`href="/resultados/${HOJE}?estrategia=LISTA_SECRETA&amp;temporada=2025-26"`)
    expect(html).toContain('name="temporada" value="2025-26"')
  }, 60_000)

  it('?temporada=lixo cai na exibida sem erro', async () => {
    await expect(renderizarComo('MVP', '/resultados', { temporada: 'lixo' })).resolves.toBeTruthy()
    expect(await renderizarComo('MVP', '/resultados', { temporada: 'lixo' })).toBe(
      `https://nip.test/resultados/${ONTEM}`,
    )
    const html = await renderizarComo('GRATIS', `/resultados/${ONTEM}`, { temporada: 'lixo' })
    expect(html).not.toContain('aplicada à temporada passada')
  }, 60_000)

  it('/resultados?temporada=<anterior> leva à última rodada daquela temporada', async () => {
    expect(await renderizarComo('GRATIS', '/resultados', { temporada: TEMPORADA_ANTERIOR })).toBe(
      `https://nip.test/resultados/${DIA_ANTERIOR}?temporada=${TEMPORADA_ANTERIOR}`,
    )
  }, 60_000)
})

// ===========================================================================
// O PADRÃO COM A EXIBIDA ATRASADA (fix round 1): hiato × noite de estreia
// ===========================================================================

describe('Resultados do v2 — padrão da temporada com o calendário em 2026-27', () => {
  /** Dentro do hiato: o calendário já virou para 2026-27, nenhum jogo dela ainda. */
  const HIATO = new Date('2026-10-02T18:00:00.000Z')
  const DIA_DO_HIATO = '2026-10-02'
  /** Noite de estreia: jogo de 2026-27 agendado para hoje, nenhum encerrado. */
  const ESTREIA = new Date('2026-10-21T21:00:00.000Z')
  const DIA_DA_ESTREIA = '2026-10-21'
  /** Um dia de 2025-26 fora da janela simulada, com apito retroativo. */
  const DIA_2025 = '2025-11-04'

  async function destino(busca: Busca, nivel: NivelDoPlano = 'GRATIS'): Promise<string> {
    nivelDoTeste = nivel
    try {
      const { GET } = await import('@/app/(app)/resultados/route')
      const url = new URL('https://nip.test/resultados')
      for (const [k, v] of Object.entries(busca)) if (typeof v === 'string') url.searchParams.set(k, v)
      return (await GET(new NextRequest(url))).headers.get('location') ?? ''
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  }

  async function renderizarGratis(data: string, busca: Busca = {}): Promise<string> {
    nivelDoTeste = 'GRATIS'
    try {
      return await renderizar(data, busca)
    } finally {
      nivelDoTeste = 'ALL_STAR'
    }
  }

  beforeAll(async () => {
    const { semearDiaAnterior } = await import('@/modules/entrega/retroativo/__tests__/semente-tela')
    await semearDiaAnterior(banco.db, await rulesetAtivo(), DIA_2025)
  }, 60_000)

  it('(a) no hiato, sem parâmetro, /resultados abre a última rodada da temporada anterior', async () => {
    vi.setSystemTime(HIATO)
    try {
      expect(await destino({})).toBe(`https://nip.test/resultados/${DIA_2025}?temporada=2025-26`)
      // (d) lixo e parâmetro repetido são o mesmo que nenhum.
      expect(await destino({ temporada: 'lixo' })).toBe(await destino({}))
      expect(await destino({ temporada: '1999-00' })).toBe(await destino({}))
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('(c) no hiato, escolher 2026-27 é o caminho de hoje — e a escolha fica no destino e nos links', async () => {
    vi.setSystemTime(HIATO)
    try {
      const alvo = await destino({ temporada: '2026-27' })
      expect(alvo).toContain('temporada=2026-27')
      expect(alvo).not.toContain(DIA_2025)
      const html = await renderizarGratis(DIA_DO_HIATO, { temporada: '2026-27' })
      expect(html).not.toContain('aplicada à temporada passada')
      expect(html).toContain(`href="/resultados/${DIA_DO_HIATO}?estrategia=LISTA_SECRETA&amp;temporada=2026-27"`)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('(d) no hiato, lixo numa rodada datada é o mesmo que nenhum parâmetro — não um vazio retroativo', async () => {
    vi.setSystemTime(HIATO)
    try {
      const semParametro = await renderizarGratis(DIA_DO_HIATO)
      expect(semParametro).not.toContain('aplicada à temporada passada')
      expect(semParametro).not.toContain('Sem apitos neste dia')
      expect(await renderizarGratis(DIA_DO_HIATO, { temporada: 'lixo' })).toBe(semParametro)
      expect(await renderizarGratis(DIA_DO_HIATO, { temporada: ['2025-26', '2026-27'] })).toBe(semParametro)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('(b) na noite de estreia, sem parâmetro, /resultados é o atalho de hoje — nunca a temporada passada', async () => {
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
    vi.setSystemTime(ESTREIA)
    try {
      const alvo = await destino({})
      expect(alvo).not.toContain('temporada=')
      expect(alvo).not.toContain(DIA_2025)
      expect(await destino({ temporada: 'lixo' })).toBe(alvo)
      // A rodada da estreia, sem parâmetro, é a do calendário.
      expect(await renderizarGratis(DIA_DA_ESTREIA)).not.toContain('aplicada à temporada passada')
    } finally {
      vi.setSystemTime(AGORA)
      await banco.db.delete(jogos).where(eq(jogos.id, jogo!.id))
    }
  }, 60_000)
})
