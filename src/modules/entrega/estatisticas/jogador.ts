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
/** Nível do JOGADOR (MVP · All Star · Suporte · Randola) — enum do schema. */
type NivelDoJogador = (typeof niveis.$inferSelect)['nivel']
import type { ComAtualizacao } from './atualizacao'
import { notaDaPartida } from './nota'
import { numero, percentual } from './numeros'

export type LinhaHistorico = {
  jogoId: string
  data: Date
  /** null junto com `emCasa` — ver `mandoDoJogador`. */
  adversarioSigla: string | null
  /**
   * true = casa, false = fora, null = SEM MANDO: o vínculo jogador↔time não
   * põe o jogador em nenhum dos dois lados. Ver `mandoDoJogador`.
   */
  emCasa: boolean | null
  /** null quando não dá para determinar — ver `resultadoDoJogo`. */
  resultado: 'V' | 'D' | null
  placar: string | null
  minutos: number | null
  pontos: number
  rebotes: number
  assistencias: number
  fgPercentual: number | null
  tresPercentual: number | null
  /**
   * A nota da partida (3–10) daquele jogo — "o número" do jogador na
   * identidade 04. null quando o box não sustenta nota (menos de
   * `MINUTOS_MINIMOS`). Nunca "nível": nível é do jogador e do apito.
   */
  nota: number | null
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
  /**
   * `jogosDisputados` conta a JANELA CARREGADA, não a temporada.
   *
   * Ele vem de `medias_jogador` (a temporada inteira), mas cai no tamanho do
   * histórico quando essa linha não existe para (jogador, temporada,
   * TEMPORADA) — fallback deliberado, não hipótese. Se o histórico também foi
   * cortado, o número passa a ser o do recorte, e o hero escrevia
   * "25 jogos · 2025-26" com ele: a mesma afirmação sobre a temporada que
   * `historicoCortado` tirou da tabela, duas linhas abaixo. PTS/REB/AST do topo
   * caem na mesma janela pelo mesmo motivo (é a mesma linha de médias).
   *
   * Separado de `historicoCortado` de propósito: COM a linha de médias, cortar
   * a tabela não torna falso o número do hero — ele continua sendo o da
   * temporada, e trocar o rótulo ali seria introduzir a mentira simétrica.
   */
  jogosDisputadosDoRecorte: boolean
  historico: LinhaHistorico[]
  /**
   * O histórico bateu no limite e foi CORTADO.
   *
   * A tela precisa dizer isso: `jogosDisputados` vem de `medias_jogador` (a
   * temporada inteira) e o histórico para no limite, então o perfil escrevia
   * "68 jogos · temporada 2025-26" duas linhas acima de uma tabela de 25
   * linhas rotulada "temporada 2025-26". As médias de "Números completos" e a
   * nota média recente nascem da mesma janela — o recorte vale para as três.
   *
   * Lido com UMA partida a mais que o limite, como o histórico de apitos:
   * é a única forma de saber que cortou sem uma segunda consulta.
   */
  historicoCortado: boolean
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
   *
   * `nivel` é o NÍVEL DO JOGADOR em pontos, o único atributo que o CJ
   * classificou — vem junto porque é a mesma linha de `niveis` e a tela mostra
   * os dois no mesmo fôlego ("na lista do CJ MIA · Suporte em pontos").
   */
  timeNaListaDoCj: { id: string; sigla: string; nome: string; nivel: NivelDoJogador } | null
}

