import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  casas,
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  mediasJogador,
  niveis,
  niveisVersao,
  oddsSnapshot,
  times,
} from '../../modules/dominio/db/schema'
import { materializarFeedFireLive } from '../../modules/entrega/fire-live/feed'
import { linhasDoJogador, publicarListaSecreta } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'

const RODADA = '2026-01-15'
const ANTES = new Date('2026-01-16T02:58:00Z')
const DEPOIS = new Date('2026-01-16T03:02:00Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let antes: string
let depois: string

// A página, suas leituras e ambos os snapshots são reais. Só os limites de
// sessão/acesso, conexão e relógio são substituídos, como em telas-04-detalhe.
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
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

async function renderizar(agora: Date): Promise<string> {
  vi.setSystemTime(agora)
  const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
  return renderToStaticMarkup(
    await Pagina({
      params: Promise.resolve({ jogadorId }),
      searchParams: Promise.resolve({ atributo: 'PONTOS' }),
    }),
  )
}

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Seções reais para isolar a nota do hero e a régua do gráfico. */
function trecho(html: string, inicio: string, fim: string): string {
  const de = html.indexOf(inicio)
  const ate = html.indexOf(fim, de + inicio.length)
  expect(de, inicio).toBeGreaterThan(-1)
  expect(ate, fim).toBeGreaterThan(de)
  return html.slice(de, ate)
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://demo')
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
    .values({
      nomeCompleto: 'Jogador de Meia-Noite',
      timeId: casa!.id,
    })
    .returning()
  jogadorId = jogador!.id
  const [versao] = await banco.db
    .insert(niveisVersao)
    .values({
      versao: 'meia-noite',
      ativa: true,
    })
    .returning()
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
  await banco.db.insert(estatisticasJogo).values({
    jogadorId,
    jogoId: historico!.id,
    pontos: 20,
    minutos: '30',
  })
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
  await banco.db
    .update(jogos)
    .set({ status: 'AO_VIVO', quartoAtual: 1 })
    .where(eq(jogos.id, jogo!.id))
  await banco.db.insert(estatisticasQuarto).values({
    jogoId: jogo!.id,
    jogadorId,
    quarto: 1,
    pontos: 11,
    minutos: '8',
  })
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
  expect(await materializarFeedFireLive(banco.db, ruleset, jogo!.id, ANTES)).toMatchObject({
    itens: 1,
  })

  vi.useFakeTimers({ toFake: ['Date'] })
  antes = await renderizar(ANTES)
  depois = await renderizar(DEPOIS)
})

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

describe('o mesmo apito atravessa a meia-noite durante o 1º quarto', () => {
  it('mantém o Fire Live antes e depois da virada', () => {
    expect(texto(antes)).toContain('1º QUARTO')
    expect(texto(depois)).toContain('1º QUARTO')
  })

  it('preserva a linha e a nota pré-live do hero', () => {
    const heroAntes = texto(trecho(antes, 'LISTA SECRETA · PRÉ-LIVE', '1º QUARTO'))
    expect(heroAntes).toContain('PONTOS 20+')
    expect(heroAntes).toMatch(/\b95\b/)
    expect(texto(depois)).toContain('LISTA SECRETA · PRÉ-LIVE')
    const heroDepois = texto(trecho(depois, 'LISTA SECRETA · PRÉ-LIVE', '1º QUARTO'))
    expect(heroDepois).toContain('PONTOS 20+')
    expect(heroDepois).toMatch(/\b95\b/)
  })

  it('preserva a tabela das linhas e casas do mesmo jogo', () => {
    const tabelaAntes = antes.match(/<table\b[\s\S]*?<\/table>/)?.[0]
    expect(tabelaAntes).toBeDefined()
    expect(texto(tabelaAntes!)).toContain('Casa de teste')
    const tabelaDepois = depois.match(/<table\b[\s\S]*?<\/table>/)?.[0]
    expect(tabelaDepois).toBe(tabelaAntes)
  })

  it('preserva a régua e a conferência do histórico contra a linha pré-live', () => {
    const graficoAntes = trecho(antes, 'FORMA NO ATRIBUTO', 'COMPARAÇÃO')
    expect(texto(graficoAntes)).toContain('LINHA 20+')
    expect(graficoAntes).toContain('aria-label="bateu 1 de 1.')
    const graficoDepois = trecho(depois, 'FORMA NO ATRIBUTO', 'COMPARAÇÃO')
    expect(texto(graficoDepois)).toContain('LINHA 20+')
    expect(graficoDepois).toContain('aria-label="bateu 1 de 1.')
  })
})
