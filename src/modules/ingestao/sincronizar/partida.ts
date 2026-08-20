import { and, eq, gte, lt } from 'drizzle-orm'

import {
  classificacao,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogos,
  lesoesEscalacao,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { FonteNBA, LinhaBoxScore } from '../nba/porta'
import { mapaDeJogadores, mapaDeTimes, type Resumo } from './identidade'
import { excluded } from './upsert'

export type JogoParaSincronizar = {
  id: string
  idExterno: string
}

/**
 * Descobre os jogos de uma data e casa cada um com o id do provedor.
 *
 * Devolve o par (id nosso, id do provedor) para que os passos seguintes não
 * precisem repetir a resolução.
 */
export async function jogosDaData(
  db: Db,
  fonte: FonteNBA,
  dataIso: string,
): Promise<JogoParaSincronizar[]> {
  const inicio = new Date(`${dataIso}T00:00:00.000Z`)
  const fim = new Date(`${dataIso}T23:59:59.999Z`)

  const [partidas, porSigla] = await Promise.all([
    db
      .select()
      .from(jogos)
      .where(and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim))),
    mapaDeTimes(db),
  ])

  const siglaPorId = new Map([...porSigla].map(([sigla, id]) => [id, sigla] as const))
  const externos = await fonte.listarJogos(dataIso)

  return partidas.flatMap((p) => {
    const casa = siglaPorId.get(p.timeCasaId)
    const visitante = siglaPorId.get(p.timeVisitanteId)
    if (!casa || !visitante) return []

    const achado = externos.find(
      (g) =>
        g.timeCasaSigla.toUpperCase() === casa &&
        g.timeVisitanteSigla.toUpperCase() === visitante,
    )
    return achado ? [{ id: p.id, idExterno: achado.idExterno }] : []
  })
}

function linhaDeJogador(l: LinhaBoxScore) {
  return {
    minutos: l.minutos === null ? null : String(l.minutos),
    pontos: l.pontos,
    rebotesTotal: l.rebotes,
    rebotesOf: l.rebotesOf,
    rebotesDef: l.rebotesDef,
    assistencias: l.assistencias,
    cestasC: l.cestasC,
    cestasT: l.cestasT,
    doisC: l.doisC,
    doisT: l.doisT,
    tresC: l.tresC,
    tresT: l.tresT,
    lanceC: l.lanceC,
    lanceT: l.lanceT,
    roubos: l.roubos,
    bloqueios: l.bloqueios,
    turnovers: l.turnovers,
    faltas: l.faltas,
    saldoQuadra: l.saldoQuadra,
  }
}

/**
 * BOX SCORE do jogador — total do jogo e quebra por quarto.
 *
 * A linha com `quarto: null` é o total; as demais são o split. As duas vão para
 * tabelas diferentes, e a de quarto é a que o Fire Live lê — sem ela, o
 * workflow observa um estado que nunca muda.
 */