/**
 * Em que ponto do ciclo está o apito, do ponto de vista do perfil.
 *
 * É a MESMA regra de `estadoDoCiclo` (`../lista-por-jogo.ts`), com os estados
 * anteriores ao veredito colapsados num só — o perfil não desenha o 1º quarto,
 * ele só precisa saber se já dá para dizer ✓/✗:
 *
 *   AGUARDANDO_OFICIAL  jogo por acontecer, em andamento, ENCERRADO com o box
 *                       score do jogador ainda não recebido, ou box recebido
 *                       SEM O MINUTO e com a linha inteira zerada
 *   NAO_JOGOU           box score com MINUTO ZERO e nada produzido — o DNP
 *   CONFERIDO           box score que sustenta veredito: minuto em quadra, ou
 *                       produção na linha (que é prova de que ele entrou)
 *
 * A distinção entre os dois primeiros é o que a spec §5.1 exige ("nunca
 * inferir de parcial"): ausência de linha é dado que não chegou, nunca um
 * jogador que não entrou em quadra.
 *
 * MINUTO NULO não é minuto zero (`minutos` é NULLABLE, e o adaptador emite
 * null sempre que o provedor manda `min: null`), mas também não é a linha
 * inteira faltando. O corte é pelo dado que a CONFERÊNCIA usa: `conferirRodadas`
 * — a tela de Resultados, sobre a mesma (jogo, jogador, atributo) — decide
 * `bateu` pelo valor do atributo e não olha minuto nenhum. Então:
 *
 * - minuto nulo COM produção (pontos, rebotes ou assistências acima de zero) é
 *   CONFERIDO. O dado oficial CHEGOU: mandar essa linha para "aguardando dado
 *   oficial" fazia a seção de apitos negar o que a tabela jogo a jogo imprimia
 *   três linhas abaixo, na mesma tela, e discordar do "fez 18 ✓" da tela de
 *   Resultados.
 * - minuto nulo com a linha TODA zerada não sustenta veredito: nada ali
 *   distingue o reserva que não entrou do box que chegou pela metade. "fez 0 ✗"
 *   pintaria de vermelho quem talvez nem tenha jogado.
 * - o mesmo argumento derruba "não jogou" sobre uma linha com produção, e por
 *   isso o DNP também pede a linha zerada: um box de 0 minuto com 18 pontos
 *   (provedor que arredonda para baixo quem entrou nos segundos finais) diria
 *   "não jogou" bem em cima do "pts 18" que a tabela imprime.
 *
 * A coluna NOTA continua "—" no minuto nulo, e não é contradição: `notaDaPartida`
 * normaliza por minuto, então sem minuto não há NOTA a dar — o que é diferente
 * de não haver PONTOS a contar.
 */
export type EstadoDoApito = 'AGUARDANDO_OFICIAL' | 'NAO_JOGOU' | 'CONFERIDO'

/** Um apito conferido do jogador — a linha da nossa "aba Games" com ✓/✗. */
export type ApitoDoJogador = {
  /**
   * O INSTANTE da partida (`jogos.data_hora_utc`), o mesmo que a tabela jogo a
   * jogo formata. Não é `data_referencia`: o rótulo de calendário do provedor e
   * o instante caem em dias diferentes para todo jogo que começa às 22h ET, e a
   * mesma partida saía com duas datas na mesma tela.
   */
  data: Date
  jogoId: string
  /** null junto com `emCasa` — ver `mandoDoJogador`. */
  adversarioSigla: string | null
  /** Mesma leitura de `LinhaHistorico.emCasa`, pela MESMA fonte. */
  emCasa: boolean | null
  atributo: Atributo
  /** A linha mais baixa que a lista ofereceu — a que a conferência usa. */
  linhaMaisBaixa: number
  /** O que ele fez no atributo; null fora de `CONFERIDO`. */
  fez: number | null
  /** null quando não há veredito (não jogou, ou dado que não chegou). */
  bateu: boolean | null
  estado: EstadoDoApito
}

/**
 * MANDO E ADVERSÁRIO — a fonte ÚNICA da tela do jogador.
 *
 * ATENÇÃO ao vínculo jogador↔time. Aqui vale `jogadores.time_id`, o time REAL
 * do provedor — e NÃO `niveis.time_id`, que é a curadoria do CJ. Os elencos da
 * lista são projetados (LeBron no Philadelphia); usá-los aqui diria que o
 * LeBron venceu um jogo do qual não participou. É a exceção que o CLAUDE.md
 * escreve para esta aba: ela exibe dado canônico, não estratégia.
 *
 * UMA fonte para a tela inteira, e por isso esta função existe. Enquanto o
 * histórico de apitos lia o time da LISTA e a tabela jogo a jogo lia o time
 * real, a MESMA partida saía com adversários opostos a três linhas de
 * distância no mesmo perfil.
 *
 * `emCasa: null` quando o time do jogador não é nenhum dos dois do jogo —
 * caso real durante a reconciliação de nomes. Chutar `false` fazia a tela
 * imprimir "@ <time da casa>", que pode ser o PRÓPRIO time do jogador; sem
 * mando não há nem "vs" nem "@".
 */
