import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
import { registrarEntradaRealizada } from '../../modules/entrega/gestao-realizadas'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import type { ItemFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * A GESTÃO DE PONTA A PONTA, SEM NAVEGADOR — sobre 49 dias de temporada
 * simulada (~315 partidas) e duas contas com cortesia REAL.
 *
 * Cada caso é o que o navegador faria: a AÇÃO de verdade, o destino do
 * redirect lido do `digest`, e a PÁGINA de verdade renderizada com esse
 * destino. Nenhuma asserção nomeia jogador: o sujeito vem do feed.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioA: string
let usuarioB: string
let itens: ItemFeed[]
let sessao: { usuarioId: string; email: string; dispositivoId: string | null } | null = null

vi.mock('../../modules/plataforma/auth/cookies', () => ({ sessaoAtual: async () => sessao }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))

async function contaComCortesia(email: string): Promise<string> {
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email, senhaHash: 'x', metodologiaAceitaEm: new Date('2026-01-01T00:00:00.000Z') })
    .returning({ id: usuarios.id })
  await concederCortesia(banco.db, {
    usuarioId: u!.id,
    referencia: `cortesia:${email}`,
    inicio: AGORA,
    fim: null,
    nivelDoPlano: 'ALL_STAR',
  })
  return u!.id
}

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 49, llm: new LLMFake() })
  usuarioA = await contaComCortesia('a@teste.com')
  usuarioB = await contaComCortesia('b@teste.com')
  const feed = await lerFeed(banco.db, HOJE)
  itens = feed!.conteudo.itens.filter((i) => i.linha !== null)
  expect(itens.length).toBeGreaterThanOrEqual(4) // os casos abaixo usam quatro itens distintos
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 360_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

const como = (usuarioId: string, email: string) => {
  sessao = { usuarioId, email, dispositivoId: null }
}

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

const semEntidades = (t: string) =>
  t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const textoDaTela = (html: string) => semEntidades(html.replace(/<[^>]+>/g, ''))

function formulario(item: ItemFeed, unidades: string, odd: string): FormData {
  const f = new FormData()
  f.set('dataReferencia', HOJE)
  f.set('jogadorId', item.jogadorId)
  f.set('atributo', item.atributo)
  f.set('linha', String(item.linha))
  f.set('unidades', unidades)
  f.set('odd', odd)
  return f
}

async function acionar(f: FormData): Promise<string> {
  const { registrarEntrada } = await import('../(app)/gestao/acoes')
  try {
    await registrarEntrada(f)
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    // O `digest` do redirect do Next carrega o destino depois do último ';'
    // — é o que a tela receberia como URL.
    return digest.split(';').find((p) => p.startsWith('/')) ?? digest
  }
  throw new Error('registrarEntrada devia ter redirecionado')
}

const linhasDe = (usuarioId: string) =>
  banco.db.select().from(entradasRealizadas).where(eq(entradasRealizadas.usuarioId, usuarioId))

describe('registrar → redirecionar → ver', () => {
  it('entrada válida: redireciona para Realizadas, e ela mostra o que foi digitado', async () => {
    como(usuarioA, 'a@teste.com')
    const destino = await acionar(formulario(itens[0]!, '1.5', '1.62'))
    expect(destino).toContain('/gestao?ver=realizadas')

    const html = await renderizar({ ver: 'realizadas' })
    const texto = textoDaTela(html)
    expect(texto).toContain(itens[0]!.nome)
    expect(texto).toContain('1.5 unidades')
    expect(texto).toContain('odd 1.62')

    const linhas = await linhasDe(usuarioA)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ unidades: '1.50', odd: '1.62', dataReferencia: HOJE })
  })

  it('registrar DE NOVO a mesma linha atualiza: uma entrada, valores novos', async () => {
    como(usuarioA, 'a@teste.com')
    await acionar(formulario(itens[0]!, '3', '2.10'))

    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto).toContain('3 unidades')
    expect(texto).toContain('odd 2.10')
    expect(texto).not.toContain('1.5 unidades')

    const linhas = await linhasDe(usuarioA)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ unidades: '3.00', odd: '2.10' })
  })

  it('inválido: vai para ?erro=, a tela traduz o código, e o banco não muda', async () => {
    como(usuarioA, 'a@teste.com')
    const antes = await linhasDe(usuarioA)
    const destino = await acionar(formulario(itens[1]!, '0', '1.9'))
    expect(destino).toContain('/gestao?erro=entrada-invalida')

    const html = await renderizar({ erro: 'entrada-invalida' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Confira unidades e odd.')
    expect(await linhasDe(usuarioA)).toHaveLength(antes.length)
  })
})

