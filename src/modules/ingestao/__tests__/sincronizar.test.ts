import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  classificacao,
  conflitosIdentidadeJogo,
  conflitosIdentidadeJogador,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  identidadesJogador,
  identidadesJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import { FonteFake, type Fixture } from '../nba/adaptadores/fake'
import { consultarComOrigem, FonteComFailover } from '../nba/failover'
import { sincronizarJogadores, sincronizarJogos, sincronizarTimes } from '../sincronizar/elenco'
import {
  jogosDaData,
  persistirBoxScore,
  sincronizarBoxScore,
  sincronizarBoxScoreDoTime,
  sincronizarClassificacao,
  sincronizarEscalacao,
} from '../sincronizar/partida'
import { recalcularMedias } from '../sincronizar/medias'
import { garantirJogadores } from '../sincronizar/identidade'

const PROVEDOR = 'provedor-a'
const DATA = '2026-08-19'
const AGORA = new Date('2026-08-19T12:00:00.000Z')
const CONFIG_TEMPORADA = { mesInicio: 10, formato: 'dois_anos' as const }

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

/**
 * Um dia de NBA em miniatura: dois times, três jogadores, um jogo encerrado.
 *
 * Os números do box score foram escolhidos para serem conferíveis à mão —
 * a média de pontos do Luka sai exata.
 */
