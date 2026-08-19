import { and, desc, eq, inArray } from 'drizzle-orm'

import {
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { daColuna, maisAntiga } from './atualizacao'
import type { ComAtualizacao } from './atualizacao'

/** Percentual de acerto. Null quando não houve tentativa — nunca 0%. */
function percentual(convertidas: number, tentadas: number): number | null {
  if (tentadas === 0) return null
  return Math.round((convertidas / tentadas) * 1000) / 10
}

function numero(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type LinhaHistorico = {
  jogoId: string
  data: Date
  adversarioSigla: string
  /** true = casa. Muda a leitura da linha e do resultado. */
  emCasa: boolean
  /** null quando não dá para determinar — ver `resultadoDoJogo`. */
  resultado: 'V' | 'D' | null
  placar: string | null
  minutos: number | null
  pontos: number
  rebotes: number
  assistencias: number
  fgPercentual: number | null
  tresPercentual: number | null
}

export type BlocoAoVivo = {
  jogoId: string
  adversarioSigla: string
  quartoAtual: number | null
  tempoRestante: string | null
  placar: string | null
  /** Acumulado do jogo em andamento, somando os quartos já registrados. */
  pontos: number
  rebotes: number
  assistencias: number
  /** Quebra por quarto do jogo em andamento. */
  porQuarto: { quarto: number; pontos: number; rebotes: number; assistencias: number }[]
  /**
   * Quando o provedor tocou esses números pela última vez.
   *
   * Vem de `estatisticas_quarto.atualizado_em`, NUNCA do relógio da consulta:
   * um feed travado há 4 minutos não pode ser anunciado como "agora". É
   * justamente no bloco ao vivo que essa diferença importa mais.
   */
  atualizadoEm: Date
}

/** Números completos: ataque, defesa e posse — no jogo e no perfil. */
export type Numeros = {
  ataque: {
    pontos: number | null
    fgPercentual: number | null
    tresPercentual: number | null
    lancePercentual: number | null
    assistencias: number | null
  }
  defesa: {
    rebotesTotal: number | null
    rebotesOf: number | null
    rebotesDef: number | null
    roubos: number | null
    bloqueios: number | null
  }
  posse: {
    minutos: number | null
    turnovers: number | null
    faltas: number | null
    saldoQuadra: number | null
  }
}

export type TelaJogador = ComAtualizacao & {
  perfil: {
    id: string
    nome: string
    fotoUrl: string | null
    posicao: string | null
    alturaCm: number | null
    numeroCamisa: number | null
    timeSigla: string | null
    timeNome: string | null
    timeId: string | null
    ativo: boolean
  }
  /** Médias da temporada — o "perfil" dos números completos. */
  perfilNumeros: Numeros
  jogosDisputados: number
  historico: LinhaHistorico[]
  /** Presente só enquanto o jogador está em jogo. */
  aoVivo: BlocoAoVivo | null
}

/**
 * Determina vitória ou derrota para o jogador naquele jogo.
 *
 * ATENÇÃO ao vínculo jogador↔time. Aqui vale `jogadores.time_id`, o time REAL
 * do provedor — e NÃO `niveis.time_id`, que é a curadoria do CJ. Os elencos da
 * lista são projetados (LeBron no Philadelphia); usá-los aqui diria que o
 * LeBron venceu um jogo do qual não participou. Esta aba mostra dado canônico,
 * não estratégia.
 *
 * Devolve null quando o time do jogador não é nenhum dos dois do jogo — caso
 * real durante a reconciliação de nomes, e melhor exibido como "—" do que
 * chutado.
 */
function resultadoDoJogo(
  timeDoJogador: string | null,
  jogo: { timeCasaId: string; timeVisitanteId: string; placarCasa: number | null; placarVisitante: number | null },
): { resultado: 'V' | 'D' | null; emCasa: boolean; adversarioId: string } {
  const emCasa = timeDoJogador === jogo.timeCasaId
  const adversarioId = emCasa ? jogo.timeVisitanteId : jogo.timeCasaId

  const pertence = timeDoJogador === jogo.timeCasaId || timeDoJogador === jogo.timeVisitanteId
  if (!pertence || jogo.placarCasa === null || jogo.placarVisitante === null) {
    return { resultado: null, emCasa, adversarioId }
  }

  const meus = emCasa ? jogo.placarCasa : jogo.placarVisitante
  const deles = emCasa ? jogo.placarVisitante : jogo.placarCasa
  return { resultado: meus > deles ? 'V' : 'D', emCasa, adversarioId }
}

export async function telaDoJogador(
  db: Db,
  jogadorId: string,
  opcoes: { temporada: string; limiteHistorico?: number } ,
): Promise<TelaJogador | null> {
  const [jogador] = await db.select().from(jogadores).where(eq(jogadores.id, jogadorId)).limit(1)
  if (!jogador) return null

  const limite = opcoes.limiteHistorico ?? 25

  const [linhasBox, listaTimes, medias] = await Promise.all([
    db
      .select({ box: estatisticasJogo, jogo: jogos })
      .from(estatisticasJogo)
      .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
      .where(eq(estatisticasJogo.jogadorId, jogadorId))
      .orderBy(desc(jogos.dataHoraUtc))
      .limit(limite),
    db.select().from(times),
    db
      .select()
      .from(mediasJogador)
      .where(
        and(
          eq(mediasJogador.jogadorId, jogadorId),
          eq(mediasJogador.temporada, opcoes.temporada),
          eq(mediasJogador.janela, 'TEMPORADA'),
        ),
      )
      .limit(1),
  ])

  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  const historico: LinhaHistorico[] = linhasBox.map(({ box, jogo }) => {
    const { resultado, emCasa, adversarioId } = resultadoDoJogo(jogador.timeId, jogo)
    return {
      jogoId: jogo.id,
      data: jogo.dataHoraUtc,
      adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
      emCasa,
      resultado,
      placar:
        jogo.placarCasa === null || jogo.placarVisitante === null
          ? null
          : `${jogo.placarCasa}–${jogo.placarVisitante}`,
      minutos: numero(box.minutos),
      pontos: box.pontos,
      rebotes: box.rebotesTotal,
      assistencias: box.assistencias,
      fgPercentual: percentual(box.cestasC, box.cestasT),
      tresPercentual: percentual(box.tresC, box.tresT),
    }
  })

  // Perfil = média por jogo sobre o histórico carregado, exceto PTS/REB/AST,
  // que vêm de `medias_jogador` — é a mesma média que a estratégia usa, e as
  // duas telas não podem discordar sobre quantos pontos um jogador faz.
  const media = medias[0]
  const n = linhasBox.length
  const somar = (f: (b: (typeof linhasBox)[number]['box']) => number | null): number | null => {
    if (n === 0) return null
    const total = linhasBox.reduce((acc, l) => acc + (f(l.box) ?? 0), 0)
    return Math.round((total / n) * 10) / 10
  }

  const perfilNumeros: Numeros = {
    ataque: {
      pontos: numero(media?.ppg ?? null) ?? somar((b) => b.pontos),
      fgPercentual: percentual(
        linhasBox.reduce((a, l) => a + l.box.cestasC, 0),
        linhasBox.reduce((a, l) => a + l.box.cestasT, 0),
      ),
      tresPercentual: percentual(
        linhasBox.reduce((a, l) => a + l.box.tresC, 0),
        linhasBox.reduce((a, l) => a + l.box.tresT, 0),
      ),
      lancePercentual: percentual(
        linhasBox.reduce((a, l) => a + l.box.lanceC, 0),
        linhasBox.reduce((a, l) => a + l.box.lanceT, 0),
      ),
      assistencias: numero(media?.apg ?? null) ?? somar((b) => b.assistencias),
    },
    defesa: {
      rebotesTotal: numero(media?.rpg ?? null) ?? somar((b) => b.rebotesTotal),
      rebotesOf: somar((b) => b.rebotesOf),
      rebotesDef: somar((b) => b.rebotesDef),
      roubos: somar((b) => b.roubos),
      bloqueios: somar((b) => b.bloqueios),
    },
    posse: {
      minutos: somar((b) => numero(b.minutos)),
      turnovers: somar((b) => b.turnovers),
      faltas: somar((b) => b.faltas),
      saldoQuadra: somar((b) => b.saldoQuadra),
    },
  }

  const aoVivo = await blocoAoVivo(db, jogadorId, jogador.timeId, timePorId)

  return {
    perfil: {
      id: jogador.id,
      nome: jogador.nomeCompleto,
      fotoUrl: jogador.fotoUrl,
      posicao: jogador.posicao,
      alturaCm: jogador.alturaCm,
      numeroCamisa: jogador.numeroCamisa,
      timeId: jogador.timeId,
      timeSigla: jogador.timeId === null ? null : (timePorId.get(jogador.timeId)?.sigla ?? null),
      timeNome: jogador.timeId === null ? null : (timePorId.get(jogador.timeId)?.nome ?? null),
      ativo: jogador.ativo,
    },
    perfilNumeros,
    jogosDisputados: media?.jogos ?? n,
    historico,
    aoVivo,
    atualizacao: maisAntiga([
      daColuna(
        linhasBox.map((l) => l.box),
        'box score',
      ),
      media ? { em: media.atualizadoEm, fonte: 'médias' } : null,
      aoVivo === null ? null : { em: aoVivo.atualizadoEm, fonte: 'ao vivo' },
    ]),
  }
}

/**
 * Bloco ao vivo — só existe enquanto o jogador está em jogo.
 *
 * Monta o acumulado a partir da quebra por quarto, e não de
 * `estatisticas_jogo`: durante a partida o box score fechado ainda não existe.
 * É o mesmo dado que alimenta o Fire Live, lido aqui só para exibição.
 */
async function blocoAoVivo(
  db: Db,
  jogadorId: string,
  timeDoJogador: string | null,
  timePorId: Map<string, { id: string; sigla: string; nome: string }>,
): Promise<BlocoAoVivo | null> {
  if (timeDoJogador === null) return null

  const emAndamento = await db.select().from(jogos).where(eq(jogos.status, 'AO_VIVO'))
  const jogo = emAndamento.find(
    (j) => j.timeCasaId === timeDoJogador || j.timeVisitanteId === timeDoJogador,
  )
  if (!jogo) return null

  const quartos = await db
    .select()
    .from(estatisticasQuarto)
    .where(
      and(eq(estatisticasQuarto.jogoId, jogo.id), eq(estatisticasQuarto.jogadorId, jogadorId)),
    )

  const emCasa = jogo.timeCasaId === timeDoJogador
  const adversarioId = emCasa ? jogo.timeVisitanteId : jogo.timeCasaId

  // Sem linha de quarto ainda, o mais recente que existe é a própria partida.
  const atualizadoEm = quartos.reduce(
    (maior, q) => (q.atualizadoEm > maior ? q.atualizadoEm : maior),
    jogo.atualizadoEm,
  )

  return {
    jogoId: jogo.id,
    atualizadoEm,
    adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
    quartoAtual: jogo.quartoAtual,
    tempoRestante: jogo.tempoRestante,
    placar:
      jogo.placarCasa === null || jogo.placarVisitante === null
        ? null
        : `${jogo.placarCasa}–${jogo.placarVisitante}`,
    pontos: quartos.reduce((a, q) => a + q.pontos, 0),
    rebotes: quartos.reduce((a, q) => a + q.rebotes, 0),
    assistencias: quartos.reduce((a, q) => a + q.assistencias, 0),
    porQuarto: quartos
      .sort((a, b) => a.quarto - b.quarto)
      .map((q) => ({
        quarto: q.quarto,
        pontos: q.pontos,
        rebotes: q.rebotes,
        assistencias: q.assistencias,
      })),
  }
}

/** Ids de jogadores citados em cards — usado para montar os links do feed. */
export async function nomesDeJogadores(
  db: Db,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const linhas = await db.select().from(jogadores).where(inArray(jogadores.id, ids))
  return new Map(linhas.map((j) => [j.id, j.nomeCompleto] as const))
}