export async function sincronizarBoxScore(
  db: Db,
  fonte: FonteNBA,
  provedor: string,
  jogo: JogoParaSincronizar,
  agora: Date,
): Promise<Resumo> {
  const linhas = await fonte.boxScore(jogo.idExterno)
  if (linhas.length === 0) return { lidos: 0, gravados: 0 }

  const porIdExterno = await mapaDeJogadores(db, provedor)
  const resolvidas = linhas.flatMap((l) => {
    const jogadorId = porIdExterno.get(l.jogadorIdExterno)
    return jogadorId ? [{ ...l, jogadorId }] : []
  })

  const totais = resolvidas.filter((l) => l.quarto === null)
  const quartos = resolvidas.filter((l) => l.quarto !== null)
  let gravados = 0

  if (totais.length > 0) {
    const r = await db
      .insert(estatisticasJogo)
      .values(
        totais.map((l) => ({
          jogoId: jogo.id,
          jogadorId: l.jogadorId,
          ...linhaDeJogador(l),
          atualizadoEm: agora,
        })),
      )
      .onConflictDoUpdate({
        target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
        set: {
          minutos: excluded('minutos'),
          pontos: excluded('pontos'),
          rebotesTotal: excluded('rebotes_total'),
          rebotesOf: excluded('rebotes_of'),
          rebotesDef: excluded('rebotes_def'),
          assistencias: excluded('assistencias'),
          cestasC: excluded('cestas_c'),
          cestasT: excluded('cestas_t'),
          doisC: excluded('dois_c'),
          doisT: excluded('dois_t'),
          tresC: excluded('tres_c'),
          tresT: excluded('tres_t'),
          lanceC: excluded('lance_c'),
          lanceT: excluded('lance_t'),
          roubos: excluded('roubos'),
          bloqueios: excluded('bloqueios'),
          turnovers: excluded('turnovers'),
          faltas: excluded('faltas'),
          saldoQuadra: excluded('saldo_quadra'),
          atualizadoEm: agora,
        },
      })
      .returning({ id: estatisticasJogo.id })
    gravados += r.length
  }

  if (quartos.length > 0) {
    const r = await db
      .insert(estatisticasQuarto)
      .values(
        quartos.map((l) => ({
          jogoId: jogo.id,
          jogadorId: l.jogadorId,
          quarto: l.quarto as number,
          pontos: l.pontos,
          rebotes: l.rebotes,
          assistencias: l.assistencias,
          minutos: l.minutos === null ? null : String(l.minutos),
          atualizadoEm: agora,
        })),
      )
      .onConflictDoUpdate({
        target: [
          estatisticasQuarto.jogoId,
          estatisticasQuarto.jogadorId,
          estatisticasQuarto.quarto,
        ],
        set: {
          pontos: excluded('pontos'),
          rebotes: excluded('rebotes'),
          assistencias: excluded('assistencias'),
          minutos: excluded('minutos'),
          atualizadoEm: agora,
        },
      })
      .returning({ id: estatisticasQuarto.id })
    gravados += r.length
  }

  return { lidos: linhas.length, gravados }
}

/** BOX SCORE do time, com pontos por quarto. */
export async function sincronizarBoxScoreDoTime(
  db: Db,
  fonte: FonteNBA,
  jogo: JogoParaSincronizar,
  agora: Date,
): Promise<Resumo> {
  const linhas = await fonte.boxScoreDoTime(jogo.idExterno)
  if (linhas.length === 0) return { lidos: 0, gravados: 0 }

  const porSigla = await mapaDeTimes(db)
  const resolvidas = linhas.flatMap((l) => {
    const timeId = porSigla.get(l.timeSigla.toUpperCase())
    return timeId ? [{ ...l, timeId }] : []
  })
  if (resolvidas.length === 0) return { lidos: linhas.length, gravados: 0 }

  const gravados = await db
    .insert(estatisticasTimeJogo)
    .values(
      resolvidas.map((l) => ({
        jogoId: jogo.id,
        timeId: l.timeId,
        pontos: l.pontos,
        pontosQ1: l.pontosQ1,
        pontosQ2: l.pontosQ2,
        pontosQ3: l.pontosQ3,
        pontosQ4: l.pontosQ4,
        pontosProrrogacao: l.pontosProrrogacao,
        rebotesTotal: l.rebotesTotal,
        rebotesOf: l.rebotesOf,
        rebotesDef: l.rebotesDef,
        assistencias: l.assistencias,
        cestasC: l.cestasC,
        cestasT: l.cestasT,
        tresC: l.tresC,
        tresT: l.tresT,
        lanceC: l.lanceC,
        lanceT: l.lanceT,
        roubos: l.roubos,
        bloqueios: l.bloqueios,
        turnovers: l.turnovers,
        faltas: l.faltas,
        atualizadoEm: agora,
      })),
    )
    .onConflictDoUpdate({
      target: [estatisticasTimeJogo.jogoId, estatisticasTimeJogo.timeId],
      set: {
        pontos: excluded('pontos'),
        pontosQ1: excluded('pontos_q1'),
        pontosQ2: excluded('pontos_q2'),
        pontosQ3: excluded('pontos_q3'),
        pontosQ4: excluded('pontos_q4'),
        pontosProrrogacao: excluded('pontos_prorrogacao'),
        rebotesTotal: excluded('rebotes_total'),
        rebotesOf: excluded('rebotes_of'),
        rebotesDef: excluded('rebotes_def'),
        assistencias: excluded('assistencias'),
        cestasC: excluded('cestas_c'),
        cestasT: excluded('cestas_t'),
        tresC: excluded('tres_c'),
        tresT: excluded('tres_t'),
        lanceC: excluded('lance_c'),
        lanceT: excluded('lance_t'),
        roubos: excluded('roubos'),
        bloqueios: excluded('bloqueios'),
        turnovers: excluded('turnovers'),
        faltas: excluded('faltas'),
        atualizadoEm: agora,
      },
    })
    .returning({ id: estatisticasTimeJogo.id })

  return { lidos: linhas.length, gravados: gravados.length }
}