describe('o que a visão Realizadas NÃO mostra', () => {
  it('entrada de ONTEM não aparece hoje', async () => {
    como(usuarioA, 'a@teste.com')
    await registrarEntradaRealizada(banco.db, {
      usuarioId: usuarioA,
      dataReferencia: somarDias(HOJE, -1),
      jogadorId: itens[2]!.jogadorId,
      atributo: itens[2]!.atributo,
      linha: itens[2]!.linha!,
      unidades: 9.5,
      odd: null,
      agora: AGORA,
    })
    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto).not.toContain('9.5 unidades')
  })

  it('a entrada de OUTRO usuário não aparece — e aparece para ele', async () => {
    como(usuarioB, 'b@teste.com')
    await acionar(formulario(itens[3]!, '7.5', ''))
    expect(textoDaTela(await renderizar({ ver: 'realizadas' }))).toContain('7.5 unidades')

    como(usuarioA, 'a@teste.com')
    expect(textoDaTela(await renderizar({ ver: 'realizadas' }))).not.toContain('7.5 unidades')
  })

  it('N entradas saem da mais recente para a mais antiga', async () => {
    como(usuarioB, 'b@teste.com')
    // Três JOGADORES distintos, não três itens: o feed traz um item por linha
    // (15+, 20+, 25+ do mesmo jogador), e a entrada realizada se reconhece na
    // tela pelo nome — três linhas do mesmo jogador dariam o mesmo `indexOf`.
    const umPorJogador = [...new Map(itens.map((i) => [i.jogadorId, i])).values()]
    const [p, q, r] = [umPorJogador[0]!, umPorJogador[1]!, umPorJogador[2]!]
    for (const [i, item] of [p, q, r].entries()) {
      await registrarEntradaRealizada(banco.db, {
        usuarioId: usuarioB,
        dataReferencia: HOJE,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha!,
        unidades: 1,
        odd: null,
        agora: new Date(AGORA.getTime() + (i + 1) * 60_000),
      })
    }
    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto.indexOf(r.nome)).toBeLessThan(texto.indexOf(q.nome))
    expect(texto.indexOf(q.nome)).toBeLessThan(texto.indexOf(p.nome))
  })
})

describe('banca', () => {
  it('inválida cai no padrão de R$ 1.000, sem NaN', async () => {
    como(usuarioA, 'a@teste.com')
    for (const banca of ['abc', '0', '-5']) {
      const html = await renderizar({ banca })
      expect(html).not.toContain('NaN')
      expect(html).toMatch(/aria-current="page"[^>]*>R\$\s?1\.000,00</)
    }
  })

  it('R$ 500 muda a unidade, os limites e as entradas, e marca o chip', async () => {
    como(usuarioA, 'a@teste.com')
    const padrao = await renderizar({ banca: '1000' })
    const html = await renderizar({ banca: '500' })
    expect(html).toMatch(/aria-current="page"[^>]*>R\$\s?500,00</)
    expect(html).not.toMatch(/aria-current="page"[^>]*>R\$\s?1\.000,00</)

    // O valor que vem logo depois de cada rótulo, e a exposição total (a soma
    // das entradas dos cards). Compara as duas bancas em vez de cravar número:
    // o `gestao_banca` do ruleset é de demonstração e vai mudar, e "R$ 5,00"
    // solto na página também é o valor de um card — não provava a unidade.
    const valor = (h: string, rotulo: string) =>
      h.match(new RegExp(`>${rotulo}</p><p[^>]*>([^<]+)<`))?.[1]
    const exposicao = (h: string) => textoDaTela(h).match(/exposição total de ([^(]+)\(/)?.[1]?.trim()
    for (const rotulo of ['1 unidade', 'Teto por entrada', 'Parar no lucro', 'Parar no prejuízo']) {
      const antes = valor(padrao, rotulo)
      const depois = valor(html, rotulo)
      expect(depois, rotulo).toMatch(/R\$/)
      expect(depois, rotulo).not.toBe(antes)
    }
    expect(exposicao(html)).toMatch(/R\$/)
    expect(exposicao(html)).not.toBe(exposicao(padrao))
  })
})
