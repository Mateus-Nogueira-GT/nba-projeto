import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'

import type {
  Atributo,
  Fatos,
  JogadorFato,
  JogoFato,
  JogoHistorico,
  StatusEscalacao,
  TimeFato,
} from '../motor/tipos'
import {
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from './db/schema'
import type { Db } from './db/tipos'
import { chavesEstrategiaConfirmadas, indexarClassificacoes } from './fatos-editoriais'
import { janelaNoBanco, type JanelaMedia } from './janela'
import { colunasDeParticipacao, entrouEmQuadra } from './participacao'
import { intervaloDoDia } from './rodada'
import { temporadaDe, type ConfigTemporada } from './temporada'

/**
 * MONTAGEM DE FATOS — a fronteira entre o mundo com I/O e o motor puro.
 *
 * O motor não busca nada: recebe tudo pronto, inclusive a data de referência.
 * Toda a orquestração de banco vive aqui, e é isso que permite o backtest
 * (ADR-0002) e testes de motor sem mock.
 */

/**
 * A janela UTC de um dia de rodada.
 *
 * Era meia-noite a meia-noite EM UTC, o que no Brasil significa 21h de ontem
 * às 21h de hoje: os jogos noturnos da NBA caíam na rodada errada. O fuso vem
 * do ruleset — ver `dominio/rodada.ts`.
 */
function diaDe(iso: string, fuso: string): { inicio: Date; fim: Date } {
  return intervaloDoDia(iso, fuso)
}

function numero(v: string | null): number | undefined {
  if (v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function montarFatos(
  db: Db,
  dataReferencia: string,
  configTemporada: ConfigTemporada,
  janela: JanelaMedia = 'temporada',
): Promise<Fatos> {
  const { inicio, fim } = diaDe(dataReferencia, configTemporada.fuso)
  const temporada = temporadaDe(inicio, configTemporada)

  // 1 · Versão ATIVA da lista do CJ. Sem ela não há estratégia nenhuma.
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)

  if (!versao) return { dataReferencia, times: [], jogos: [] }

  const classificacoes = await db.select().from(niveis).where(eq(niveis.niveisVersaoId, versao.id))

  if (classificacoes.length === 0) return { dataReferencia, times: [], jogos: [] }

  // 2 · Jogos do dia.
  const partidas = await db
    .select()
    .from(jogos)
    .where(and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim)))
    .orderBy(asc(jogos.dataHoraUtc))

  const idsJogo = partidas.map((p) => p.id)

  // 3 · Carga em lote — evita N+1 numa rodada cheia.
  const idsJogador = [...new Set(classificacoes.map((c) => c.jogadorId))]

  const [elenco, listaTimes, medias, escalacoes, quartos, historicoBruto, chavesEstrategia] =
    await Promise.all([
      idsJogador.length > 0
        ? db.select().from(jogadores).where(inArray(jogadores.id, idsJogador))
        : Promise.resolve([]),
      db.select().from(times),
      idsJogador.length > 0
        ? db
            .select()
            .from(mediasJogador)
            .where(
              and(
                inArray(mediasJogador.jogadorId, idsJogador),
                eq(mediasJogador.janela, janelaNoBanco(janela)),
                eq(mediasJogador.temporada, temporada),
              ),
            )
        : Promise.resolve([]),
      idsJogo.length > 0
        ? db.select().from(lesoesEscalacao).where(inArray(lesoesEscalacao.jogoId, idsJogo))
        : Promise.resolve([]),
      idsJogo.length > 0
        ? db.select().from(estatisticasQuarto).where(inArray(estatisticasQuarto.jogoId, idsJogo))
        : Promise.resolve([]),
      idsJogador.length > 0
        ? db
            .select({
              jogadorId: estatisticasJogo.jogadorId,
              jogoId: estatisticasJogo.jogoId,
              ...colunasDeParticipacao,
              data: jogos.dataHoraUtc,
            })
            .from(estatisticasJogo)
            .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
            .where(
              and(inArray(estatisticasJogo.jogadorId, idsJogador), lt(jogos.dataHoraUtc, inicio)),
            )
        : Promise.resolve([]),
      chavesEstrategiaConfirmadas(db, idsJogador),
    ])

  // 4 · Índices em memória.
  const mediasPorJogador = new Map<string, Partial<Record<Atributo, number>>>()
  for (const m of medias) {
    mediasPorJogador.set(m.jogadorId, {
      PONTOS: numero(m.ppg),
      REBOTES: numero(m.rpg),
      ASSISTENCIAS: numero(m.apg),
    })
  }

  const historicoPorJogador = new Map<string, JogoHistorico[]>()
  for (const h of historicoBruto) {
    const lista = historicoPorJogador.get(h.jogadorId) ?? []
    lista.push({
      jogoId: h.jogoId,
      data: h.data.toISOString(),
      // Reservas também recebem linhas zeradas do provedor. Só minutos
      // positivos OU produção comprovam participação; produzir vence os
      // minutos arredondados para zero, como na conferência dos resultados.
      jogou: entrouEmQuadra(h),
      pontos: h.pontos,
      rebotes: h.rebotes,
      assistencias: h.assistencias,
    })
    historicoPorJogador.set(h.jogadorId, lista)
  }
  for (const lista of historicoPorJogador.values()) {
    // O motor conta do mais recente para o mais antigo.
    lista.sort((a, b) => b.data.localeCompare(a.data))
  }

  const { porTime: classesPorTime } = indexarClassificacoes(classificacoes)

  const dadosJogador = new Map(elenco.map((j) => [j.id, j] as const))

  // 5 · Times com seus jogadores.
  //     ATENÇÃO: o vínculo jogador↔time vem da LISTA do CJ (niveis.time_id),
  //     nunca de jogadores.time_id — os elencos são projetados.
  const jogadoresPorTime = new Map<string, JogadorFato[]>()
  for (const [timeId, classes] of classesPorTime) {
    jogadoresPorTime.set(
      timeId,
      [...classes].map(([jogadorId, dados]) => ({
        id: jogadorId,
        nome: dadosJogador.get(jogadorId)?.nomeCompleto ?? jogadorId,
        timeId,
        ...dados,
        chavesEstrategia: chavesEstrategia.get(jogadorId),
        medias: mediasPorJogador.get(jogadorId) ?? {},
        historico: historicoPorJogador.get(jogadorId) ?? [],
      })),
    )
  }

  const timesFato: TimeFato[] = listaTimes
    .filter((t) => jogadoresPorTime.has(t.id))
    .map((t) => ({
      id: t.id,
      sigla: t.sigla,
      jogadores: (jogadoresPorTime.get(t.id) ?? []).sort(
        (a, b) => a.posicaoHierarquia - b.posicaoHierarquia,
      ),
    }))

  // 6 · Jogos com escalação e split por quarto.
  const escalacaoPorJogo = new Map<string, Record<string, StatusEscalacao>>()
  for (const e of escalacoes) {
    const atual = escalacaoPorJogo.get(e.jogoId) ?? {}
    atual[e.jogadorId] = e.status
    escalacaoPorJogo.set(e.jogoId, atual)
  }

  const jogosFato: JogoFato[] = partidas.map((p) => ({
    id: p.id,
    timeCasaId: p.timeCasaId,
    timeVisitanteId: p.timeVisitanteId,
    quartoAtual: p.quartoAtual,
    escalacao: escalacaoPorJogo.get(p.id) ?? {},
    estatisticasQuarto: quartos
      .filter((q) => q.jogoId === p.id)
      .map((q) => ({
        jogadorId: q.jogadorId,
        quarto: q.quarto,
        pontos: q.pontos,
        rebotes: q.rebotes,
        assistencias: q.assistencias,
      })),
  }))

  return { dataReferencia, times: timesFato, jogos: jogosFato }
}

/** Horário do primeiro jogo do dia — governa quando a Lista Secreta sai. */
export async function primeiroJogoDoDia(
  db: Db,
  dataReferencia: string,
  fuso: string,
): Promise<Date | null> {
  const { inicio, fim } = diaDe(dataReferencia, fuso)

  const [primeiro] = await db
    .select({ dataHoraUtc: jogos.dataHoraUtc })
    .from(jogos)
    .where(and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim)))
    .orderBy(asc(jogos.dataHoraUtc))
    .limit(1)

  return primeiro?.dataHoraUtc ?? null
}
