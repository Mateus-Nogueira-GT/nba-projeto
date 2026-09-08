import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  jogadores,
  jogos,
  mapaJogadores,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { montarFatos } from '../../dominio/fatos'
import { calendarioDoRuleset } from '../../dominio/temporada'
import { avaliar } from '../../motor'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import { detalheDoApito } from '../detalhe-apito'
import type { ItemFeed } from '../tipos-feed'

const ruleset = carregarRuleset(yamlBruto)
const HOJE = '2026-01-15'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let anteriores: string[]

beforeAll(async () => {
  banco = await bancoDeTeste()
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
      nomeCompleto: 'Luka Doncic',
      timeId: casa!.id,
    })
    .returning()
  jogadorId = jogador!.id
  const [versao] = await banco.db
    .insert(niveisVersao)
    .values({
      versao: 'auditoria-explicacao',
      ativa: true,
    })
    .returning()
  await banco.db.insert(niveis).values([
    {
      niveisVersaoId: versao!.id,
      jogadorId,
      timeId: casa!.id,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
    // A classe de rebotes é apenas um dado sintético para isolar a permissão
    // de N1 ao Suporte (P347), sem alegar uma nova curadoria real de Luka.
    {
      niveisVersaoId: versao!.id,
      jogadorId,
      timeId: casa!.id,
      atributo: 'REBOTES',
      nivel: 'SUPORTE',
      posicaoHierarquia: 1,
    },
  ])
  await banco.db.insert(mapaJogadores).values({
    jogadorId,
    nomeNaLista: 'Luka Doncic',
    provedor: 'api-sports',
    confirmadoPor: 'fixture',
    confirmadoEm: new Date('2026-01-01T12:00:00Z'),
  })
  await banco.db.insert(mediasJogador).values([
    { jogadorId, temporada: '2025-26', janela: 'TEMPORADA', jogos: 20, ppg: '30.00', rpg: '6.00' },
    { jogadorId, temporada: '2025-26', janela: 'ULTIMOS_10', jogos: 10, ppg: '20.00', rpg: '6.00' },
  ])
  anteriores = (
    await banco.db
      .insert(jogos)
      .values(
        [
          '2026-01-14',
          '2026-01-13',
          '2026-01-12',
          '2026-01-11',
          '2026-01-10',
          '2026-01-09',
          '2026-01-08',
        ].map((data) => ({
          dataReferencia: data,
          dataHoraUtc: new Date(`${data}T23:00:00Z`),
          timeCasaId: casa!.id,
          timeVisitanteId: visitante!.id,
          status: 'ENCERRADO' as const,
        })),
      )
      .returning()
  ).map((j) => j.id)
  await banco.db.insert(jogos).values({
    dataReferencia: HOJE,
    dataHoraUtc: new Date(`${HOJE}T23:00:00Z`),
    timeCasaId: casa!.id,
    timeVisitanteId: visitante!.id,
  })
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(estatisticasJogo)
})

async function historico(linhas: { pontos: number; minutos: string | null; rebotes?: number }[]) {
  await banco.db.insert(estatisticasJogo).values(
    linhas.map((linha, indice) => ({
      jogoId: anteriores[indice]!,
      jogadorId,
      pontos: linha.pontos,
      minutos: linha.minutos,
      rebotesTotal: linha.rebotes ?? 0,
    })),
  )
}

/** O item usa EXATAMENTE os fatos avaliados; nada é atualizado entre apito e detalhe. */
async function itemDoMotor(atributo: Atributo, r: Ruleset = ruleset): Promise<ItemFeed> {
  const fatos = await montarFatos(banco.db, HOJE, calendarioDoRuleset(r), r.media.janela)
  const apito = avaliar(fatos, r).find(
    (a) => a.atributo === atributo && a.estrategia === 'LISTA_SECRETA',
  )
  expect(apito).toBeDefined()
  const jogador = fatos.times.flatMap((t) => t.jogadores).find((j) => j.id === jogadorId)!
  return {
    ...apito!,
    chave: apito!.chaveDeduplicacao,
    nome: jogador.nome,
    timeSigla: 'LAL',
    timeNome: 'Lakers',
    fotoUrl: null,
    posicao: null,
    grauConfianca: null,
    ultimos5: [],
    oddFaixa: null,
    mediaTemporada: jogador.medias[atributo] ?? null,
  }
}

