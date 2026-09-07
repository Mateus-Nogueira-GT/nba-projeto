import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import {
  apitos,
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { daColuna, maisAntiga } from './atualizacao'

// A aba de estatísticas NÃO importa do motor (regra `estatisticas-nao-passam-
// pelo-motor`). O atributo aqui é o do dado canônico — o enum do schema.
type Atributo = (typeof apitos.$inferSelect)['atributo']
import type { ComAtualizacao } from './atualizacao'
import { notaDaPartida } from './nota'
import { numero, percentual } from './numeros'

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
    doisPercentual: number | null
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
  /**
   * "O número" do jogador na identidade 04: a média das notas da partida dos
   * últimos 5 jogos com nota (3–10, uma casa). Dado canônico — nunca aparece
   * no card do apito, só nesta aba. null sem jogo com nota.
   */
  notaMediaRecente: number | null
  /**
   * O time do jogador NA LISTA DO CJ (curadoria, `niveis` da versão ativa —
   * Giannis no Miami), rotulado à parte de `perfil.timeSigla`, que é o time
   * REAL do provedor. As duas visões convivem na tela com rótulo explícito;
   * sem rótulo, a divergência é lida como bug.
   */
  timeNaListaDoCj: { id: string; sigla: string; nome: string } | null
}

