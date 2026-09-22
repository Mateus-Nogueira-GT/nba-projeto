import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { classificacao, jogos, times } from '../../modules/dominio/db/schema'

/**
 * O DEFEITO QUE NÃO DÁ ERRO (spec 22/09, §5.2).
 *
 * O lançamento é ~02/10/2026 e a NBA só volta ~03/11. Nessa janela
 * `temporadaDe` já devolve "2026-27" — uma temporada com zero jogos — enquanto
 * todo o dado real do banco é de 2025-26. O backfill pode funcionar
 * perfeitamente e o assinante ver tela vazia, sem uma exceção sequer.
 *
 * Este arquivo existe para tornar esse desfecho impossível: o relógio fica na
 * janela do hiato e a tela precisa mostrar a temporada que TEM dado.
 *
 * Regra de ouro dos testes de tela: nenhuma asserção nomeia time ou número.
 * O sujeito é lido do banco e a afirmação é sobre ele.
 */

/** Dentro do hiato: o calendário já virou, a bola ainda não subiu. */
const LANCAMENTO = new Date('2026-10-02T18:00:00.000Z')
/** Depois da primeira bola da temporada nova. */
const DEPOIS_DA_VIRADA = new Date('2026-11-04T18:00:00.000Z')

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let siglas: string[]

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO_DEMO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
})
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
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

  // O banco tem SÓ a temporada 2025-26: é o retrato do dia do lançamento,
  // depois do backfill e antes da primeira bola da 2026-27.
  await banco.db.insert(jogos).values(
    Array.from({ length: 12 }, (_, i) => ({
      timeCasaId: criados[i % 2]!.id,
      timeVisitanteId: criados[2 + (i % 2)]!.id,
      dataHoraUtc: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T23:00:00Z`),
      dataReferencia: `2026-03-${String(i + 1).padStart(2, '0')}`,
      status: 'ENCERRADO' as const,
    })),
  )
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

  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  vi.useFakeTimers({ toFake: ['Date'] })
}, 120_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarIndice(): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

it('no dia do lançamento a tela mostra a temporada que TEM dado, não a do calendário', async () => {
  vi.setSystemTime(LANCAMENTO)

  const visivel = texto(await renderizarIndice())

  // Todos os times classificados aparecem: a classificação de 2025-26 foi
  // encontrada mesmo com o calendário já apontando para 2026-27.
  for (const sigla of siglas) {
    expect(visivel, `o time ${sigla} sumiu da classificação no dia do lançamento`).toContain(sigla)
  }
})

it('a tela DIZ qual temporada está mostrando', async () => {
  vi.setSystemTime(LANCAMENTO)

  const visivel = texto(await renderizarIndice())

  // Sem isto o assinante lê média de 2025-26 achando que é de hoje.
  expect(visivel).toContain('2025-26')
})

/**
 * O HIATO NAS TELAS DE APITO.
 *
 * Por decisão do parceiro não há apito retroativo, então Lista e Ao Vivo ficam
 * vazias por ~32 dias. O que elas NÃO podem fazer é repetir "sem jogos hoje" —
 * o mesmo texto de uma terça-feira de folga — porque por um mês seguido isso
 * lê como app quebrado.
 */
it('a Lista explica o hiato em vez de dizer apenas "sem jogos hoje"', async () => {
  vi.setSystemTime(LANCAMENTO)

  const { default: Home } = await import('../(app)/page')
  const visivel = texto(
    renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) })),
  )

  expect(visivel).toContain('A temporada ainda não começou')
  expect(visivel).not.toContain('Sem jogos hoje')
  // E aponta a saída: a aba que tem conteúdo de verdade.
  expect(visivel).toContain('STATS')
})

it('no hiato a Lista não promete data que o banco não tem', async () => {
  vi.setSystemTime(LANCAMENTO)

  const { default: Home } = await import('../(app)/page')
  const visivel = texto(
    renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) })),
  )

  // Sem jogo AGENDADO no banco, nada de "volta em novembro": inventar data é
  // inventar fato (regra 3 do CLAUDE.md).
  expect(visivel).toContain('entre temporadas')
  expect(visivel).not.toMatch(/volta em \d/)
})

it('o Ao Vivo também explica o hiato, em vez do texto de folga de terça-feira', async () => {
  vi.setSystemTime(LANCAMENTO)

  const { default: FireLive } = await import('../(app)/fire-live/page')
  const visivel = texto(
    renderToStaticMarkup(await FireLive({ searchParams: Promise.resolve({}) })),
  )

  expect(visivel).toContain('A temporada ainda não começou')
  expect(visivel).not.toContain('A NBA não tem partidas hoje')
})

// ÚLTIMO do arquivo de propósito: insere o jogo que encerra o hiato, e a
// partir daí o banco não serve mais para testar a janela do lançamento.
it('depois da primeira bola, a tela vira sozinha para a temporada nova', async () => {
  await banco.db.insert(jogos).values({
    timeCasaId: (await banco.db.select().from(times))[0]!.id,
    timeVisitanteId: (await banco.db.select().from(times))[2]!.id,
    dataHoraUtc: new Date('2026-11-03T23:00:00Z'),
    dataReferencia: '2026-11-03',
    status: 'ENCERRADO' as const,
  })
  vi.setSystemTime(DEPOIS_DA_VIRADA)

  const visivel = texto(await renderizarIndice())

  // Nenhum deploy, nenhuma edição de ruleset: um jogo encerrado bastou.
  expect(visivel).toContain('2026-27')
})