describe('o detalhe explica os mesmos fatos que produziram o apito', () => {
  it('turbo de MVP por oscilação não atribui o sinal a um desfalque inexistente', async () => {
    await historico([
      { pontos: 20, minutos: '30' },
      { pontos: 20, minutos: '30' },
      { pontos: 20, minutos: '30' },
    ])
    const item = await itemDoMotor('PONTOS')
    expect(item).toMatchObject({ metodo: 'OSCILACAO', turbo: true, nivelApito: 3 })
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(detalhe.jogo.desfalques).toEqual([])
    const fator = detalhe.fatores.find((f) => f.chave === 'TURBO')
    expect(fator).toBeDefined()
    expect(fator!.texto).toMatch(/oscilação/i)
    expect(fator!.texto).not.toMatch(/desfalque|OPD/i)
    expect(fator!.texto.startsWith(fator!.destaque!)).toBe(true)
  })

  it('a comparação usa a mesma janela de média do apito', async () => {
    const r = structuredClone(ruleset)
    r.media.janela = 'ultimos_10'
    await historico([{ pontos: 13, minutos: '30' }])
    const item = await itemDoMotor('PONTOS', r)
    expect(item.mediaTemporada).toBe(20)
    const detalhe = await detalheDoApito(banco.db, r, item)
    expect(detalhe.mediaTemporada).toBe(item.mediaTemporada)
  })

  it('Luka por UUID mantém delta 7 e sequência N1 na explicação', async () => {
    await historico([
      { pontos: 23, minutos: '30' },
      { pontos: 24, minutos: '30' },
    ])
    const item = await itemDoMotor('PONTOS')
    expect(item.nivelApito).toBe(1)
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(detalhe.porQueEntrou[0]).toBe('◆ 1 jogo seguido abaixo de 23,0 pontos.')
  })

  it('o DNP ignorado pelo motor não vira um segundo jogo abaixo no porquê', async () => {
    await historico([
      { pontos: 0, minutos: '0' },
      { pontos: 20, minutos: '30' },
    ])
    const item = await itemDoMotor('PONTOS')
    expect(item.nivelApito).toBe(1)
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(detalhe.porQueEntrou[0]).toMatch(/^◆ 1 jogo seguido abaixo de /)
  })

  it('o apito N1 de Suporte em rebotes não é negado por sua própria explicação', async () => {
    await historico([{ pontos: 30, minutos: '30', rebotes: 0 }])
    const item = await itemDoMotor('REBOTES')
    expect(item.nivelApito).toBe(1)
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(detalhe.fatores.find((f) => f.chave === 'NIVEL_APITO')?.texto).not.toContain(
      'não apita em N1',
    )
  })

  it('mais DNPs recentes que os cinco blocos não apagam a sequência elegível', async () => {
    await historico([
      ...Array.from({ length: 6 }, () => ({ pontos: 0, minutos: '0' })),
      { pontos: 20, minutos: '30' },
    ])
    const item = await itemDoMotor('PONTOS')
    expect(item.nivelApito).toBe(1)
    const detalhe = await detalheDoApito(banco.db, ruleset, item, { blocos: 5 })
    expect(detalhe.blocos).toHaveLength(5)
    expect(detalhe.porQueEntrou[0]).toBe('◆ 1 jogo seguido abaixo de 23,0 pontos.')
  })

  it('um alias de casa confirmado depois de Luka preserva o delta na explicação', async () => {
    await banco.db.insert(mapaJogadores).values({
      jogadorId,
      nomeNaLista: 'L. Doncic',
      provedor: 'casa:betmgm',
      confirmadoPor: 'fixture',
      confirmadoEm: new Date('2026-01-14T12:00:00Z'),
    })
    await historico([
      { pontos: 23, minutos: '30' },
      { pontos: 24, minutos: '30' },
    ])
    const item = await itemDoMotor('PONTOS')
    expect(item.nivelApito).toBe(1)
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(detalhe.porQueEntrou[0]).toBe('◆ 1 jogo seguido abaixo de 23,0 pontos.')
  })
})