function mandoDoJogador(
  timeDoJogador: string | null,
  jogo: { timeCasaId: string; timeVisitanteId: string },
): { emCasa: boolean | null; adversarioId: string | null } {
  if (timeDoJogador !== null && timeDoJogador === jogo.timeCasaId) {
    return { emCasa: true, adversarioId: jogo.timeVisitanteId }
  }
  if (timeDoJogador !== null && timeDoJogador === jogo.timeVisitanteId) {
    return { emCasa: false, adversarioId: jogo.timeCasaId }
  }
  return { emCasa: null, adversarioId: null }
}

/**
 * Determina vitória ou derrota para o jogador naquele jogo, pelo mando de
 * `mandoDoJogador`. Sem mando não há resultado: melhor exibido como "—" do
 * que chutado.
 */
function resultadoDoJogo(
  timeDoJogador: string | null,
  jogo: {
    timeCasaId: string
    timeVisitanteId: string
    placarCasa: number | null
    placarVisitante: number | null
  },
): { resultado: 'V' | 'D' | null; emCasa: boolean | null; adversarioId: string | null } {
  const { emCasa, adversarioId } = mandoDoJogador(timeDoJogador, jogo)

  if (emCasa === null || jogo.placarCasa === null || jogo.placarVisitante === null) {
    return { resultado: null, emCasa, adversarioId }
  }

  const meus = emCasa ? jogo.placarCasa : jogo.placarVisitante
  const deles = emCasa ? jogo.placarVisitante : jogo.placarCasa
  return { resultado: meus > deles ? 'V' : 'D', emCasa, adversarioId }
}

/** A sigla do adversário, ou null quando não há mando. */
function siglaDoAdversario(
  adversarioId: string | null,
  timePorId: Map<string, { sigla: string }>,
): string | null {
  return adversarioId === null ? null : (timePorId.get(adversarioId)?.sigla ?? null)
}

/**
 * A nota da partida a partir de uma linha de box score.
 *
 * Uma função só para o histórico e para a média recente: se cada um montasse
 * a chamada, a nota da tabela e a nota do cabeçalho poderiam divergir — duas
 * respostas para "quanto ele foi bem naquele jogo".
 */
function notaDoBox(box: typeof estatisticasJogo.$inferSelect): number | null {
  return notaDaPartida({
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
  })
}

/**
 * Quantas partidas a tabela jogo a jogo carrega por padrão.
 *
 * Exportado porque a TELA precisa dizer o recorte quando ele acontece, e o
 * mesmo número escrito à mão em dois arquivos diverge no dia em que um dos
 * dois muda — a mesma razão de `LIMITE_DE_APITOS_DO_JOGADOR`.
 */
export const LIMITE_DE_PARTIDAS_DO_HISTORICO = 25