const FIXTURE: Fixture = {
  times: [
    { idExterno: 't1', sigla: 'LAL', nome: 'Lakers', conferencia: 'Oeste', logoUrl: null },
    { idExterno: 't2', sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste', logoUrl: null },
  ],
  jogadores: [
    {
      idExterno: 'p1',
      nomeCompleto: 'Luka Doncic',
      timeSiglaProvedor: 'LAL',
      posicao: 'PG',
      alturaCm: 201,
      numeroCamisa: 77,
      fotoUrl: null,
      ativo: true,
    },
    {
      idExterno: 'p2',
      nomeCompleto: 'Jayson Tatum',
      timeSiglaProvedor: 'BOS',
      posicao: 'SF',
      alturaCm: 203,
      numeroCamisa: 0,
      fotoUrl: null,
      ativo: true,
    },
    {
      idExterno: 'p3',
      nomeCompleto: 'Dennis Schroder',
      timeSiglaProvedor: null,
      posicao: 'PG',
      alturaCm: 185,
      numeroCamisa: 17,
      fotoUrl: null,
      // Dispensado durante a elaboração da lista — a tela precisa mostrar isso.
      ativo: false,
    },
  ],
  jogos: [
    {
      idExterno: 'g1',
      dataReferencia: DATA,
      dataHoraUtc: `${DATA}T23:00:00.000Z`,
      timeCasaSigla: 'LAL',
      timeVisitanteSigla: 'BOS',
      status: 'ENCERRADO',
      quartoAtual: null,
      relogio: null,
      intervalo: false,
      placarCasa: 112,
      placarVisitante: 105,
    },
  ],
  boxScore: [
    // Total do jogo — quarto null.
    {
      jogadorIdExterno: 'p1',
      quarto: null,
      minutos: 36,
      pontos: 30,
      rebotes: 9,
      rebotesOf: 2,
      rebotesDef: 7,
      assistencias: 11,
      roubos: 2,
      bloqueios: 1,
      turnovers: 4,
      faltas: 2,
      cestasC: 11,
      cestasT: 20,
      doisC: 7,
      doisT: 11,
      tresC: 4,
      tresT: 9,
      lanceC: 4,
      lanceT: 5,
      saldoQuadra: 14,
    },
    // Quebra por quarto — é isto que o Fire Live lê.
    {
      jogadorIdExterno: 'p1',
      quarto: 1,
      minutos: 10,
      pontos: 12,
      rebotes: 3,
      rebotesOf: 1,
      rebotesDef: 2,
      assistencias: 4,
      roubos: 1,
      bloqueios: 0,
      turnovers: 1,
      faltas: 0,
      cestasC: 5,
      cestasT: 7,
      doisC: 3,
      doisT: 4,
      tresC: 2,
      tresT: 3,
      lanceC: 0,
      lanceT: 0,
      saldoQuadra: 6,
    },
  ],
  boxScoreDoTime: [
    {
      timeSigla: 'LAL',
      pontos: 112,
      pontosQ1: 28,
      pontosQ2: 30,
      pontosQ3: 26,
      pontosQ4: 28,
      pontosProrrogacao: 0,
      rebotesTotal: 44,
      rebotesOf: 9,
      rebotesDef: 35,
      assistencias: 27,
      cestasC: 42,
      cestasT: 88,
      tresC: 14,
      tresT: 36,
      lanceC: 14,
      lanceT: 18,
      roubos: 8,
      bloqueios: 5,
      turnovers: 11,
      faltas: 18,
    },
  ],
  escalacao: [
    { jogadorIdExterno: 'p2', status: 'FORA', motivo: 'lesão no tornozelo' },
    { jogadorIdExterno: 'p1', status: 'ATIVO', motivo: null },
  ],
  classificacao: [
    {
      timeSigla: 'LAL',
      conferencia: 'Oeste',
      vitorias: 30,
      derrotas: 12,
      posicao: 2,
      aproveitamento: 0.714,
      sequencia: 'V3',
    },
  ],
}

function fonte() {
  return new FonteFake(PROVEDOR, FIXTURE)
}

/** Um ciclo completo, na ordem em que os crons rodam. */
async function ciclo() {
  const f = fonte()
  const db = banco.db

  await sincronizarTimes(db, f)
  await sincronizarJogadores(db, f)
  await sincronizarJogos(db, f, DATA, AGORA)

  const partidas = await jogosDaData(db, f, DATA)
  for (const p of partidas) {
    await sincronizarBoxScore(db, f, p, AGORA)
    await sincronizarBoxScoreDoTime(db, f, p, AGORA)
    await sincronizarEscalacao(db, f, p, AGORA)
  }

  await sincronizarClassificacao(db, f, '2026-27', AGORA)
  await recalcularMedias(db, {
    janela: 'temporada',
    configTemporada: CONFIG_TEMPORADA,
    agora: AGORA,
  })

  return partidas
}

async function contagens() {
  const db = banco.db
  const [t, j, g, ej, eq_, etj, le, c, m, i] = await Promise.all([
    db.select().from(times),
    db.select().from(jogadores),
    db.select().from(jogos),
    db.select().from(estatisticasJogo),
    db.select().from(estatisticasQuarto),
    db.select().from(estatisticasTimeJogo),
    db.select().from(lesoesEscalacao),
    db.select().from(classificacao),
    db.select().from(mediasJogador),
    db.select().from(identidadesJogador),
  ])
  return {
    times: t.length,
    jogadores: j.length,
    jogos: g.length,
    estatisticasJogo: ej.length,
    estatisticasQuarto: eq_.length,
    estatisticasTimeJogo: etj.length,
    escalacao: le.length,
    classificacao: c.length,
    medias: m.length,
    identidades: i.length,
  }
}

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  const db = banco.db
  await db.delete(conflitosIdentidadeJogador)
  await db.delete(conflitosIdentidadeJogo)
  await db.delete(estatisticasQuarto)
  await db.delete(estatisticasJogo)
  await db.delete(estatisticasTimeJogo)
  await db.delete(lesoesEscalacao)
  await db.delete(classificacao)
  await db.delete(mediasJogador)
  await db.delete(jogos)
  await db.delete(identidadesJogador)
  await db.delete(jogadores)
  await db.delete(times)
})

// ===========================================================================