/** Um apito conferido do jogador — a linha da nossa "aba Games" com ✓/✗. */
export type ApitoDoJogador = {
  dataReferencia: string
  jogoId: string
  adversarioSigla: string
  emCasa: boolean
  atributo: Atributo
  /** A linha mais baixa que a lista ofereceu — a que a conferência usa. */
  linhaMaisBaixa: number
  /** O que ele fez no atributo; null = não jogou. */
  fez: number | null
  /** null quando não jogou (neutro). */
  bateu: boolean | null
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
  /**
   * Média sobre os jogos em que o número EXISTE.
   *
   * Tratar ausência como zero afunda a média: um jogo sem minutos registrados
   * (falha de ingestão, não jogo sem minutos) transformava 36 e 34 em 23,3.
   * O jogador passaria a parecer reserva por causa de um buraco no dado.
   */
  const somar = (f: (b: (typeof linhasBox)[number]['box']) => number | null): number | null => {
    const valores = linhasBox.map((l) => f(l.box)).filter((v): v is number => v !== null)
    if (valores.length === 0) return null
    const total = valores.reduce((acc, v) => acc + v, 0)
    return Math.round((total / valores.length) * 10) / 10
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
      // 2P = FG − 3P: derivação padrão do basquete. Vale para qualquer
      // provedor, inclusive os que não separam a coluna de 2 pontos.
      doisPercentual: percentual(
        linhasBox.reduce((a, l) => a + (l.box.cestasC - l.box.tresC), 0),
        linhasBox.reduce((a, l) => a + (l.box.cestasT - l.box.tresT), 0),
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

  // Nota média recente: as últimas 5 partidas COM nota (menos de 5 minutos não
  // tem nota — ver nota.ts). O histórico já vem do mais recente para o mais antigo.
  const notas = linhasBox
    .map(({ box }) =>
      notaDaPartida({
        minutos: numero(box.minutos),
        pontos: box.pontos,
        cestasC: box.cestasC,
        cestasT: box.cestasT,
        lanceC: box.lanceC,
        lanceT: box.lanceT,
        rebotesOf: box.rebotesOf,
        rebotesDef: box.rebotesDef,
        roubos: box.roubos,
        assistencias: box.assistencias,
        bloqueios: box.bloqueios,
        faltas: box.faltas,
        turnovers: box.turnovers,
      }),
    )
    .filter((n): n is number => n !== null)
    .slice(0, 5)
  const notaMediaRecente =
    notas.length === 0 ? null : Math.round((notas.reduce((a, v) => a + v, 0) / notas.length) * 10) / 10

  const timeNaListaDoCj = await timeNaListaDoCjDe(db, jogadorId, timePorId)

  return {
    notaMediaRecente,
    timeNaListaDoCj,
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
 * O time do jogador segundo a LISTA DO CJ (versão ativa de níveis). A
 * hierarquia de PONTOS é a única que o CJ classificou; o vínculo de time é o
 * mesmo em todos os atributos.
 */
async function timeNaListaDoCjDe(
  db: Db,
  jogadorId: string,
  timePorId: Map<string, { id: string; sigla: string; nome: string }>,
): Promise<{ id: string; sigla: string; nome: string } | null> {
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return null
  const [vinculo] = await db
    .select({ timeId: niveis.timeId })
    .from(niveis)
    .where(and(eq(niveis.niveisVersaoId, versao.id), eq(niveis.jogadorId, jogadorId), eq(niveis.atributo, 'PONTOS')))
    .limit(1)
  const time = vinculo ? timePorId.get(vinculo.timeId) : undefined
  return time ? { id: time.id, sigla: time.sigla, nome: time.nome } : null
}

/**
 * Os apitos da ESTRATÉGIA sobre este jogador, conferidos — a nossa versão da
 * aba "Games" com rating (identidade 04). Vive na aba de estatísticas com o
 * rótulo "apitos da estratégia": é o mecanismo de confiança verificável do
 * Sofascore aplicado ao CJ, e o dono do produto disse sim (Q17).
 *
 * Um registro por (jogo, atributo); a conferência é pela linha MAIS BAIXA,
 * como em `conferirRodadas`. O adversário é lido pelo time da LISTA do CJ,
 * não pelo `jogadores.time_id`: é a estratégia que apitou, e ela enxerga o
 * elenco projetado.
 */
export async function apitosDoJogador(db: Db, jogadorId: string, limite: number): Promise<ApitoDoJogador[]> {
  const linhas = await db
    .select({
      dataReferencia: jogos.dataReferencia,
      jogoId: apitos.jogoId,
      atributo: apitos.atributo,
      linha: apitos.linha,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
      status: jogos.status,
      pontos: estatisticasJogo.pontos,
      rebotes: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
    })
    .from(apitos)
    .innerJoin(jogos, eq(apitos.jogoId, jogos.id))
    .leftJoin(
      estatisticasJogo,
      and(eq(estatisticasJogo.jogoId, apitos.jogoId), eq(estatisticasJogo.jogadorId, apitos.jogadorId)),
    )
    .where(and(eq(apitos.estrategia, 'LISTA_SECRETA'), eq(apitos.jogadorId, jogadorId)))
    .orderBy(desc(jogos.dataReferencia), asc(apitos.atributo), asc(apitos.linha))

  if (linhas.length === 0) return []

  const listaTimes = await db.select({ id: times.id, sigla: times.sigla, nome: times.nome }).from(times)
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const meuTime = (await timeNaListaDoCjDe(db, jogadorId, timePorId))?.id ?? null

  const porCard = new Map<string, ApitoDoJogador>()
  for (const l of linhas) {
    if (l.linha === null) continue
    const chave = `${l.jogoId}|${l.atributo}`
    const emCasa = meuTime === l.timeCasaId
    const adversarioId = emCasa ? l.timeVisitanteId : l.timeCasaId
    const valor =
      l.pontos === null
        ? null
        : l.atributo === 'PONTOS'
          ? l.pontos
          : l.atributo === 'REBOTES'
            ? l.rebotes
            : l.assistencias
    // Jogo ainda não encerrado não é "não jogou": é ainda não conferido.
    const fez = l.status === 'ENCERRADO' ? valor : null
    const atual = porCard.get(chave)
    if (!atual) {
      porCard.set(chave, {
        dataReferencia: l.dataReferencia,
        jogoId: l.jogoId,
        adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
        emCasa,
        atributo: l.atributo,
        linhaMaisBaixa: l.linha,
        fez,
        bateu: fez === null ? null : fez >= l.linha,
      })
    } else if (l.linha < atual.linhaMaisBaixa) {
      atual.linhaMaisBaixa = l.linha
      atual.bateu = atual.fez === null ? null : atual.fez >= l.linha
    }
  }

  return [...porCard.values()].slice(0, limite)
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
