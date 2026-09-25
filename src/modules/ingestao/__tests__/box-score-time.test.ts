import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { estatisticasJogo, identidadesJogador, jogadores, jogos, times } from '../../dominio/db/schema'
import { mapearLinhaStatsBalldontlie } from '../nba/adaptadores/balldontlie'
import { persistirBoxScore } from '../sincronizar/partida'
import type { LinhaBoxScore } from '../nba/porta'

const linhaBruta = {
  id: 1,
  min: '34:10',
  fgm: 10,
  fga: 20,
  fg3m: 2,
  fg3a: 5,
  ftm: 5,
  fta: 6,
  oreb: 2,
  dreb: 8,
  reb: 10,
  ast: 7,
  stl: 1,
  blk: 1,
  turnover: 3,
  pf: 2,
  pts: 27,
  plus_minus: 5,
  // first_name/last_name/position e game são exigidos pelo schema por outros
  // motivos (não fazem parte do recorte desta tarefa) — preenchidos só para
  // a linha validar.
  player: { id: 15, first_name: 'Giannis', last_name: 'Antetokounmpo', position: 'PF' },
  game: { id: 999 },
  team: { id: 17, abbreviation: 'MIL' },
}

describe('box score leva o time da linha', () => {
  it('a sigla do time vem da linha de stats da BallDontLie', () => {
    expect(mapearLinhaStatsBalldontlie(linhaBruta, null).timeSiglaExterna).toBe('MIL')
  })

  it('linha sem time não quebra: vira null', () => {
    const { team: _t, ...semTime } = linhaBruta
    expect(mapearLinhaStatsBalldontlie(semTime, null).timeSiglaExterna).toBeNull()
  })

  it('persistirBoxScore grava o time_id da linha quando a sigla é conhecida', async () => {
    const banco = await bancoDeTeste()
    try {
      const [mil] = await banco.db
        .insert(times)
        .values({ sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' })
        .returning()
      const [jogador] = await banco.db
        .insert(jogadores)
        .values({ nomeCompleto: 'Giannis Antetokounmpo' })
        .returning()
      await banco.db
        .insert(identidadesJogador)
        .values({ jogadorId: jogador!.id, provedor: 'balldontlie', idExterno: '15' })
      const [outroTime] = await banco.db
        .insert(times)
        .values({ sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' })
        .returning()
      const [jogo] = await banco.db
        .insert(jogos)
        .values({
          dataHoraUtc: new Date('2026-01-01T23:00:00.000Z'),
          dataReferencia: '2026-01-01',
          timeCasaId: mil!.id,
          timeVisitanteId: outroTime!.id,
          status: 'ENCERRADO',
        })
        .returning()

      const linha: LinhaBoxScore = {
        jogadorIdExterno: '15',
        timeSiglaExterna: 'MIL',
        quarto: null,
        minutos: 34,
        pontos: 27,
        rebotes: 10,
        rebotesOf: 2,
        rebotesDef: 8,
        assistencias: 7,
        roubos: 1,
        bloqueios: 1,
        turnovers: 3,
        faltas: 2,
        cestasC: 10,
        cestasT: 20,
        doisC: 8,
        doisT: 15,
        tresC: 2,
        tresT: 5,
        lanceC: 5,
        lanceT: 6,
        saldoQuadra: 5,
      }

      await persistirBoxScore(
        banco.db,
        { id: jogo!.id, idExterno: 'g-mil', provedor: 'balldontlie', status: 'ENCERRADO' },
        new Date('2026-01-01T23:30:00.000Z'),
        { provedor: 'balldontlie', capturadoEm: new Date(), dadoAtualizadoEm: null, modo: 'SNAPSHOT', dados: [linha] },
      )

      const [linhaGravada] = await banco.db
        .select()
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo!.id))

      expect(linhaGravada!.timeId).toBe(mil!.id)
    } finally {
      await banco.fechar()
    }
    // Subir o PGlite (todas as migrations) dentro do teste estoura o padrão
    // de 5s da suíte — mesmo padrão usado em demo.test.ts.
  }, 30_000)

  it('persistirBoxScore não rejeita o snapshot quando a sigla do time é desconhecida: time_id vira null', async () => {
    const banco = await bancoDeTeste()
    try {
      const [casa] = await banco.db
        .insert(times)
        .values({ sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' })
        .returning()
      const [fora] = await banco.db
        .insert(times)
        .values({ sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' })
        .returning()
      const [jogador] = await banco.db
        .insert(jogadores)
        .values({ nomeCompleto: 'Giannis Antetokounmpo' })
        .returning()
      await banco.db
        .insert(identidadesJogador)
        .values({ jogadorId: jogador!.id, provedor: 'balldontlie', idExterno: '15' })
      const [jogo] = await banco.db
        .insert(jogos)
        .values({
          dataHoraUtc: new Date('2026-01-01T23:00:00.000Z'),
          dataReferencia: '2026-01-01',
          timeCasaId: casa!.id,
          timeVisitanteId: fora!.id,
          status: 'ENCERRADO',
        })
        .returning()

      const linha: LinhaBoxScore = {
        jogadorIdExterno: '15',
        timeSiglaExterna: 'ZZZ',
        quarto: null,
        minutos: 34,
        pontos: 27,
        rebotes: 10,
        rebotesOf: 2,
        rebotesDef: 8,
        assistencias: 7,
        roubos: 1,
        bloqueios: 1,
        turnovers: 3,
        faltas: 2,
        cestasC: 10,
        cestasT: 20,
        doisC: 8,
        doisT: 15,
        tresC: 2,
        tresT: 5,
        lanceC: 5,
        lanceT: 6,
        saldoQuadra: 5,
      }

      await persistirBoxScore(
        banco.db,
        { id: jogo!.id, idExterno: 'g-zzz', provedor: 'balldontlie', status: 'ENCERRADO' },
        new Date('2026-01-01T23:30:00.000Z'),
        { provedor: 'balldontlie', capturadoEm: new Date(), dadoAtualizadoEm: null, modo: 'SNAPSHOT', dados: [linha] },
      )

      const [linhaGravada] = await banco.db
        .select()
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo!.id))

      expect(linhaGravada!.timeId).toBeNull()
    } finally {
      await banco.fechar()
    }
  }, 30_000)

  it('ressincronizar de uma fonte SEM time não apaga o time_id bom que já estava gravado', async () => {
    const banco = await bancoDeTeste()
    try {
      const [mil] = await banco.db
        .insert(times)
        .values({ sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' })
        .returning()
      const [bos] = await banco.db
        .insert(times)
        .values({ sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' })
        .returning()
      const [jogador] = await banco.db
        .insert(jogadores)
        .values({ nomeCompleto: 'Giannis Antetokounmpo' })
        .returning()
      await banco.db
        .insert(identidadesJogador)
        .values({ jogadorId: jogador!.id, provedor: 'balldontlie', idExterno: '15' })
      const [jogo] = await banco.db
        .insert(jogos)
        .values({
          dataHoraUtc: new Date('2026-01-01T23:00:00.000Z'),
          dataReferencia: '2026-01-01',
          timeCasaId: mil!.id,
          timeVisitanteId: bos!.id,
          status: 'ENCERRADO',
        })
        .returning()

      const linha = (timeSiglaExterna: string | null, pontos: number): LinhaBoxScore => ({
        jogadorIdExterno: '15',
        timeSiglaExterna,
        quarto: null,
        minutos: 34,
        pontos,
        rebotes: 10,
        rebotesOf: 2,
        rebotesDef: 8,
        assistencias: 7,
        roubos: 1,
        bloqueios: 1,
        turnovers: 3,
        faltas: 2,
        cestasC: 10,
        cestasT: 20,
        doisC: 8,
        doisT: 15,
        tresC: 2,
        tresT: 5,
        lanceC: 5,
        lanceT: 6,
        saldoQuadra: 5,
      })
      const sincronizar = (l: LinhaBoxScore) =>
        persistirBoxScore(
          banco.db,
          { id: jogo!.id, idExterno: 'g-mil', provedor: 'balldontlie', status: 'ENCERRADO' },
          new Date('2026-01-01T23:30:00.000Z'),
          { provedor: 'balldontlie', capturadoEm: new Date(), dadoAtualizadoEm: null, modo: 'SNAPSHOT', dados: [l] },
        )

      await sincronizar(linha('MIL', 27))
      // A segunda passada vem de uma fonte que não informa o time (failover).
      await sincronizar(linha(null, 29))

      const [gravada] = await banco.db
        .select()
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo!.id))
      // O número é o da passada nova; o time, o que já se sabia.
      expect(gravada!.pontos).toBe(29)
      expect(gravada!.timeId).toBe(mil!.id)

      // Uma fonte que TRAZ o time continua mandando: correção de time vale.
      await sincronizar(linha('BOS', 29))
      const [corrigida] = await banco.db
        .select()
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo!.id))
      expect(corrigida!.timeId).toBe(bos!.id)
    } finally {
      await banco.fechar()
    }
  }, 30_000)
})
