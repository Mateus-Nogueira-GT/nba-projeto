import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import * as schema from '../../../dominio/db/schema'
import type { Db } from '../../../dominio/db/tipos'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import { recapDaNoite, taxaDaTemporada } from '../../resultados'
import { executarDiaRetroativo } from '../executar'
import {
  datasRetroativas,
  feedRetroativoDoDia,
  fireLiveRetroativo,
  greensRetroativosDoDia,
  recapRetroativo,
} from '../leitura'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const MIL = '00000000-0000-4000-8000-000000000001'
const MIA = '00000000-0000-4000-8000-000000000002'
const BOS = '00000000-0000-4000-8000-000000000003'
const GIANNIS = '00000000-0000-4000-8000-0000000000a1'
const LILLARD = '00000000-0000-4000-8000-0000000000a2'
const VERSAO = '00000000-0000-4000-8000-0000000000b1'
const JOGO_01 = '00000000-0000-4000-8000-0000000000c1'
const JOGO_02 = '00000000-0000-4000-8000-0000000000c2'
const JOGO_03 = '00000000-0000-4000-8000-0000000000c3'
const JOGO_DIA = '00000000-0000-4000-8000-0000000000c4'
const DIA = '2025-11-04'
/**
 * O relógio de quem roda o script: DEPOIS que 2025-26 acabou. Sem ele, o
 * teste dependeria da data real — até 30/09/2026 a temporada do calendário
 * ainda é 2025-26, e o executor (com razão) a recusa.
 */
const DEPOIS = new Date('2026-11-15T12:00:00Z')
const TEMPORADA = '2025-26'

function jogoEm(id: string, dia: string) {
  return {
    id,
    timeCasaId: MIL,
    timeVisitanteId: BOS,
    status: 'ENCERRADO' as const,
    dataReferencia: dia,
    dataHoraUtc: new Date(`${dia}T23:30:00Z`),
  }
}

function linha(jogoId: string, jogadorId: string, pontos: number) {
  return { jogoId, jogadorId, timeId: MIL, pontos, minutos: '30', rebotesTotal: 5, assistencias: 3 }
}

/**
 * A semente de `executar.test.ts`: a lista do CJ projeta os dois no Miami, em
 * 2025-26 eles jogaram no Milwaukee. Giannis 30/30/12 e Lillard 25/25/15
 * apitam por oscilação no DIA, e fazem 28 e 22.
 */
