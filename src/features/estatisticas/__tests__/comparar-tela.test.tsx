import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogadores, jogos, times, usuarios } from '@/modules/dominio/db/schema'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

import { rotaDaComparacao } from '@/modules/entrega/estatisticas/rotas'
import { carregarComparacao } from '../comparar'
import { num } from '../regras'
import { LinhaComparada, TelaComparar } from '../TelaComparar'

/** Fumaça da tela de comparação: PGlite com a temporada simulada, mesmo preparo de `fumaca.test.tsx`. */
const AGORA = new Date('2026-01-15T18:00:00.000Z')
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
    usePathname: () => '/estatisticas/comparar',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db.insert(usuarios).values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' }).onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()`. Só `Date` — timers travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

async function renderizar(params: Record<string, string>) {
  const dados = await carregarComparacao(params)
  return renderToStaticMarkup(<TelaComparar dados={dados} />)
}

/** Dois jogadores distintos com linha de box na temporada simulada. */
async function doisJogadoresComHistorico() {
  const linhas = await banco.db
    .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
    .from(estatisticasJogo)
    .innerJoin(jogadores, eq(jogadores.id, estatisticasJogo.jogadorId))
    .limit(400)
  const unicos = [...new Map(linhas.map((l) => [l.id, l])).values()]
  expect(unicos.length).toBeGreaterThanOrEqual(2)
  return [unicos[0]!, unicos[unicos.length - 1]!] as const
}

/** Os dois times de um jogo encerrado: o confronto nunca fica vazio. */
async function doisTimesQueSeEnfrentaram() {
  const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.status, 'ENCERRADO')).limit(1)
  expect(jogo, 'a temporada simulada precisa de um jogo encerrado').toBeDefined()
  const [casa] = await banco.db.select().from(times).where(eq(times.id, jogo!.timeCasaId))
  const [fora] = await banco.db.select().from(times).where(eq(times.id, jogo!.timeVisitanteId))
  return [casa!, fora!] as const
}

/** Um jogador inserido à mão, sem nenhuma linha de box. */
async function jogadorSemPartidas() {
  const [j] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Zeca Sem Jogos' }).returning()
  return j!
}