/**
 * ESCALAÇÃO — quem está fora.
 *
 * É o dado mais sensível da Lista Secreta: a OPD inteira depende dele, e a
 * escalação oficial só fecha 1h antes do jogo. Por isso o cron é de 6 em 6
 * horas, e o job da Lista Secreta reprocessa quando ela muda.
 */
export async function sincronizarEscalacao(
  db: Db,
  fonte: FonteNBA,
  provedor: string,
  jogo: JogoParaSincronizar,
  agora: Date,
): Promise<Resumo> {
  const linhas = await fonte.escalacao(jogo.idExterno)
  if (linhas.length === 0) return { lidos: 0, gravados: 0 }

  const porIdExterno = await mapaDeJogadores(db, provedor)
  const resolvidas = linhas.flatMap((l) => {
    const jogadorId = porIdExterno.get(l.jogadorIdExterno)
    return jogadorId ? [{ ...l, jogadorId }] : []
  })
  if (resolvidas.length === 0) return { lidos: linhas.length, gravados: 0 }

  const gravados = await db
    .insert(lesoesEscalacao)
    .values(
      resolvidas.map((l) => ({
        jogoId: jogo.id,
        jogadorId: l.jogadorId,
        status: l.status,
        motivo: l.motivo,
        atualizadoEm: agora,
      })),
    )
    .onConflictDoUpdate({
      target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
      set: {
        status: excluded('status'),
        motivo: excluded('motivo'),
        atualizadoEm: agora,
      },
    })
    .returning({ id: lesoesEscalacao.id })

  return { lidos: linhas.length, gravados: gravados.length }
}

/** CLASSIFICAÇÃO da temporada. */
export async function sincronizarClassificacao(
  db: Db,
  fonte: FonteNBA,
  temporada: string,
  agora: Date,
): Promise<Resumo> {
  const linhas = await fonte.classificacao(temporada)
  if (linhas.length === 0) return { lidos: 0, gravados: 0 }

  const porSigla = await mapaDeTimes(db)
  const resolvidas = linhas.flatMap((l) => {
    const timeId = porSigla.get(l.timeSigla.toUpperCase())
    return timeId ? [{ ...l, timeId }] : []
  })
  if (resolvidas.length === 0) return { lidos: linhas.length, gravados: 0 }

  const gravados = await db
    .insert(classificacao)
    .values(
      resolvidas.map((l) => ({
        temporada,
        timeId: l.timeId,
        conferencia: l.conferencia,
        vitorias: l.vitorias,
        derrotas: l.derrotas,
        posicao: l.posicao,
        aproveitamento: l.aproveitamento === null ? null : String(l.aproveitamento),
        sequencia: l.sequencia,
        atualizadoEm: agora,
      })),
    )
    .onConflictDoUpdate({
      target: [classificacao.temporada, classificacao.timeId],
      set: {
        conferencia: excluded('conferencia'),
        vitorias: excluded('vitorias'),
        derrotas: excluded('derrotas'),
        posicao: excluded('posicao'),
        aproveitamento: excluded('aproveitamento'),
        sequencia: excluded('sequencia'),
        atualizadoEm: agora,
      },
    })
    .returning({ id: classificacao.id })

  return { lidos: linhas.length, gravados: gravados.length }
}

/** Jogos que precisam de observação ao vivo agora. */
export async function jogosEmAndamento(db: Db): Promise<{ id: string }[]> {
  return db.select({ id: jogos.id }).from(jogos).where(eq(jogos.status, 'AO_VIVO'))
}
