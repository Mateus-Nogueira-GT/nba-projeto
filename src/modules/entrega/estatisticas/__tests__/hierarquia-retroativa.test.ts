import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import * as schema from '../../../dominio/db/schema'
import type { Db } from '../../../dominio/db/tipos'
import { hierarquiaDoTime } from '../time'
import { intervaloDaTemporada } from '../temporadas'

/**
 * A HIERARQUIA NIP DE UMA TEMPORADA QUE ACABOU (spec 25/09, §3.3 · Task 10).
 *
 * O time é o do BOX (onde o jogador jogou até a data), a ordem é o nível do
 * jogador e, no mesmo nível, a posição na lista do CJ — nunca o time
 * projetado da lista. Mesmos personagens de `fatos.test.ts`.
 */

const MIL = '00000000-0000-4000-8000-000000000001'
const MIA = '00000000-0000-4000-8000-000000000002'
const BOS = '00000000-0000-4000-8000-000000000003'

const GIANNIS = '00000000-0000-4000-8000-0000000000a1'
const LILLARD = '00000000-0000-4000-8000-0000000000a2'
const FORA_DA_LISTA = '00000000-0000-4000-8000-0000000000a3'
const DA_OUTRA_TEMPORADA = '00000000-0000-4000-8000-0000000000a4'

const VERSAO = '00000000-0000-4000-8000-0000000000b1'
const CALENDARIO = { mesInicio: 10, formato: 'dois_anos' as const, fuso: 'America/Sao_Paulo' }

const jogo = (id: string, dia: string, casa = MIL) => ({
  id,
  timeCasaId: casa,
  timeVisitanteId: BOS,
  status: 'ENCERRADO' as const,
  dataReferencia: dia,
  dataHoraUtc: new Date(`${dia}T23:30:00Z`),
})
const linha = (jogoId: string, jogadorId: string, timeId: string) => ({
  jogoId,
  jogadorId,
  timeId,
  pontos: 20,
  minutos: '30',
  rebotesTotal: 5,
  assistencias: 3,
})

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let db: Db

const anterior = (data: string) => ({
  temporadaAnterior: { temporada: '2025-26', data, calendario: CALENDARIO },
})

beforeAll(async () => {
  banco = await bancoDeTeste()
  db = banco.db as unknown as Db
  await db.insert(schema.times).values([
    { id: MIL, sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' },
    { id: MIA, sigla: 'MIA', nome: 'Heat', conferencia: 'Leste' },
    { id: BOS, sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' },
  ])
  await db.insert(schema.jogadores).values([
    { id: GIANNIS, nomeCompleto: 'Giannis Antetokounmpo' },
    { id: LILLARD, nomeCompleto: 'Damian Lillard' },
    { id: FORA_DA_LISTA, nomeCompleto: 'Fora da Lista' },
    { id: DA_OUTRA_TEMPORADA, nomeCompleto: 'Da Outra Temporada' },
  ])
  await db.insert(schema.niveisVersao).values({ id: VERSAO, versao: 'v-teste', ativa: true })
  // A lista projeta todos no Miami — e põe o All Star ANTES do MVP na posição:
  // o nível do jogador vence a posição (decisão 3).
  await db.insert(schema.niveis).values([
    { niveisVersaoId: VERSAO, jogadorId: LILLARD, timeId: MIA, atributo: 'PONTOS', nivel: 'ALL_STAR', posicaoHierarquia: 1 },
    { niveisVersaoId: VERSAO, jogadorId: GIANNIS, timeId: MIA, atributo: 'PONTOS', nivel: 'MVP', posicaoHierarquia: 2 },
    { niveisVersaoId: VERSAO, jogadorId: DA_OUTRA_TEMPORADA, timeId: MIA, atributo: 'PONTOS', nivel: 'SUPORTE', posicaoHierarquia: 3 },
  ])
  await db.insert(schema.jogos).values([
    jogo('00000000-0000-4000-8000-0000000000c0', '2024-11-01'),
    jogo('00000000-0000-4000-8000-0000000000c1', '2025-11-01'),
    jogo('00000000-0000-4000-8000-0000000000c2', '2026-01-10', MIA),
  ])
  await db.insert(schema.estatisticasJogo).values([
    // Jogou pelo MIL — mas na temporada ANTERIOR à pedida.
    linha('00000000-0000-4000-8000-0000000000c0', DA_OUTRA_TEMPORADA, MIL),
    linha('00000000-0000-4000-8000-0000000000c1', GIANNIS, MIL),
    linha('00000000-0000-4000-8000-0000000000c1', LILLARD, MIL),
    linha('00000000-0000-4000-8000-0000000000c1', FORA_DA_LISTA, MIL),
    // A troca: o Lillard passa a jogar pelo MIA.
    linha('00000000-0000-4000-8000-0000000000c2', LILLARD, MIA),
  ])
}, 60_000)

afterAll(async () => {
  await banco.fechar()
})

describe('hierarquiaDoTime na temporada anterior', () => {
  it('monta o time REAL: nível do jogador primeiro, sem quem está fora da lista', async () => {
    const h = await hierarquiaDoTime(db, MIL, 'PONTOS', null, anterior('2025-12-01'))
    expect(h.map((l) => [l.posicao, l.jogadorId, l.nivel, l.fora])).toEqual([
      [1, GIANNIS, 'MVP', false],
      [2, LILLARD, 'ALL_STAR', false],
    ])
  })

  it('o jogador trocado muda de time na data da troca', async () => {
    expect((await hierarquiaDoTime(db, MIL, 'PONTOS', null, anterior('2026-01-10'))).map((l) => l.jogadorId)).toEqual([
      GIANNIS,
    ])
    expect((await hierarquiaDoTime(db, MIA, 'PONTOS', null, anterior('2026-01-10'))).map((l) => l.jogadorId)).toEqual([
      LILLARD,
    ])
  })

  it('o box de outra temporada não põe ninguém no elenco desta', async () => {
    const h = await hierarquiaDoTime(db, MIL, 'PONTOS', null, anterior('2025-10-15'))
    expect(h).toEqual([])
  })

  it('sem a opção, é a lista do CJ de hoje, como sempre', async () => {
    const h = await hierarquiaDoTime(db, MIA, 'PONTOS', null)
    expect(h.map((l) => l.jogadorId)).toEqual([LILLARD, GIANNIS, DA_OUTRA_TEMPORADA])
  })
})

describe('intervaloDaTemporada', () => {
  it('vai da abertura à véspera da abertura seguinte, nos dois formatos', () => {
    expect(intervaloDaTemporada('2025-26', CALENDARIO)).toEqual({ de: '2025-10-01', ate: '2026-09-30' })
    expect(intervaloDaTemporada('2025', { ...CALENDARIO, formato: 'ano_inicial' })).toEqual({
      de: '2025-10-01',
      ate: '2026-09-30',
    })
  })
})