describe('um ciclo completo preenche o canônico', () => {
  it('failover grava o id no namespace da fonte que realmente respondeu', async () => {
    const principal = new FonteFake('principal', {}, { falhaCom: new Error('fora') })
    const reserva = new FonteFake('reserva', {
      times: FIXTURE.times,
      jogadores: [{ ...FIXTURE.jogadores![0]!, idExterno: 'reserva-p1' }],
    })
    const failover = new FonteComFailover(principal, reserva, { timeoutMs: 1000 })

    await sincronizarTimes(banco.db, failover)
    await sincronizarJogadores(banco.db, failover)

    const [identidade] = await banco.db.select().from(identidadesJogador)
    expect(identidade).toMatchObject({ provedor: 'reserva', idExterno: 'reserva-p1' })
  })

  it('grava as tabelas que estavam vazias', async () => {
    await ciclo()
    const c = await contagens()

    expect(c.times).toBe(2)
    expect(c.jogadores).toBe(3)
    expect(c.identidades).toBe(3)
    expect(c.jogos).toBe(1)
    expect(c.estatisticasJogo).toBe(1)
    expect(c.estatisticasQuarto).toBe(1)
    expect(c.estatisticasTimeJogo).toBe(1)
    expect(c.escalacao).toBe(2)
    expect(c.classificacao).toBe(1)
    expect(c.medias).toBe(1)
  })

  it('o jogo recebe os dois times pela sigla', async () => {
    await ciclo()
    const [g] = await banco.db.select().from(jogos)
    const [lal] = await banco.db.select().from(times).where(eq(times.sigla, 'LAL'))

    expect(g!.timeCasaId).toBe(lal!.id)
    expect(g!.placarCasa).toBe(112)
    expect(g!.status).toBe('ENCERRADO')
  })

  it('a quebra por quarto chega — é dela que o Fire Live depende', async () => {
    await ciclo()
    const [q] = await banco.db.select().from(estatisticasQuarto)

    expect(q!.quarto).toBe(1)
    expect(q!.pontos).toBe(12)
  })

  it('os arremessos chegam: sem eles FG% e 3P% nunca saem de "—"', async () => {
    await ciclo()
    const [b] = await banco.db.select().from(estatisticasJogo)

    expect(b!.cestasC).toBe(11)
    expect(b!.cestasT).toBe(20)
    expect(b!.tresC).toBe(4)
    expect(b!.saldoQuadra).toBe(14)
  })

  it('jogador dispensado entra como inativo, não some', async () => {
    await ciclo()
    const [s] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.nomeCompleto, 'Dennis Schroder'))

    expect(s).toBeDefined()
    expect(s!.ativo).toBe(false)
  })

  it('jogadores.time_id recebe o time REAL do provedor', async () => {
    await ciclo()
    const [lal] = await banco.db.select().from(times).where(eq(times.sigla, 'LAL'))
    const [luka] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.nomeCompleto, 'Luka Doncic'))

    // A curadoria do CJ vive em niveis.time_id e projeta elencos. Aqui é
    // dado canônico: a aba de estatísticas depende de ser o time de verdade.
    expect(luka!.timeId).toBe(lal!.id)
  })
})

// ===========================================================================

