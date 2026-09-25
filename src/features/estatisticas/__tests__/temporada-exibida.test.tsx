import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { classificacao, estatisticasJogo, jogadores, jogos, times, usuarios } from '@/modules/dominio/db/schema'

/**
 * O DEFEITO QUE NÃO DÁ ERRO (spec 22/09, §5.2) — nas telas de estatísticas do v2.
 *
 * O lançamento é ~02/10/2026 e a NBA só volta ~03/11. Nessa janela
 * `temporadaDe` já devolve "2026-27" — uma temporada com zero jogos — enquanto
 * todo o dado real do banco é de 2025-26. O v2 lia a temporada do CALENDÁRIO:
 * o backfill podia funcionar perfeitamente e o assinante ver tela vazia, sem
 * uma exceção sequer. As telas passam por `temporadaParaExibirCacheada`.
 *
 * Herdado de `telas-06-temporada-exibida.test.ts` (aposentado com a tela
 * antiga). Os casos da Lista e do Ao Vivo no hiato moram nas fumaças deles.
 *
 * Regra de ouro dos testes de tela: nenhuma asserção nomeia time ou número.
 */

/** Dentro do hiato: o calendário já virou, a bola ainda não subiu. */
const LANCAMENTO = new Date('2026-10-02T18:00:00.000Z')
/** Depois da primeira bola da temporada nova. */
const DEPOIS_DA_VIRADA = new Date('2026-11-04T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let siglas: string[]
let timeId: string
let jogadorId: string

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('MVP') }
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
    usePathname: () => '/estatisticas',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()

  const criados = await banco.db
    .insert(times)
    .values([
      { sigla: 'AAA', nome: 'Alfa', conferencia: 'East' },
      { sigla: 'BBB', nome: 'Beta', conferencia: 'East' },
      { sigla: 'CCC', nome: 'Gama', conferencia: 'West' },
      { sigla: 'DDD', nome: 'Delta', conferencia: 'West' },
    ])
    .returning()
  siglas = criados.map((t) => t.sigla)
  timeId = criados[0]!.id

  // O banco tem SÓ a temporada 2025-26: o retrato do dia do lançamento,
  // depois do backfill e antes da primeira bola da 2026-27.
  const partidas = await banco.db
    .insert(jogos)
    .values(
      Array.from({ length: 12 }, (_, i) => ({
        timeCasaId: criados[i % 2]!.id,
        timeVisitanteId: criados[2 + (i % 2)]!.id,
        dataHoraUtc: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T23:00:00Z`),
        dataReferencia: `2026-03-${String(i + 1).padStart(2, '0')}`,
        status: 'ENCERRADO' as const,
        placarCasa: 100 + i,
        placarVisitante: 90 + i,
      })),
    )
    .returning()
  await banco.db.insert(classificacao).values(
    criados.map((t, i) => ({
      temporada: '2025-26',
      timeId: t.id,
      conferencia: t.conferencia,
      vitorias: 50 - i * 5,
      derrotas: 32 + i * 5,
      posicao: i + 1,
    })),
  )

  // Um jogador do mandante com uma partida registrada — o perfil tem o que mostrar.
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Atleta da temporada passada', timeId })
    .returning()
  jogadorId = jogador!.id
  await banco.db.insert(estatisticasJogo).values({
    jogoId: partidas[0]!.id,
    jogadorId,
    minutos: '30.00',
    pontos: 20,
    rebotesTotal: 5,
    assistencias: 4,
  })

  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  vi.useFakeTimers({ toFake: ['Date'] })
}, 120_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

const texto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
/**
 * O texto SEM o seletor de temporada (Task 10): o seletor oferece a do
 * calendário como opção — é o convite para trocar, não um rótulo de dado.
 */
const semSeletor = (html: string) => texto(html.replace(/<nav[^>]*aria-label="Temporada"[\s\S]*?<\/nav>/g, ''))

async function renderizarIndice(): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

it('(telas-06) no dia do lançamento o índice mostra a temporada que TEM dado, e diz qual é', async () => {
  vi.setSystemTime(LANCAMENTO)
  const visivel = texto(await renderizarIndice())
  for (const sigla of siglas) {
    expect(visivel, `o time ${sigla} sumiu da classificação no dia do lançamento`).toContain(sigla)
  }
  // Sem isto o assinante lê número de 2025-26 achando que é de hoje.
  expect(visivel).toContain('temporada 2025-26')
})

it('no hiato, o time mostra a campanha da temporada que TEM dado', async () => {
  vi.setSystemTime(LANCAMENTO)
  const { default: Pagina } = await import('@/app/(app)/estatisticas/time/[id]/page')
  const visivel = semSeletor(
    renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ id: timeId }), searchParams: Promise.resolve({}) }),
    ),
  )
  expect(visivel).toContain('temporada 2025-26')
  expect(visivel).not.toContain('2026-27')
  expect(visivel).not.toContain('Sem classificação registrada para esta temporada.')
})

it('no hiato, o jogador recortado por temporada mostra a temporada que TEM dado', async () => {
  vi.setSystemTime(LANCAMENTO)
  const { default: Pagina } = await import('@/app/(app)/estatisticas/jogador/[id]/page')
  const visivel = semSeletor(
    renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ id: jogadorId }),
        searchParams: Promise.resolve({ periodo: 'temporada' }),
      }),
    ),
  )
  expect(visivel).toContain('Temporada 2025-26 · 1 partida disponível')
  expect(visivel).not.toContain('2026-27')
})

it('as telas e os carregadores usam a versão CACHEADA da temporada exibida', async () => {
  const { readFileSync } = await import('node:fs')
  const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  for (const arquivo of ['indice', 'jogador', 'time']) {
    const fonte = semComentarios(readFileSync(`src/features/estatisticas/${arquivo}.ts`, 'utf8'))
    // Pela resolução comum da aba (Task 10), que lê o seletor pelo cache.
    expect(fonte, arquivo).toContain('temporadaDasEstatisticas(')
    // A temporada do CALENDÁRIO não decide o que a tela mostra.
    expect(fonte, arquivo).not.toMatch(/[^a-zA-Z]temporadaDe\(/)
  }
  const comum = semComentarios(readFileSync('src/features/estatisticas/temporada.ts', 'utf8'))
  expect(comum).toContain('temporadasDaTelaCacheadas(')
  // O padrão é a EXIBIDA: a URL só troca dentro das disponíveis.
  expect(comum).toContain('temporadaDaUrl(')
})

// ÚLTIMO do arquivo de propósito: insere o jogo que encerra o hiato.
it('(telas-06) depois da primeira bola, a tela vira sozinha para a temporada nova', async () => {
  const todos = await banco.db.select().from(times)
  await banco.db.insert(jogos).values({
    timeCasaId: todos[0]!.id,
    timeVisitanteId: todos[2]!.id,
    dataHoraUtc: new Date('2026-11-03T23:00:00Z'),
    dataReferencia: '2026-11-03',
    status: 'ENCERRADO' as const,
  })
  vi.setSystemTime(DEPOIS_DA_VIRADA)
  // Nenhum deploy, nenhuma edição de ruleset: um jogo encerrado bastou.
  expect(texto(await renderizarIndice())).toContain('2026-27')
})