async function semear(db: Db) {
  await db.insert(schema.times).values([
    { id: MIL, sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' },
    { id: MIA, sigla: 'MIA', nome: 'Heat', conferencia: 'Leste' },
    { id: BOS, sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' },
  ])
  await db.insert(schema.jogadores).values([
    { id: GIANNIS, nomeCompleto: 'Giannis Antetokounmpo', posicao: 'F' },
    { id: LILLARD, nomeCompleto: 'Damian Lillard', posicao: 'G' },
  ])
  await db.insert(schema.niveisVersao).values({ id: VERSAO, versao: 'v-teste', ativa: true })
  await db.insert(schema.niveis).values([
    { niveisVersaoId: VERSAO, jogadorId: GIANNIS, timeId: MIA, atributo: 'PONTOS', nivel: 'MVP', posicaoHierarquia: 1 },
    { niveisVersaoId: VERSAO, jogadorId: LILLARD, timeId: MIA, atributo: 'PONTOS', nivel: 'ALL_STAR', posicaoHierarquia: 2 },
  ])
  await db
    .insert(schema.jogos)
    .values([jogoEm(JOGO_01, '2025-11-01'), jogoEm(JOGO_02, '2025-11-02'), jogoEm(JOGO_03, '2025-11-03'), jogoEm(JOGO_DIA, DIA)])
  await db.insert(schema.estatisticasJogo).values([
    linha(JOGO_01, GIANNIS, 30),
    linha(JOGO_01, LILLARD, 25),
    linha(JOGO_02, GIANNIS, 30),
    linha(JOGO_02, LILLARD, 25),
    linha(JOGO_03, GIANNIS, 12),
    linha(JOGO_03, LILLARD, 15),
    linha(JOGO_DIA, GIANNIS, 28),
    linha(JOGO_DIA, LILLARD, 22),
  ])
}

describe('leitura da temporada anterior', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let db: Db

  beforeEach(async () => {
    banco = await bancoDeTeste()
    db = banco.db as unknown as Db
    await semear(db)
  }, 30_000)

  afterEach(async () => {
    await banco.fechar()
  })

  it('recapRetroativo confere igual a recapDaNoite para os mesmos apitos', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    // O MESMO apito nas duas tabelas: a conferência não pode depender de onde ele mora.
    const retro = await db
      .select()
      .from(schema.apitosRetroativos)
      .where(eq(schema.apitosRetroativos.estrategia, 'LISTA_SECRETA'))
    expect(retro.length).toBeGreaterThan(0)
    await db.insert(schema.apitos).values(
      retro.map((a) => ({
        rulesetVersao: a.rulesetVersao,
        jogoId: a.jogoId,
        jogadorId: a.jogadorId,
        atributo: a.atributo,
        estrategia: a.estrategia,
        metodo: a.metodo,
        nivelJogador: a.nivelJogador,
        nivelApito: a.nivelApito,
        turbo: a.turbo,
        modoFire: a.modoFire,
        opdOrigemNivel: a.opdOrigemNivel,
        linha: a.linha,
        confianca: a.confianca,
        alvo1q: a.alvo1q,
      })),
    )

    const [aoVivo, anterior] = await Promise.all([recapDaNoite(db, DIA), recapRetroativo(db, TEMPORADA, DIA)])
    expect(anterior.bateram).toBe(aoVivo.bateram)
    expect(anterior.conferidos).toBe(aoVivo.conferidos)
    expect(anterior.publicados).toBe(aoVivo.publicados)
    expect(anterior.taxa).toBe(aoVivo.taxa)
    expect(anterior.noiteEncerrada).toBe(true)
    expect(anterior.porJogo[0]!.cards[0]!.valor).toBe(aoVivo.porJogo[0]!.cards[0]!.valor)
    expect(anterior.porJogo[0]!.cards.map((c) => c.linhas)).toEqual(aoVivo.porJogo[0]!.cards.map((c) => c.linhas))
    expect(anterior.apitoDaNoite?.jogadorId).toBe(aoVivo.apitoDaNoite?.jogadorId)
  }, 30_000)

  it('o time do card é o que o jogador JOGOU naquela temporada, não o da lista do CJ', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const recap = await recapRetroativo(db, TEMPORADA, DIA)
    const cards = recap.porJogo.flatMap((g) => g.cards)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.timeId === MIL && c.timeSigla === 'MIL')).toBe(true)
  }, 30_000)

  it('sem apito retroativo na data, o recap é vazio', async () => {
    const recap = await recapRetroativo(db, TEMPORADA, DIA)
    expect(recap.publicados).toBe(0)
    expect(recap.porJogo).toEqual([])
  }, 30_000)

  it('datasRetroativas lista as datas da temporada, em ordem, e nada de outra temporada', async () => {
    await executarDiaRetroativo(db, ruleset, '2025-11-03', { agora: DEPOIS })
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    expect(await datasRetroativas(db, '2025-26')).toEqual(['2025-11-03', DIA])
    expect(await datasRetroativas(db, '2024-25')).toEqual([])
  }, 30_000)

  it('feedRetroativoDoDia devolve a Lista do dia, sem odd', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const feed = await feedRetroativoDoDia(db, TEMPORADA, DIA)
    expect(feed?.dataReferencia).toBe(DIA)
    expect(feed!.itens.length).toBeGreaterThan(0)
    expect(feed!.itens.every((i) => i.oddFaixa === null)).toBe(true)
    expect(await feedRetroativoDoDia(db, TEMPORADA, '2025-11-05')).toBeNull()
  }, 30_000)

  it('greens e Fire Live da temporada anterior vêm das tabelas retroativas, com o time do dia', async () => {
    await db
      .insert(schema.estatisticasQuarto)
      .values({ jogoId: JOGO_DIA, jogadorId: GIANNIS, quarto: ruleset.fire_live.quarto, pontos: 26 })
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })

    const greens = await greensRetroativosDoDia(db, TEMPORADA, DIA)
    expect(greens).toHaveLength(1)
    expect(greens[0]).toMatchObject({ jogadorId: GIANNIS, marco: 25, valor: 26, timeId: MIL })
    expect(greens[0]!.nome).toBe('Giannis Antetokounmpo')

    const fire = await fireLiveRetroativo(db, TEMPORADA, DIA)
    const doGiannis = fire.find((f) => f.jogadorId === GIANNIS)
    expect(doGiannis).toMatchObject({ estado: 'CONFERIDO', valor: 26, bateu: true, timeSigla: 'MIL' })
  }, 30_000)

  it('a taxa da temporada anterior sai de apitos_retroativos, com a mesma conta', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const recap = await recapRetroativo(db, TEMPORADA, DIA)
    const taxa = await taxaDaTemporada(db, '2025-11-05', 60, 'apitos_retroativos')
    expect(taxa).toEqual({ conferidos: recap.conferidos, acertos: recap.bateram, rodadas: 1 })
    // E a do app ao vivo não enxerga nada disso.
    expect(await taxaDaTemporada(db, '2025-11-05', 60)).toEqual({ conferidos: 0, acertos: 0, rodadas: 0 })
  }, 30_000)

  it('toda leitura do dia é pela temporada E pela data: pedir o dia em outra temporada devolve vazio', async () => {
    await db
      .insert(schema.estatisticasQuarto)
      .values({ jogoId: JOGO_DIA, jogadorId: GIANNIS, quarto: ruleset.fire_live.quarto, pontos: 26 })
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    // O índice é (temporada, data_referencia): a leitura usa as duas colunas.
    expect((await recapRetroativo(db, TEMPORADA, DIA)).publicados).toBeGreaterThan(0)
    expect((await recapRetroativo(db, '2024-25', DIA)).porJogo).toEqual([])
    expect(await greensRetroativosDoDia(db, TEMPORADA, DIA)).toHaveLength(1)
    expect(await greensRetroativosDoDia(db, '2024-25', DIA)).toEqual([])
    expect((await fireLiveRetroativo(db, TEMPORADA, DIA)).length).toBeGreaterThan(0)
    expect(await fireLiveRetroativo(db, '2024-25', DIA)).toEqual([])
    expect(await feedRetroativoDoDia(db, TEMPORADA, DIA)).not.toBeNull()
    expect(await feedRetroativoDoDia(db, '2024-25', DIA)).toBeNull()
  }, 30_000)
})