describe('idempotência — rodar de novo não muda nada', () => {
  it('rollback do snapshot não deixa estatística de jogador pela metade', async () => {
    const f = fonte()
    await sincronizarTimes(banco.db, f)
    await sincronizarJogadores(banco.db, f)
    await sincronizarJogos(banco.db, f, DATA, AGORA)
    const [jogo] = await jogosDaData(banco.db, f, DATA)
    expect(jogo).toBeDefined()
    const resposta = await consultarComOrigem(
      f,
      (fonteEfetiva) => fonteEfetiva.boxScore(jogo!.idExterno),
      jogo!.provedor,
    )

    await expect(
      banco.db.transaction(async (tx) => {
        await persistirBoxScore(tx, jogo!, AGORA, resposta)
        throw new Error('falha induzida antes do commit')
      }),
    ).rejects.toThrow('falha induzida')

    expect(await banco.db.select().from(estatisticasJogo)).toHaveLength(0)
    expect(await banco.db.select().from(estatisticasQuarto)).toHaveLength(0)
  })

  it('concorrência não deixa jogador canônico órfão', async () => {
    const entrada = {
      idExterno: 'concorrente-1',
      nomeCompleto: 'Jogador Concorrente',
      timeId: null,
      posicao: null,
      alturaCm: null,
      numeroCamisa: null,
      fotoUrl: null,
      ativo: true,
    }

    await Promise.all([
      garantirJogadores(banco.db, PROVEDOR, [entrada]),
      garantirJogadores(banco.db, PROVEDOR, [entrada]),
    ])

    const identidades = await banco.db.select().from(identidadesJogador)
    const canonicos = await banco.db.select().from(jogadores)
    expect(identidades).toHaveLength(1)
    expect(canonicos).toHaveLength(1)
    expect(identidades[0]?.jogadorId).toBe(canonicos[0]?.id)
  })

  it('mesmo nome em duas fontes preserva um canônico e envia o segundo id à curadoria', async () => {
    const entrada = {
      idExterno: 'primario-77',
      nomeCompleto: 'Luka Dončić',
      timeId: null,
      posicao: null,
      alturaCm: null,
      numeroCamisa: null,
      fotoUrl: null,
      ativo: true,
    }
    await Promise.all([
      garantirJogadores(banco.db, 'primario', [entrada]),
      garantirJogadores(banco.db, 'reserva', [
        { ...entrada, idExterno: 'reserva-009', nomeCompleto: 'Luka Doncic' },
      ]),
    ])

    const identidades = await banco.db.select().from(identidadesJogador)
    const canonicos = await banco.db.select().from(jogadores)
    expect(canonicos).toHaveLength(1)
    expect(identidades).toHaveLength(1)
    expect(identidades[0]?.jogadorId).toBe(canonicos[0]!.id)
    const conflitos = await banco.db.select().from(conflitosIdentidadeJogador)
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0]).toMatchObject({
      estado: 'PENDENTE',
      motivo: 'NOME_COINCIDENTE_REQUER_CURADORIA',
    })
  })

  it('nome canônico ambíguo exige curadoria e não cria vínculo automático', async () => {
    await banco.db
      .insert(jogadores)
      .values([{ nomeCompleto: 'José Silva' }, { nomeCompleto: 'Jose Silva' }])

    await garantirJogadores(banco.db, 'reserva', [
        {
          idExterno: 'reserva-ambiguo',
          nomeCompleto: 'Jose Silva',
          timeId: null,
          posicao: null,
          alturaCm: null,
          numeroCamisa: null,
          fotoUrl: null,
          ativo: true,
        },
      ])

    expect(await banco.db.select().from(identidadesJogador)).toHaveLength(0)
    expect(await banco.db.select().from(conflitosIdentidadeJogador)).toHaveLength(1)
  })

  it('dois ciclos seguidos deixam as mesmas contagens', async () => {
    await ciclo()
    const primeiro = await contagens()

    await ciclo()
    const segundo = await contagens()

    expect(segundo).toEqual(primeiro)
  })

  it('três ciclos não duplicam identidade de jogador', async () => {
    await ciclo()
    await ciclo()
    await ciclo()

    const ids = await banco.db.select().from(identidadesJogador)
    expect(ids).toHaveLength(3)
    expect(new Set(ids.map((i) => i.idExterno)).size).toBe(3)
  })

  it('o mesmo jogo remarcado no dia não vira jogo novo', async () => {
    await ciclo()

    // Tipoff adiado em duas horas — remarcação é rotina, e não é outra partida.
    const remarcado = new FonteFake(PROVEDOR, {
      ...FIXTURE,
      jogos: [{ ...FIXTURE.jogos![0]!, dataHoraUtc: `${DATA}T01:00:00.000Z` }],
    })
    await sincronizarJogos(banco.db, remarcado, DATA, AGORA)

    const todos = await banco.db.select().from(jogos)
    expect(todos, 'a remarcação criou um jogo duplicado').toHaveLength(1)
    expect(todos[0]!.dataHoraUtc.toISOString()).toBe(`${DATA}T01:00:00.000Z`)
  })

  it('identidade da reserva não sobrescreve o snapshot escolhido da primária', async () => {
    await sincronizarTimes(banco.db, fonte())
    await sincronizarJogos(banco.db, fonte(), DATA, AGORA, PROVEDOR, true)
    const reserva = new FonteFake('reserva', {
      jogos: [
        {
          ...FIXTURE.jogos![0]!,
          idExterno: 'reserva-g1',
          placarCasa: 999,
        },
      ],
    })
    await sincronizarJogos(banco.db, reserva, DATA, AGORA, 'reserva', false)

    const [jogo] = await banco.db.select().from(jogos)
    expect(jogo?.placarCasa).toBe(112)
    expect(await banco.db.select().from(identidadesJogo)).toHaveLength(2)
  })

  it('placar que avança sobrescreve, não acumula', async () => {
    await ciclo()

    const avancado = new FonteFake(PROVEDOR, {
      ...FIXTURE,
      jogos: [{ ...FIXTURE.jogos![0]!, placarCasa: 120, quartoAtual: 4, status: 'AO_VIVO' }],
    })
    await sincronizarJogos(banco.db, avancado, DATA, AGORA)

    const todos = await banco.db.select().from(jogos)
    expect(todos).toHaveLength(1)
    expect(todos[0]!.placarCasa).toBe(120)
    expect(todos[0]!.status).toBe('AO_VIVO')
  })
})

// ===========================================================================

