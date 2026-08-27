import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'

import {
  estatisticasJogo,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { daColuna, maisAntiga } from './atualizacao'
import type { ComAtualizacao } from './atualizacao'
import { notaDaPartida } from './nota'

/**
 * A TELA DE PARTIDA — o centro de gravidade da aba de estatísticas.
 *
 * Leitura DIRETA, sem snapshot: snapshot existe para o feed materializado do
 * motor (uma avaliação por evento, não por usuário). Isto aqui é consulta de
 * dado canônico, que muda quando a liga registra e não quando a estratégia
 * roda.
 *
 * FRONTEIRA: o elenco vem do BOX SCORE REAL e de `jogadores.time_id` — nunca
 * da lista curada do CJ. Usar a lista aqui diria que um jogador atuou num jogo
 * que ele não disputou (CLAUDE.md, "armadilhas conhecidas").
 */

export type LinhaDoBoxScore = {
  jogadorId: string
  nome: string
  posicao: string | null
  minutos: number | null
  pontos: number
  rebotes: number
  assistencias: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
  fgPercentual: number | null
  tresPercentual: number | null
  lancePercentual: number | null
  nota: number | null
}

export type LadoDaPartida = {
  timeId: string
  sigla: string
  nome: string
  placar: number | null
  quartos: { q1: number; q2: number; q3: number; q4: number; prorrogacao: number } | null
  boxScore: LinhaDoBoxScore[]
  /** V/D dos últimos encerrados, do mais recente para o mais antigo. */
  forma: ('V' | 'D')[]
  desfalques: {
    jogadorId: string
    nome: string
    status: 'FORA' | 'DUVIDA'
    motivo: string | null
    confirmado: boolean
  }[]
}

export type LiderDaPartida = {
  rotulo: string
  jogadorId: string
  nome: string
  sigla: string
  valor: number
}

export type ConfrontoAnterior = {
  jogoId: string
  data: Date
  placarCasa: number
  placarVisitante: number
  siglaCasa: string
  siglaVisitante: string
}

export type TelaDoJogo = ComAtualizacao & {
  jogoId: string
  dataHoraUtc: Date
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
  quartoAtual: number | null
  casa: LadoDaPartida
  visitante: LadoDaPartida
  lideres: LiderDaPartida[]
  h2h: ConfrontoAnterior[]
}

const LIMITE_H2H_PADRAO = 5
const LIMITE_FORMA = 5

function percentual(convertidas: number, tentadas: number): number | null {
  if (tentadas === 0) return null
  return Math.round((convertidas / tentadas) * 1000) / 10
}

/** `minutos` chega como numeric (string) do Postgres. */
function numero(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function telaDoJogo(
  db: Db,
  jogoId: string,
  opcoes: { limiteH2H?: number },
): Promise<TelaDoJogo | null> {
  const [jogo] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!jogo) return null

  const idsTimes = [jogo.timeCasaId, jogo.timeVisitanteId]

  const [listaTimes, boxTimes, boxJogadores, elenco, escalacao] = await Promise.all([
    db.select().from(times).where(inArray(times.id, idsTimes)),
    db.select().from(estatisticasTimeJogo).where(eq(estatisticasTimeJogo.jogoId, jogoId)),
    db.select().from(estatisticasJogo).where(eq(estatisticasJogo.jogoId, jogoId)),
    db.select().from(jogadores).where(inArray(jogadores.timeId, idsTimes)),
    db.select().from(lesoesEscalacao).where(eq(lesoesEscalacao.jogoId, jogoId)),
  ])

  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const jogadorPorId = new Map(elenco.map((j) => [j.id, j] as const))

  // Partidas anteriores dos dois times, para forma e H2H numa consulta só.
  const anteriores = await db
    .select()
    .from(jogos)
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        lt(jogos.dataHoraUtc, jogo.dataHoraUtc),
        or(inArray(jogos.timeCasaId, idsTimes), inArray(jogos.timeVisitanteId, idsTimes)),
      ),
    )
    .orderBy(desc(jogos.dataHoraUtc))

  const montarLado = (timeId: string): LadoDaPartida => {
    const time = timePorId.get(timeId)
    const box = boxTimes.find((b) => b.timeId === timeId)

    // O elenco da tela é quem TEM LINHA no box score — não o elenco cadastrado.
    // Jogador sem linha não entrou em quadra, e listá-lo com tudo zerado diria
    // que jogou mal quando ele nem jogou.
    const linhas = boxJogadores
      .filter((l) => jogadorPorId.get(l.jogadorId)?.timeId === timeId)
      .map((l): LinhaDoBoxScore => {
        const jogador = jogadorPorId.get(l.jogadorId)
        const minutos = numero(l.minutos)
        return {
          jogadorId: l.jogadorId,
          nome: jogador?.nomeCompleto ?? '—',
          posicao: jogador?.posicao ?? null,
          minutos,
          pontos: l.pontos,
          rebotes: l.rebotesTotal,
          assistencias: l.assistencias,
          roubos: l.roubos,
          bloqueios: l.bloqueios,
          turnovers: l.turnovers,
          faltas: l.faltas,
          fgPercentual: percentual(l.cestasC, l.cestasT),
          tresPercentual: percentual(l.tresC, l.tresT),
          lancePercentual: percentual(l.lanceC, l.lanceT),
          nota: notaDaPartida({
            minutos,
            pontos: l.pontos,
            cestasC: l.cestasC,
            cestasT: l.cestasT,
            lanceC: l.lanceC,
            lanceT: l.lanceT,
            rebotesOf: l.rebotesOf,
            rebotesDef: l.rebotesDef,
            roubos: l.roubos,
            assistencias: l.assistencias,
            bloqueios: l.bloqueios,
            faltas: l.faltas,
            turnovers: l.turnovers,
          }),
        }
      })
      .sort((a, b) => b.pontos - a.pontos)

    const forma: ('V' | 'D')[] = anteriores
      .filter((j) => j.timeCasaId === timeId || j.timeVisitanteId === timeId)
      .filter((j) => j.placarCasa !== null && j.placarVisitante !== null)
      .slice(0, LIMITE_FORMA)
      .map((j) => {
        const emCasa = j.timeCasaId === timeId
        const meus = emCasa ? j.placarCasa! : j.placarVisitante!
        const outros = emCasa ? j.placarVisitante! : j.placarCasa!
        return meus > outros ? 'V' : 'D'
      })

    const desfalques = escalacao
      .filter((e) => e.status === 'FORA' || e.status === 'DUVIDA')
      .filter((e) => jogadorPorId.get(e.jogadorId)?.timeId === timeId)
      .map((e) => ({
        jogadorId: e.jogadorId,
        nome: jogadorPorId.get(e.jogadorId)?.nomeCompleto ?? '—',
        status: e.status as 'FORA' | 'DUVIDA',
        motivo: e.motivo,
        confirmado: e.confirmado,
      }))

    return {
      timeId,
      sigla: time?.sigla ?? '—',
      nome: time?.nome ?? '—',
      placar: timeId === jogo.timeCasaId ? jogo.placarCasa : jogo.placarVisitante,
      quartos: box
        ? {
            q1: box.pontosQ1,
            q2: box.pontosQ2,
            q3: box.pontosQ3,
            q4: box.pontosQ4,
            prorrogacao: box.pontosProrrogacao,
          }
        : null,
      boxScore: linhas,
      forma,
      desfalques,
    }
  }

  const casa = montarLado(jogo.timeCasaId)
  const visitante = montarLado(jogo.timeVisitanteId)

  // Líderes: o MAIOR de cada categoria entre os dois elencos. Se a tela
  // anuncia um líder que não bate com a tabela logo abaixo, a tela inteira
  // perde a credibilidade.
  const todas = [
    ...casa.boxScore.map((l) => ({ linha: l, sigla: casa.sigla })),
    ...visitante.boxScore.map((l) => ({ linha: l, sigla: visitante.sigla })),
  ]
  const lider = (
    rotulo: string,
    valorDe: (l: LinhaDoBoxScore) => number,
  ): LiderDaPartida | null => {
    if (todas.length === 0) return null
    const melhor = todas.reduce((a, b) => (valorDe(b.linha) > valorDe(a.linha) ? b : a))
    return {
      rotulo,
      jogadorId: melhor.linha.jogadorId,
      nome: melhor.linha.nome,
      sigla: melhor.sigla,
      valor: valorDe(melhor.linha),
    }
  }
  const lideres = [
    lider('Pontos', (l) => l.pontos),
    lider('Rebotes', (l) => l.rebotes),
    lider('Assistências', (l) => l.assistencias),
  ].filter((l): l is LiderDaPartida => l !== null)

  const h2h: ConfrontoAnterior[] = anteriores
    .filter(
      (j) =>
        idsTimes.includes(j.timeCasaId) &&
        idsTimes.includes(j.timeVisitanteId) &&
        j.timeCasaId !== j.timeVisitanteId,
    )
    .filter((j) => j.placarCasa !== null && j.placarVisitante !== null)
    .slice(0, opcoes.limiteH2H ?? LIMITE_H2H_PADRAO)
    .map((j) => ({
      jogoId: j.id,
      data: j.dataHoraUtc,
      placarCasa: j.placarCasa!,
      placarVisitante: j.placarVisitante!,
      siglaCasa: timePorId.get(j.timeCasaId)?.sigla ?? '—',
      siglaVisitante: timePorId.get(j.timeVisitanteId)?.sigla ?? '—',
    }))

  return {
    jogoId: jogo.id,
    dataHoraUtc: jogo.dataHoraUtc,
    status: jogo.status,
    quartoAtual: jogo.quartoAtual,
    casa,
    visitante,
    lideres,
    h2h,
    atualizacao: maisAntiga([
      daColuna(boxJogadores, 'box score'),
      daColuna(boxTimes, 'box score do time'),
      daColuna([jogo], 'partida'),
    ]),
  }
}