describe('TelaComparar', () => {
  it('jogadores lado a lado: os dois nomes, as médias e a forma recente', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    const html = await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id })
    const t = texto(html)
    expect(t).toContain(j1.nome)
    expect(t).toContain(j2.nome)
    for (const rotulo of ['Pontos', 'Rebotes', 'Assistências', 'Minutos', 'FG%', '3P%', 'LL%', 'Roubos', 'Tocos', 'Erros'])
      expect(t).toContain(rotulo)
    expect(t).toContain('Forma recente')
    expect(html).toContain('data-vencedor=')
  })

  it('ordem trocada espelha a tela e o destaque de pontos fica com quem fez mais', async () => {
    // Um par com média de pontos diferente, senão não há destaque a provar.
    const todos = await banco.db.select({ id: jogadores.id, nome: jogadores.nomeCompleto }).from(estatisticasJogo)
      .innerJoin(jogadores, eq(jogadores.id, estatisticasJogo.jogadorId)).limit(400)
    const unicos = [...new Map(todos.map((l) => [l.id, l])).values()]
    let par: { j1: (typeof unicos)[number]; j2: (typeof unicos)[number]; p1: number; p2: number } | null = null
    for (const j2 of unicos.slice(1)) {
      const d = await carregarComparacao({ tipo: 'jogador', a: unicos[0]!.id, b: j2.id })
      if (d.modo !== 'comparacao' || d.tipo !== 'jogador') continue
      const p1 = d.a.tela.perfilNumeros.ataque.pontos
      const p2 = d.b.tela.perfilNumeros.ataque.pontos
      if (p1 !== null && p2 !== null && p1 !== p2) {
        par = { j1: unicos[0]!, j2, p1, p2 }
        break
      }
    }
    expect(par, 'a temporada simulada precisa de dois jogadores com médias de pontos diferentes').not.toBeNull()
    const { j1, j2, p1, p2 } = par!
    const vencedorEsperado = p1 > p2 ? j1.nome : j2.nome
    const escapar = (n: string) => n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
    // No HTML cru: o destaque da linha "Pontos" e o nome do cabeçalho do mesmo lado.
    const nomeDoDestaque = (html: string) => {
      const lado = html.match(/<li class="[^"]*" data-vencedor="([ab])">(?:(?!<\/li>)[^])*?>Pontos</)?.[1]
      expect(lado, 'a linha de pontos precisa de destaque').toBeDefined()
      return html.match(new RegExp(`data-lado="${lado}"[^]*?<strong>([^<]*)</strong>`))?.[1]
    }
    const ab = await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id })
    const ba = await renderizar({ tipo: 'jogador', a: j2.id, b: j1.id })
    expect(nomeDoDestaque(ab)).toBe(escapar(vencedorEsperado))
    expect(nomeDoDestaque(ba)).toBe(escapar(vencedorEsperado))
  })

  it('times: campanha, médias, saldo e quem venceu cada jogo entre eles', async () => {
    const [t1, t2] = await doisTimesQueSeEnfrentaram()
    const dados = await carregarComparacao({ tipo: 'time', a: t1.id, b: t2.id })
    if (dados.modo !== 'comparacao' || dados.tipo !== 'time') throw new Error('modo errado')
    const html = renderToStaticMarkup(<TelaComparar dados={dados} />)
    const t = texto(html)
    expect(t).toContain('Pontos marcados')
    expect(t).toContain('Pontos cedidos')
    expect(t).toContain('Jogos entre eles')
    expect(dados.confrontos.jogos.length).toBeGreaterThan(0)
    // O saldo, com os números reais do par.
    expect(t).toContain(`${t1.sigla} ${dados.confrontos.vitoriasA} × ${dados.confrontos.vitoriasB} ${t2.sigla}`)
    // Um jogo conhecido: placar e vencedor explícito (negrito + texto), não só cor.
    const j = dados.confrontos.jogos[0]!
    expect(t).toContain(`${j.siglaCasa} ${j.placarCasa}–${j.placarVisitante} ${j.siglaVisitante}`)
    const vencedor = j.placarCasa! > j.placarVisitante! ? j.siglaCasa : j.siglaVisitante
    expect(html).toContain(`<strong>${vencedor}</strong>`)
    expect(t).toContain(`vitória de ${vencedor}`)
  })

  it('grátis na temporada atual: silhueta e nenhum número pago no HTML', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const [j1, j2] = await doisJogadoresComHistorico()
      const dados = await carregarComparacao({ tipo: 'jogador', a: j1.id, b: j2.id })
      if (dados.modo !== 'comparacao' || dados.tipo !== 'jogador') throw new Error('modo errado')
      expect(dados.profundidade).toBe(false)
      const html = renderToStaticMarkup(<TelaComparar dados={dados} />)
      expect(texto(html)).toContain('Ver planos')
      expect(texto(html)).toContain(j1.nome)
      expect(html).not.toContain('data-vencedor=')
      expect(html).not.toContain('Forma recente')
      // Números pagos que o carregador de fato trouxe: nenhum chega ao HTML.
      const pontos = dados.a.tela.perfilNumeros.ataque.pontos
      expect(pontos).not.toBeNull()
      expect(texto(html)).not.toContain(num(pontos))
      expect(dados.a.tela.historico.length).toBeGreaterThan(0)
      expect(html).not.toContain(dados.a.tela.historico[0]!.jogoId)
    } finally {
      nivelDoTeste = 'MVP'
    }
  })

  it('jogador sem partida no recorte: aviso dos dois lados, sem NaN', async () => {
    const semJogo = await jogadorSemPartidas()
    const [j1] = await doisJogadoresComHistorico()
    const t = texto(await renderizar({ tipo: 'jogador', a: semJogo.id, b: j1.id }))
    expect(t).toContain('Nenhuma partida disponível neste recorte')
    expect(t).not.toContain('NaN')
  })

  it('dois jogadores sem partida: o aviso aparece dos dois lados, sem NaN', async () => {
    const [x] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Xavier Sem Jogos' }).returning()
    const [y] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Yuri Sem Jogos' }).returning()
    const t = texto(await renderizar({ tipo: 'jogador', a: x!.id, b: y!.id }))
    expect(t.split('Nenhuma partida disponível neste recorte').length - 1).toBe(2)
    expect(t).not.toContain('NaN')
  })

  it('sem b: a escolha do segundo com a busca', async () => {
    const [j1] = await doisJogadoresComHistorico()
    const html = await renderizar({ tipo: 'jogador', a: j1.id })
    expect(texto(html)).toContain('Comparar com')
    // O "Buscar jogador" é o placeholder do campo: atributo, não texto.
    expect(html).toContain('placeholder="Buscar jogador"')
  })

  it('forma recente: os três períodos, com b e a temporada preservados', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    const html = await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id, periodo: '5' })
    // O href no HTML tem "&" escapado.
    const href = (r: string) => `href="${r.replace(/&/g, '&amp;')}"`
    for (const periodo of ['5', '10', 'temporada'] as const)
      expect(html).toContain(href(rotaDaComparacao('jogador', j1.id, j2.id, { periodo })))
    // Os dois gráficos têm legenda com o nome de cada jogador.
    expect(html).toMatch(new RegExp(`<figcaption[^>]*>${j1.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</figcaption>`))
    // Com temporada escolhida, o seletor de período a carrega; o de temporada carrega o período.
    const comTemporada = await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id, periodo: '5', temporada: '2025-26' })
    expect(comTemporada).toContain(href(rotaDaComparacao('jogador', j1.id, j2.id, { periodo: 'temporada', temporada: '2025-26' })))
  })

  it('o seletor de temporada preserva o período', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    const dados = await carregarComparacao({ tipo: 'jogador', a: j1.id, b: j2.id, periodo: '5' })
    const html = renderToStaticMarkup(<TelaComparar dados={dados} />)
    for (const t of dados.seletor.disponiveis.filter((t) => t !== dados.seletor.temporada))
      expect(html).toContain(`href="${rotaDaComparacao('jogador', j1.id, j2.id, { periodo: '5', temporada: t }).replace(/&/g, '&amp;')}"`)
  })

  it('"(melhor)" para leitor de tela: só do lado vencedor, nunca no empate', () => {
    const linha = (a: number | null, b: number | null, menorEhMelhor?: boolean) =>
      renderToStaticMarkup(<LinhaComparada l={{ rotulo: 'X', a, b, formato: num, ...(menorEhMelhor ? { menorEhMelhor } : {}) }} />)
    const ladoComMelhor = (html: string) =>
      [...html.matchAll(/data-lado="([ab])"[^>]*>((?:(?!<\/span><span class="[^"]*" data-lado)[^])*)/g)]
        .filter((m) => m[2]!.includes('(melhor)'))
        .map((m) => m[1])
    expect(ladoComMelhor(linha(20, 10))).toEqual(['a'])
    expect(ladoComMelhor(linha(10, 20))).toEqual(['b'])
    expect(ladoComMelhor(linha(3, 1, true))).toEqual(['b'])
    expect(linha(15, 15)).not.toContain('(melhor)')
    expect(linha(20, 10).split('(melhor)').length - 1).toBe(1)
    expect(linha(20, 10)).toContain('class="so-leitor"')
  })

  it('times: a seção de médias diz de quantos jogos encerrados elas saem', async () => {
    const [t1, t2] = await doisTimesQueSeEnfrentaram()
    const dados = await carregarComparacao({ tipo: 'time', a: t1.id, b: t2.id })
    if (dados.modo !== 'comparacao' || dados.tipo !== 'time') throw new Error('modo errado')
    expect(dados.a.medias.jogos).toBeGreaterThan(0)
    expect(texto(renderToStaticMarkup(<TelaComparar dados={dados} />))).toMatch(/médias por jogo dos últimos \d+ jogos? encerrados?/)
  })

  it('nunca escreve "probabilidade"', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    expect(texto(await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id })).toLowerCase()).not.toContain('probabilidade')
  })
})
