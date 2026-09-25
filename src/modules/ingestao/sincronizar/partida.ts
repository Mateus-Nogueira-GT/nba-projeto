import { eq, sql } from 'drizzle-orm'

import {
  classificacao,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogos,
  identidadesJogo,
  lesoesEscalacao,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { CapacidadeNaoSuportadaError } from '../nba/porta'
import type { FonteNBA, LinhaBoxScore, LinhaBoxScoreTimeExterna } from '../nba/porta'
import { consultarComOrigem, type ResultadoComOrigem } from '../nba/failover'
import { garantirJogadores, mapaDeJogadores, mapaDeTimes, type Resumo } from './identidade'
import { excluded } from './upsert'

export type JogoParaSincronizar = {
  id: string
  idExterno: string
  provedor: string
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
}

/**
 * Descobre os jogos de uma data e casa cada um com o id do provedor.
 *
 * Devolve o par (id nosso, id do provedor) para que os passos seguintes não
 * precisem repetir a resolução.
 */
export async function jogosDaData(
  db: Db,
  _fonte: FonteNBA,
  dataIso: string,
): Promise<JogoParaSincronizar[]> {
  return db
    .select({
      id: jogos.id,
      idExterno: identidadesJogo.idExterno,
      provedor: identidadesJogo.provedor,
      status: jogos.status,
    })
    .from(jogos)
    .innerJoin(identidadesJogo, eq(identidadesJogo.jogoId, jogos.id))
    .where(eq(jogos.dataReferencia, dataIso))
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
/**
 * Cadastra quem o box score cita e o cadastro não conhece.
 *
 * O cadastro vem de `/players/active` — só o elenco de HOJE. Num jogo de
 * temporada passada isso deixa de fora todo mundo que se aposentou desde
 * então, e a rejeição de `persistirBoxScore` descartaria a partida inteira por
 * causa de um nome. Aqui perguntamos ao provedor quem são esses ids; quem ele
 * também não conhece continua sendo motivo de rejeição, que é o que impede
 * estatística órfã.
 *
 * Fica FORA da transação de propósito: I/O de rede antes do commit, como o
 * resto do módulo. Se a reserva não souber responder, voltamos ao
 * comportamento anterior — o retroativo é trabalho da fonte primária.
 */
export async function resolverJogadoresDesconhecidos(
  db: Db,
  fonte: FonteNBA,
  provedor: string,
  linhas: LinhaBoxScore[],
): Promise<number> {
  const porIdExterno = await mapaDeJogadores(db, provedor)
  const desconhecidos = [...new Set(linhas.map((l) => l.jogadorIdExterno))].filter(
    (id) => !porIdExterno.has(id),
  )
  if (desconhecidos.length === 0) return 0

  let externos
  try {
    externos = await fonte.jogadoresPorId(desconhecidos)
  } catch (erro) {
    if (erro instanceof CapacidadeNaoSuportadaError) return 0
    throw erro
  }
  if (externos.length === 0) return 0

  const times = await mapaDeTimes(db)
  const antes = porIdExterno.size
  const depois = await garantirJogadores(
    db,
    provedor,
    externos.map((j) => ({
      idExterno: j.idExterno,
      nomeCompleto: j.nomeCompleto,
      timeId: j.timeSiglaProvedor ? (times.get(j.timeSiglaProvedor.toUpperCase()) ?? null) : null,
      posicao: j.posicao,
      alturaCm: j.alturaCm,
      numeroCamisa: j.numeroCamisa,
      fotoUrl: j.fotoUrl,
      ativo: j.ativo,
    })),
  )

  return Math.max(0, depois.size - antes)
}

export async function sincronizarBoxScore(
  db: Db,
  fonte: FonteNBA,
  jogo: JogoParaSincronizar,
  agora: Date,
): Promise<Resumo> {
  const resposta = await consultarComOrigem(
    fonte,
    (fonteEfetiva) => fonteEfetiva.boxScore(jogo.idExterno),
    jogo.provedor,
  )
  await resolverJogadoresDesconhecidos(db, fonte, jogo.provedor, resposta.dados)
  return db.transaction((tx) => persistirBoxScore(tx, jogo, agora, resposta))
}

export async function persistirBoxScore(
  db: Db,
  jogo: JogoParaSincronizar,
  agora: Date,
  resposta: ResultadoComOrigem<LinhaBoxScore[]>,
): Promise<Resumo> {
  const { provedor, capturadoEm, dadoAtualizadoEm, dados: linhas } = resposta

  const porIdExterno = await mapaDeJogadores(db, provedor)
  const desconhecidos = [...new Set(linhas.map((l) => l.jogadorIdExterno))].filter(
    (id) => !porIdExterno.has(id),
  )
  if (desconhecidos.length > 0) {
    throw new Error(
      `snapshot rejeitado: ${desconhecidos.length} jogador(es) sem identidade em ${provedor}`,
    )
  }
  // Time é informação extra da linha, não identidade: sigla desconhecida vira
  // `timeId: null` e NÃO rejeita o snapshot — só o jogador sem identidade faz isso.
  const siglas = await mapaDeTimes(db)
  const resolvidas = linhas.flatMap((l) => {
    const jogadorId = porIdExterno.get(l.jogadorIdExterno)
    return jogadorId
      ? [
          {
            ...l,
            jogadorId,
            timeId: l.timeSiglaExterna ? (siglas.get(l.timeSiglaExterna) ?? null) : null,
          },
        ]
      : []
  })

  const totais = resolvidas.filter((l) => l.quarto === null)
  const quartos = resolvidas.filter((l) => l.quarto !== null)
  let gravados = 0

  // O time que já se sabia, por jogador, ANTES de apagar: uma fonte que não
  // informa o time (o failover, ou uma sigla desconhecida) não pode apagar o
  // `time_id` bom de uma passada anterior. Sem ele, a temporada anterior perde
  // o time daquele jogo (spec 25/09, §3.1). Fonte que TRAZ o time manda.
  const timeAnterior = new Map(
    (
      await db
        .select({ jogadorId: estatisticasJogo.jogadorId, timeId: estatisticasJogo.timeId })
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo.id))
    ).flatMap((l) => (l.timeId === null ? [] : [[l.jogadorId, l.timeId] as const])),
  )

  // O endpoint foi homologado como snapshot completo. Substituir dentro da
  // mesma transação remove correções/linhas que desapareceram na origem.
  await db.delete(estatisticasQuarto).where(eq(estatisticasQuarto.jogoId, jogo.id))
  await db.delete(estatisticasJogo).where(eq(estatisticasJogo.jogoId, jogo.id))

  if (totais.length > 0) {
    const r = await db
      .insert(estatisticasJogo)
      .values(
        totais.map((l) => ({
          jogoId: jogo.id,
          jogadorId: l.jogadorId,
          timeId: l.timeId ?? timeAnterior.get(l.jogadorId) ?? null,
          ...linhaDeJogador(l),
          capturadoEm,
          origemAtualizadaEm: dadoAtualizadoEm,
          atualizadoEm: agora,
        })),
      )
      .onConflictDoUpdate({
        target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
        set: {
          // Mesma regra no conflito: null da fonte nunca sobrescreve um time conhecido.
          timeId: sql`coalesce(${excluded('time_id')}, ${estatisticasJogo.timeId})`,
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
          capturadoEm,
          origemAtualizadaEm: dadoAtualizadoEm,
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
          capturadoEm,
          origemAtualizadaEm: dadoAtualizadoEm,
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
          capturadoEm,
          origemAtualizadaEm: dadoAtualizadoEm,
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
  const resposta = await consultarComOrigem(
    fonte,
    (fonteEfetiva) => fonteEfetiva.boxScoreDoTime(jogo.idExterno),
    jogo.provedor,
  )
  return db.transaction((tx) => persistirBoxScoreDoTime(tx, jogo, agora, resposta))
}

export async function persistirBoxScoreDoTime(
  db: Db,
  jogo: JogoParaSincronizar,
  agora: Date,
  resposta: ResultadoComOrigem<LinhaBoxScoreTimeExterna[]>,
): Promise<Resumo> {
  const { capturadoEm, dadoAtualizadoEm, dados: linhas } = resposta
  await db.delete(estatisticasTimeJogo).where(eq(estatisticasTimeJogo.jogoId, jogo.id))
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
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
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
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
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
  jogo: JogoParaSincronizar,
  agora: Date,
): Promise<Resumo> {
  const resposta = await consultarComOrigem(
    fonte,
    (fonteEfetiva) => fonteEfetiva.escalacao(jogo.idExterno),
    jogo.provedor,
  )
  const { provedor, capturadoEm, dadoAtualizadoEm, dados: linhas } = resposta
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
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
        atualizadoEm: agora,
      })),
    )
    .onConflictDoUpdate({
      target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
      set: {
        status: excluded('status'),
        motivo: excluded('motivo'),
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
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
  const {
    capturadoEm,
    dadoAtualizadoEm,
    dados: linhas,
  } = await consultarComOrigem(fonte, (fonteEfetiva) => fonteEfetiva.classificacao(temporada))
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
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
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
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
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