export async function telaDoJogador(
  db: Db,
  jogadorId: string,
  opcoes: { temporada: string; limiteHistorico?: number },
): Promise<TelaJogador | null> {
  const [jogador] = await db.select().from(jogadores).where(eq(jogadores.id, jogadorId)).limit(1)
  if (!jogador) return null

  const limite = opcoes.limiteHistorico ?? LIMITE_DE_PARTIDAS_DO_HISTORICO

  const [lidas, listaTimes, medias] = await Promise.all([
    db
      .select({ box: estatisticasJogo, jogo: jogos })
      .from(estatisticasJogo)
      .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
      .where(eq(estatisticasJogo.jogadorId, jogadorId))
      .orderBy(desc(jogos.dataHoraUtc))
      // UMA A MAIS que o limite: é assim que a tela sabe que cortou, o mesmo
      // truque do histórico de apitos. Sem isso a seção continuava rotulada
      // "temporada 2025-26" por cima de um recorte das últimas 25 partidas.
      .limit(limite + 1),
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
  const historicoCortado = lidas.length > limite
  const linhasBox = lidas.slice(0, limite)

  const historico: LinhaHistorico[] = linhasBox.map(({ box, jogo }) => {
    const { resultado, emCasa, adversarioId } = resultadoDoJogo(jogador.timeId, jogo)
    return {
      nota: notaDoBox(box),
      jogoId: jogo.id,
      data: jogo.dataHoraUtc,
      adversarioSigla: siglaDoAdversario(adversarioId, timePorId),
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
  // A contagem da TEMPORADA, quando ela existe. Sem ela o número é o da janela
  // carregada — e a tela precisa saber disso para não nomear a temporada.
  const jogosDaTemporada = media?.jogos ?? null
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
  const notas = historico
    .map((l) => l.nota)
    .filter((n): n is number => n !== null)
    .slice(0, 5)
  const notaMediaRecente =
    notas.length === 0
      ? null
      : Math.round((notas.reduce((a, v) => a + v, 0) / notas.length) * 10) / 10

  const timeNaListaDoCj = await timeNaListaDoCjDe(db, jogadorId, timePorId)

  return {
    notaMediaRecente,
    timeNaListaDoCj,
    historicoCortado,
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
    jogosDisputados: jogosDaTemporada ?? n,
    jogosDisputadosDoRecorte: jogosDaTemporada === null && historicoCortado,
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
): Promise<{ id: string; sigla: string; nome: string; nivel: NivelDoJogador } | null> {
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return null
  const [vinculo] = await db
    .select({ timeId: niveis.timeId, nivel: niveis.nivel })
    .from(niveis)
    .where(
      and(
        eq(niveis.niveisVersaoId, versao.id),
        eq(niveis.jogadorId, jogadorId),
        eq(niveis.atributo, 'PONTOS'),
      ),
    )
    .limit(1)
  const time = vinculo ? timePorId.get(vinculo.timeId) : undefined
  return time && vinculo
    ? { id: time.id, sigla: time.sigla, nome: time.nome, nivel: vinculo.nivel }
    : null
}

/**
 * Os apitos da ESTRATÉGIA sobre este jogador, conferidos — a nossa versão da
 * aba "Games" com rating (identidade 04). Vive na aba de estatísticas com o
 * rótulo "apitos da estratégia": é o mecanismo de confiança verificável do
 * Sofascore aplicado ao CJ, e o dono do produto disse sim (Q17).
 *
 * Um registro por (jogo, atributo); a conferência é pela linha MAIS BAIXA,
 * como em `conferirRodadas`. Mando e adversário saem de `mandoDoJogador` — a
 * MESMA fonte da tabela jogo a jogo, que é o time REAL do provedor. Quem
 * apitou foi a estratégia, mas contra quem ele jogou é fato da partida, e as
 * duas seções vivem na mesma tela: lendo fontes diferentes, a mesma partida
 * saía "vs SAS" no apito e "@ MIA" três linhas abaixo.
 */
export async function apitosDoJogador(
  db: Db,
  jogadorId: string,
  limite: number,
): Promise<ApitoDoJogador[]> {
  const linhas = await db
    .select({
      data: jogos.dataHoraUtc,
      jogoId: apitos.jogoId,
      atributo: apitos.atributo,
      linha: apitos.linha,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
      status: jogos.status,
      minutos: estatisticasJogo.minutos,
      pontos: estatisticasJogo.pontos,
      rebotes: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
    })
    .from(apitos)
    .innerJoin(jogos, eq(apitos.jogoId, jogos.id))
    .leftJoin(
      estatisticasJogo,
      and(
        eq(estatisticasJogo.jogoId, apitos.jogoId),
        eq(estatisticasJogo.jogadorId, apitos.jogadorId),
      ),
    )
    .where(and(eq(apitos.estrategia, 'LISTA_SECRETA'), eq(apitos.jogadorId, jogadorId)))
    .orderBy(desc(jogos.dataHoraUtc), asc(apitos.atributo), asc(apitos.linha))

  if (linhas.length === 0) return []

  const listaTimes = await db
    .select({ id: times.id, sigla: times.sigla, nome: times.nome })
    .from(times)
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const [jogador] = await db
    .select({ timeId: jogadores.timeId })
    .from(jogadores)
    .where(eq(jogadores.id, jogadorId))
    .limit(1)
  const meuTime = jogador?.timeId ?? null

  const porCard = new Map<string, ApitoDoJogador>()
  for (const l of linhas) {
    if (l.linha === null) continue
    const chave = `${l.jogoId}|${l.atributo}`
    const { emCasa, adversarioId } = mandoDoJogador(meuTime, l)
    // TRÊS estados, nunca dois. "Não jogou" é a LINHA DO RESERVA QUE NÃO
    // ENTROU (0 min, 0 pts) — o provedor manda essa linha também, e a
    // sincronização insere toda linha recebida. AUSÊNCIA de linha é outra
    // coisa: é dado que ainda não chegou, e chamar isso de DNP é inferir
    // veredito de ausência de dado — o jogo acabou às 23h, o job de box score
    // ainda não rodou, e o perfil dizia que o jogador não entrou em quadra.
    const temBox = l.pontos !== null
    const encerrado = l.status === 'ENCERRADO'
    // UMA regra, na ordem em que a linha fala: produção na linha prova que ele
    // entrou; minuto em quadra também; minuto ZERO é o DNP; e minuto que não
    // chegou, sobre uma linha sem nada, não sustenta veredito nenhum. É a mesma
    // leitura que `conferirRodadas` faz do outro lado do app (a tela de
    // Resultados decide pelo VALOR DO ATRIBUTO, sem olhar minuto) — e as duas
    // falam da mesma (jogo, jogador, atributo).
    const minutos = numero(l.minutos)
    const produziu = (l.pontos ?? 0) > 0 || (l.rebotes ?? 0) > 0 || (l.assistencias ?? 0) > 0
    const estado: EstadoDoApito =
      !encerrado || !temBox
        ? 'AGUARDANDO_OFICIAL'
        : produziu || (minutos !== null && minutos > 0)
          ? 'CONFERIDO'
          : minutos === 0
            ? 'NAO_JOGOU'
            : 'AGUARDANDO_OFICIAL'
    const fez =
      estado !== 'CONFERIDO'
        ? null
        : l.atributo === 'PONTOS'
          ? l.pontos
          : l.atributo === 'REBOTES'
            ? l.rebotes
            : l.assistencias
    const atual = porCard.get(chave)
    if (!atual) {
      porCard.set(chave, {
        estado,
        data: l.data,
        jogoId: l.jogoId,
        adversarioSigla: siglaDoAdversario(adversarioId, timePorId),
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
    .where(and(eq(estatisticasQuarto.jogoId, jogo.id), eq(estatisticasQuarto.jogadorId, jogadorId)))

  // O jogo foi escolhido PELO time do jogador, logo o mando é sempre conhecido
  // aqui; ainda assim é a mesma função das outras duas seções.
  const { adversarioId } = mandoDoJogador(timeDoJogador, jogo)

  // Sem linha de quarto ainda, o mais recente que existe é a própria partida.
  const atualizadoEm = quartos.reduce(
    (maior, q) => (q.atualizadoEm > maior ? q.atualizadoEm : maior),
    jogo.atualizadoEm,
  )

  return {
    jogoId: jogo.id,
    atualizadoEm,
    adversarioSigla: siglaDoAdversario(adversarioId, timePorId) ?? '—',
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
export async function nomesDeJogadores(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const linhas = await db.select().from(jogadores).where(inArray(jogadores.id, ids))
  return new Map(linhas.map((j) => [j.id, j.nomeCompleto] as const))
}