describe('médias derivadas', () => {
  it('exclui jogo ao vivo e linha sem minutos positivos (DNP conservador)', async () => {
    const f = new FonteFake(PROVEDOR, {
      ...FIXTURE,
      jogos: [{ ...FIXTURE.jogos![0]!, status: 'AO_VIVO', quartoAtual: 1 }],
      boxScore: [{ ...FIXTURE.boxScore![0]!, minutos: 0 }],
    })
    await sincronizarTimes(banco.db, f)
    await sincronizarJogadores(banco.db, f)
    await sincronizarJogos(banco.db, f, DATA, AGORA)
    const [jogo] = await jogosDaData(banco.db, f, DATA)
    await sincronizarBoxScore(banco.db, f, jogo!, AGORA)
    const resultado = await recalcularMedias(banco.db, {
      janela: 'temporada',
      configTemporada: CONFIG_TEMPORADA,
      agora: AGORA,
    })

    expect(resultado).toEqual({ lidos: 0, gravados: 0 })
    expect(await banco.db.select().from(mediasJogador)).toHaveLength(0)
  })

  it('a média sai do box score, não do provedor', async () => {
    await ciclo()
    const [m] = await banco.db.select().from(mediasJogador)

    // Um jogo com 30 pontos -> ppg 30,00
    expect(m!.jogos).toBe(1)
    expect(Number(m!.ppg)).toBe(30)
    expect(Number(m!.rpg)).toBe(9)
    expect(Number(m!.apg)).toBe(11)
  })

  it('recalcular duas vezes não duplica a linha', async () => {
    await ciclo()
    await recalcularMedias(banco.db, {
      janela: 'temporada',
      configTemporada: CONFIG_TEMPORADA,
      agora: AGORA,
    })

    const todas = await banco.db.select().from(mediasJogador)
    expect(todas).toHaveLength(1)
  })

  it('correção para DNP remove a média antiga', async () => {
    await ciclo()
    await banco.db.update(estatisticasJogo).set({ minutos: '0' })
    await recalcularMedias(banco.db, {
      janela: 'temporada',
      configTemporada: CONFIG_TEMPORADA,
      agora: AGORA,
    })

    expect(await banco.db.select().from(mediasJogador)).toHaveLength(0)
  })
})

// ===========================================================================

describe('dado incompleto não vira dado inventado', () => {
  it('id externo de jogo apontando para outro confronto vai para curadoria', async () => {
    await sincronizarTimes(banco.db, fonte())
    await sincronizarJogos(banco.db, fonte(), DATA, AGORA)
    const divergente = new FonteFake(PROVEDOR, {
      jogos: [
        {
          ...FIXTURE.jogos![0]!,
          timeCasaSigla: 'BOS',
          timeVisitanteSigla: 'LAL',
        },
      ],
    })

    const resultado = await sincronizarJogos(banco.db, divergente, DATA, AGORA)
    expect(resultado.ignorados).toBe(1)
    expect(await banco.db.select().from(jogos)).toHaveLength(1)
    expect(await banco.db.select().from(conflitosIdentidadeJogo)).toHaveLength(1)
  })

  it('jogo com time desconhecido é ignorado, não criado pela metade', async () => {
    const semTimes = new FonteFake(PROVEDOR, {
      jogos: [
        {
          idExterno: 'gX',
          dataReferencia: DATA,
          dataHoraUtc: `${DATA}T23:00:00.000Z`,
          timeCasaSigla: 'XXX',
          timeVisitanteSigla: 'YYY',
          status: 'AGENDADO',
          quartoAtual: null,
          relogio: null,
          intervalo: false,
          placarCasa: null,
          placarVisitante: null,
        },
      ],
    })

    const r = await sincronizarJogos(banco.db, semTimes, DATA, AGORA)

    expect(r.ignorados).toBe(1)
    expect(r.gravados).toBe(0)
    expect(await banco.db.select().from(jogos)).toHaveLength(0)
  })

  it('box score de jogador sem identidade aborta o snapshot inteiro', async () => {
    await sincronizarTimes(banco.db, fonte())
    await sincronizarJogos(banco.db, fonte(), DATA, AGORA)
    const partidas = await jogosDaData(banco.db, fonte(), DATA)

    // Nenhum jogador foi sincronizado: não há identidade para resolver.
    await expect(
      sincronizarBoxScore(banco.db, fonte(), partidas[0]!, AGORA),
    ).rejects.toThrow(/snapshot rejeitado.*sem identidade/)

    expect(await banco.db.select().from(estatisticasJogo)).toHaveLength(0)
  })
})
