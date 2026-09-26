import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../__tests__/ajuda-banco'
import * as schema from '../../db/schema'
import type { Db } from '../../db/tipos'
import { montarFatosRetroativos } from '../fatos'

const MIL = '00000000-0000-4000-8000-000000000001'
const MIA = '00000000-0000-4000-8000-000000000002'
const BOS = '00000000-0000-4000-8000-000000000003'

const GIANNIS = '00000000-0000-4000-8000-0000000000a1'
const LILLARD = '00000000-0000-4000-8000-0000000000a2'
const FORA_DA_LISTA = '00000000-0000-4000-8000-0000000000a3'

const VERSAO = '00000000-0000-4000-8000-0000000000b1'

const JOGO_01 = '00000000-0000-4000-8000-0000000000c1'
const JOGO_02 = '00000000-0000-4000-8000-0000000000c2'
const JOGO_03 = '00000000-0000-4000-8000-0000000000c3'
const JOGO_04 = '00000000-0000-4000-8000-0000000000c4'
const JOGO_TROCA = '00000000-0000-4000-8000-0000000000c5'
const JOGO_AGENDADO = '00000000-0000-4000-8000-0000000000c6'
const JOGO_TEMPORADA_PASSADA = '00000000-0000-4000-8000-0000000000c7'

const CONFIG = {
  calendario: { mesInicio: 10, formato: 'dois_anos' as const, fuso: 'America/Sao_Paulo' },
  janela: 'temporada' as const,
  quartoFireLive: 1,
}

// 23h30 UTC = 20h30 em São Paulo: o jogo cai no mesmo dia da rodada.
const jogoBase = {
  timeCasaId: MIL,
  timeVisitanteId: BOS,
  status: 'ENCERRADO' as const,
}

function jogoEm(id: string, dia: string, casa = MIL) {
  return {
    ...jogoBase,
    id,
    timeCasaId: casa,
    dataReferencia: dia,
    dataHoraUtc: new Date(`${dia}T23:30:00Z`),
  }
}

function linha(jogoId: string, jogadorId: string, timeId: string, pontos: number, minutos = '30') {
  return { jogoId, jogadorId, timeId, pontos, minutos, rebotesTotal: 5, assistencias: 3 }
}

async function semear(db: Db) {
  await db.insert(schema.times).values([
    { id: MIL, sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' },
    { id: MIA, sigla: 'MIA', nome: 'Heat', conferencia: 'Leste' },
    { id: BOS, sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' },
  ])
  await db.insert(schema.jogadores).values([
    { id: GIANNIS, nomeCompleto: 'Giannis Antetokounmpo' },
    { id: LILLARD, nomeCompleto: 'Damian Lillard' },
    { id: FORA_DA_LISTA, nomeCompleto: 'Fora da Lista' },
  ])
  await db.insert(schema.niveisVersao).values({ id: VERSAO, versao: 'v-teste', ativa: true })
  // A lista do CJ projeta os dois no Miami — em 2025-26 eles jogaram no Milwaukee.
  await db.insert(schema.niveis).values([
    { niveisVersaoId: VERSAO, jogadorId: GIANNIS, timeId: MIA, atributo: 'PONTOS', nivel: 'MVP', posicaoHierarquia: 1 },
    { niveisVersaoId: VERSAO, jogadorId: LILLARD, timeId: MIA, atributo: 'PONTOS', nivel: 'ALL_STAR', posicaoHierarquia: 2 },
  ])
  await db
    .insert(schema.jogos)
    .values([
      jogoEm(JOGO_01, '2025-11-01'),
      jogoEm(JOGO_02, '2025-11-02'),
      jogoEm(JOGO_03, '2025-11-03'),
      jogoEm(JOGO_04, '2025-11-04'),
      jogoEm(JOGO_TROCA, '2026-01-10', MIA),
    ])
  await db.insert(schema.estatisticasJogo).values([
    linha(JOGO_01, GIANNIS, MIL, 30),
    linha(JOGO_01, LILLARD, MIL, 25),
    linha(JOGO_01, FORA_DA_LISTA, MIL, 10),
    linha(JOGO_02, GIANNIS, MIL, 20),
    linha(JOGO_02, LILLARD, MIL, 22),
    linha(JOGO_02, FORA_DA_LISTA, MIL, 8),
    // Dia 03: o Giannis não tem linha no box.
    linha(JOGO_03, LILLARD, MIL, 18),
    linha(JOGO_04, GIANNIS, MIL, 50),
    linha(JOGO_04, LILLARD, MIL, 21),
    linha(JOGO_TROCA, LILLARD, MIA, 27),
  ])
  await db.insert(schema.estatisticasQuarto).values([
    { jogoId: JOGO_02, jogadorId: GIANNIS, quarto: 1, pontos: 9 },
    { jogoId: JOGO_02, jogadorId: GIANNIS, quarto: 2, pontos: 6 },
  ])
}

describe('montarFatosRetroativos', () => {
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

  it('conta o Giannis pelo Milwaukee, não pelo Miami da lista', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    const mil = f.times.find((t) => t.sigla === 'MIL')!
    expect(mil.jogadores.map((j) => j.id)).toContain(GIANNIS)
    expect(mil.jogadores.find((j) => j.id === GIANNIS)!.timeId).toBe(MIL)
    expect(f.times.find((t) => t.sigla === 'MIA')).toBeUndefined()
    expect(f.niveisVersaoId).toBe(VERSAO)
  }, 30_000)

  it('sem futuro: a média do dia 03 não vê o 50 do dia 04', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
    const g = f.times.flatMap((t) => t.jogadores).find((j) => j.id === GIANNIS)!
    expect(g.historico.every((h) => h.data < '2025-11-03')).toBe(true)
    expect(g.medias.PONTOS).not.toBe(50)
    // (30 + 20) / 2 — só os jogos até a véspera.
    expect(g.medias.PONTOS).toBe(25)
    expect(g.medias.REBOTES).toBe(5)
    expect(g.medias.ASSISTENCIAS).toBe(3)
    expect(g.historico.map((h) => h.jogoId)).toEqual([JOGO_02, JOGO_01])
  }, 30_000)

  it('a janela do ruleset recorta a média: só os 5 jogos mais recentes até a véspera', async () => {
    // Seis jogos a mais do Giannis (05 a 10/11): com os de 01, 02 e 04, ele
    // chega ao dia 11 com NOVE jogos jogados — a janela de 5 corta de verdade.
    const pontos = [10, 12, 14, 16, 18, 20]
    const extras = pontos.map((_, i) => ({
      id: `00000000-0000-4000-8000-0000000000d${i + 1}`,
      dia: `2025-11-${String(5 + i).padStart(2, '0')}`,
    }))
    await db.insert(schema.jogos).values(extras.map((e) => jogoEm(e.id, e.dia)))
    await db
      .insert(schema.estatisticasJogo)
      .values(extras.map((e, i) => linha(e.id, GIANNIS, MIL, pontos[i]!)))

    const recortada = await montarFatosRetroativos(db, '2025-11-11', { ...CONFIG, janela: 'ultimos_5' })
    const g = recortada.times.flatMap((t) => t.jogadores).find((j) => j.id === GIANNIS)!
    expect(g.historico.filter((h) => h.jogou)).toHaveLength(9)
    // 20 + 18 + 16 + 14 + 12 = 80 → 16. O 50 do dia 04 ficou fora da janela.
    expect(g.medias.PONTOS).toBe(16)

    // A temporada inteira, no mesmo dia, vê os nove: (30+20+50+10+12+14+16+18+20)/9.
    const inteira = await montarFatosRetroativos(db, '2025-11-11', CONFIG)
    const t = inteira.times.flatMap((x) => x.jogadores).find((j) => j.id === GIANNIS)!
    expect(t.medias.PONTOS).toBe(21.11)
  }, 30_000)

  it('linha de jogo do DIA que não terminou não decide o time', async () => {
    // 05/11: o Lillard aparece num jogo AO VIVO pelo Miami. O jogo não está
    // ENCERRADO — não entra no replay, e não pode tirá-lo do Milwaukee.
    const AO_VIVO = '00000000-0000-4000-8000-0000000000e1'
    await db.insert(schema.jogos).values({ ...jogoEm(AO_VIVO, '2025-11-05', MIA), status: 'AO_VIVO' as const })
    await db.insert(schema.estatisticasJogo).values(linha(AO_VIVO, LILLARD, MIA, 12))
    const f = await montarFatosRetroativos(db, '2025-11-05', CONFIG)
    expect(f.times.find((t) => t.sigla === 'MIL')!.jogadores.map((j) => j.id)).toContain(LILLARD)
    expect(f.times.find((t) => t.sigla === 'MIA')).toBeUndefined()
  }, 30_000)

  it('quem não jogou no dia é FORA na escalação', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
    expect(f.jogos).toHaveLength(1)
    expect(f.jogos[0]!.escalacao[GIANNIS]).toBe('FORA')
    expect(f.jogos[0]!.escalacao[LILLARD]).toBe('ATIVO')
  }, 30_000)

  it('linha com 0 minutos e nada produzido também é FORA', async () => {
    await db
      .insert(schema.estatisticasJogo)
      .values({ jogoId: JOGO_03, jogadorId: GIANNIS, timeId: MIL, minutos: '0', pontos: 0 })
    const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
    expect(f.jogos[0]!.escalacao[GIANNIS]).toBe('FORA')
  }, 30_000)

  it('hierarquia: MVP antes de All Star', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    const mil = f.times.find((t) => t.sigla === 'MIL')!
    expect(mil.jogadores[0]!.id).toBe(GIANNIS)
    expect(mil.jogadores[0]!.posicaoHierarquiaPorAtributo?.PONTOS).toBe(1)
    expect(mil.jogadores[1]!.posicaoHierarquiaPorAtributo?.PONTOS).toBe(2)
    expect(mil.jogadores[0]!.classificacoes).toEqual({ PONTOS: 'MVP' })
  }, 30_000)

  it('hierarquia por atributo: a ordem de rebotes é remontada à parte', async () => {
    await db.insert(schema.niveis).values([
      { niveisVersaoId: VERSAO, jogadorId: GIANNIS, timeId: MIA, atributo: 'REBOTES', nivel: 'SUPORTE', posicaoHierarquia: 1 },
      { niveisVersaoId: VERSAO, jogadorId: LILLARD, timeId: MIA, atributo: 'REBOTES', nivel: 'ALL_STAR', posicaoHierarquia: 2 },
    ])
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    const mil = f.times.find((t) => t.sigla === 'MIL')!
    const g = mil.jogadores.find((j) => j.id === GIANNIS)!
    const l = mil.jogadores.find((j) => j.id === LILLARD)!
    expect(g.posicaoHierarquiaPorAtributo).toEqual({ PONTOS: 1, REBOTES: 2 })
    expect(l.posicaoHierarquiaPorAtributo).toEqual({ PONTOS: 2, REBOTES: 1 })
    // O ordinal legado segue o de pontos.
    expect(g.posicaoHierarquia).toBe(1)
    expect(l.posicaoHierarquia).toBe(2)
  }, 30_000)

  it('jogador fora da lista do CJ não entra', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    expect(f.times.flatMap((t) => t.jogadores).map((j) => j.id)).not.toContain(FORA_DA_LISTA)
    expect(f.jogos[0]!.escalacao[FORA_DA_LISTA]).toBeUndefined()
  }, 30_000)

  it('troca no meio da temporada: muda de time na data do primeiro jogo pelo novo', async () => {
    expect(
      (await montarFatosRetroativos(db, '2025-12-01', CONFIG)).times
        .find((t) => t.sigla === 'MIL')!
        .jogadores.map((j) => j.id),
    ).toContain(LILLARD)
    const f = await montarFatosRetroativos(db, '2026-01-10', CONFIG)
    expect(f.times.find((t) => t.sigla === 'MIA')!.jogadores.map((j) => j.id)).toContain(LILLARD)
    expect(f.times.find((t) => t.sigla === 'MIL')!.jogadores.map((j) => j.id)).not.toContain(
      LILLARD,
    )
  }, 30_000)

  it('jogo não encerrado fica de fora', async () => {
    await db.insert(schema.jogos).values({
      ...jogoBase,
      id: JOGO_AGENDADO,
      timeCasaId: MIA,
      dataReferencia: '2025-11-02',
      dataHoraUtc: new Date('2025-11-02T23:30:00Z'),
      status: 'AGENDADO',
    })
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    expect(f.jogos.map((j) => j.id)).not.toContain(JOGO_AGENDADO)
    expect(f.jogos.map((j) => j.id)).toEqual([JOGO_02])
  }, 30_000)

  it('Fire Live: quarto do ruleset e só as linhas dele', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    const jogo = f.jogos[0]!
    expect(jogo.quartoAtual).toBe(1)
    expect(jogo.estatisticasQuarto).toEqual([
      { jogadorId: GIANNIS, quarto: 1, pontos: 9, rebotes: 0, assistencias: 0 },
    ])
  }, 30_000)

  it('elenco canônico: os da lista que tiveram linha no jogo por aquele time', async () => {
    const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
    const mil = f.times.find((t) => t.sigla === 'MIL')!
    expect(mil.elencoCanonico?.map((j) => j.id)).toEqual([LILLARD])
  }, 30_000)

  it('fronteira da temporada: jogo da temporada anterior não entra na média nem no time', async () => {
    // Abril de 2025 é 2024-25: o Giannis "no Boston", com 80 pontos.
    await db.insert(schema.jogos).values(jogoEm(JOGO_TEMPORADA_PASSADA, '2025-04-10', BOS))
    await db
      .insert(schema.estatisticasJogo)
      .values(linha(JOGO_TEMPORADA_PASSADA, GIANNIS, BOS, 80))

    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    const g = f.times.flatMap((t) => t.jogadores).find((j) => j.id === GIANNIS)!
    expect(g.historico.map((h) => h.jogoId)).toEqual([JOGO_01])
    expect(g.medias.PONTOS).toBe(30)

    // Antes do 1º jogo dele em 2025-26 ele não tem time — não o de 2024-25.
    const antes = await montarFatosRetroativos(db, '2025-10-25', CONFIG)
    expect(antes.times.flatMap((t) => t.jogadores).map((j) => j.id)).not.toContain(GIANNIS)
    expect(antes.times.find((t) => t.sigla === 'BOS')).toBeUndefined()
  }, 30_000)

  it('sem versão ativa da lista, nada', async () => {
    await db.update(schema.niveisVersao).set({ ativa: false })
    const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
    expect(f).toEqual({ dataReferencia: '2025-11-02', times: [], jogos: [], niveisVersaoId: null })
  }, 30_000)
})
