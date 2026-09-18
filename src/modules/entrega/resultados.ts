import { identidadesDeApresentacao } from '../dominio/identidade-apresentacao'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { temporadaDe, type ConfigTemporada } from '../dominio/temporada'

import {
  apitos,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  greens,
  jogadores,
  jogos,
  niveis,
  niveisVersao,
  times,
} from '../dominio/db/schema'
import { somarDias } from '../dominio/rodada'
import { colunasDeParticipacao, entrouEmQuadra, entrouEmQuadraSql } from '../dominio/participacao'
import type { Db } from '../dominio/db/tipos'
import { maisAntiga, type Atualizacao } from './estatisticas/atualizacao'
import type { StatusJogo } from './lista-por-jogo'
import type { Atributo, Nivel } from '../motor/tipos'

/**
 * CONFERÊNCIA DE RODADAS — o que aconteceu com o que a lista sinalizou.
 *
 * Leitura pura de banco: compara a linha do apito com o que o jogador de fato
 * fez. Nada aqui decide estratégia, e por isso não é motor — é aritmética
 * sobre dois números que já estavam gravados.
 *
 * "Bateu" significa `valor >= linha`, a mesma semântica de over que
 * `marcosAtingidos` já usa para os marcos de green do documento
 * ("notificar comemorando 25, 30, 35 pontos" — comemora quem ALCANÇA).
 * Se o CJ responder o G5 dizendo que a linha exibida é de under, esta
 * comparação inverte, e é o único lugar que muda.
 */

export type LinhaConferida = {
  linha: number
  confianca: number | null
  /** null quando o jogador não entrou em quadra. */
  bateu: boolean | null
}

export type JogadorConferido = {
  chave: string
  jogoId: string
  jogadorId: string
  nome: string
  /**
   * O time do apitado na LISTA DO CJ — id e sigla, nunca `jogadores.time_id`.
   *
   * É a estratégia que apitou, e ela enxerga o elenco PROJETADO (Giannis no
   * Miami). O id vai junto porque é por ele que a tela descobre o mando: com
   * elenco projetado a sigla do provedor não casa com nenhum lado do jogo, o
   * confronto some do card e o mando inverte. Mesma regra de
   * `apitosDoJogador` (estatisticas/jogador.ts).
   */
  timeId: string | null
  timeSigla: string
  fotoUrl: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: number
  /** Apito turbo — o critério de desempate do apito da noite (spec §4.4). */
  turbo: boolean
  /** Ordenadas da mais baixa para a mais alta — a ordem da tela. */
  linhas: LinhaConferida[]
  /**
   * A linha que ESTE card confere: a mais baixa que a lista ofereceu. É a
   * mesma que `bateuLinhaMaisBaixa` usa e que o SQL de `taxaDaTemporada`
   * agrega. Quem exibe não recalcula: se o CJ trocar a regra, muda aqui.
   */
  linhaConferida: number | null
  /** null = DNP. */
  valor: number | null
  /** A linha mais alta que ele superou. null quando não superou nenhuma. */
  maiorLinhaBatida: number | null
  /**
   * O que o jogador FEZ — é `valor`, com o nome que o card conferido escreve
   * ("fez 27 ✓"). null = não jogou (identidade 04).
   */
  fez: number | null
  /**
   * A conferência do CARD: bateu a linha MAIS BAIXA que a lista ofereceu (a
   * que as barrinhas já leem). null quando não jogou — DNP é neutro, nem ✓
   * nem ✗. Decisão do brainstorm de 07/09 (Q17).
   */
  bateuLinhaMaisBaixa: boolean | null
}

export type DiaConferido = {
  dataReferencia: string
  jogadores: JogadorConferido[]
  /** Jogadores que superaram ao menos a linha mais baixa que a lista ofereceu. */
  acertos: number
  /** Jogadores que entraram em quadra — DNP não é acerto nem erro. */
  conferidos: number
}

/**
 * O time de cada apitado segundo a LISTA DO CJ (versão ativa de `niveis`).
 *
 * O vínculo jogador↔time é o mesmo em todos os atributos — o CJ classificou
 * PONTOS, e o elenco é dele —, então uma linha qualquer da versão ativa
 * responde. Sem versão ativa ou sem vínculo o mapa não responde e o card
 * escreve "—": é o que a Lista Secreta já faz, e melhor do que a sigla do
 * provedor passando por curadoria.
 */
async function vinculosDaListaDoCj(db: Db, idsJogador: string[]): Promise<Map<string, string>> {
  if (idsJogador.length === 0) return new Map()
  const [versao] = await db
    .select({ id: niveisVersao.id })
    .from(niveisVersao)
    .where(eq(niveisVersao.ativa, true))
    .limit(1)
  if (!versao) return new Map()
  const vinculos = await db
    .select({ jogadorId: niveis.jogadorId, atributo: niveis.atributo, timeId: niveis.timeId })
    .from(niveis)
    .where(and(eq(niveis.niveisVersaoId, versao.id), inArray(niveis.jogadorId, idsJogador)))
  return new Map(vinculos.map((v) => [`${v.jogadorId}|${v.atributo}`, v.timeId] as const))
}

/** As linhas de um `db.execute`, seja qual for a forma que o driver devolve. */
function linhasDe(resultado: unknown): Record<string, unknown>[] {
  return Array.isArray(resultado)
    ? (resultado as Record<string, unknown>[])
    : ((resultado as { rows?: Record<string, unknown>[] }).rows ?? [])
}

function valorDoAtributo(
  linha: { pontos: number; rebotes: number | null; assistencias: number | null },
  atributo: Atributo,
): number | null {
  switch (atributo) {
    case 'PONTOS':
      return linha.pontos
    case 'REBOTES':
      return linha.rebotes
    case 'ASSISTENCIAS':
      return linha.assistencias
  }
}

/**
 * Confere as rodadas encerradas, da mais recente para a mais antiga.
 *
 * O agrupamento é por JOGADOR, não por linha, porque é assim que a aposta
 * acontece: a lista oferece três linhas do mesmo jogador e o usuário escolhe
 * uma. Contar cada linha como um palpite independente afundaria a taxa de
 * acerto sem descrever nada — quem pega a linha de 20 e vê 23 pontos acertou,
 * mesmo que as linhas de 25 e 30 do mesmo card não tenham caído.
 *
 * `ate` é EXCLUSIVO: a rodada de hoje ainda está acontecendo, e conferir um
 * jogo em andamento mostraria "não bateu" para quem ainda nem entrou em quadra.
 */
export async function conferirRodadas(db: Db, ate: string, dias: number): Promise<DiaConferido[]> {
  // Aritmética de RÓTULO de calendário, não de instante: `somarDias` anda no
  // string YYYY-MM-DD e por isso não escorrega em borda de fuso.
  const deRef = somarDias(ate, -dias)
  const ateRef = somarDias(ate, -1)

  const linhas = await db
    .select({
      dataReferencia: jogos.dataReferencia,
      jogoId: apitos.jogoId,
      jogadorId: apitos.jogadorId,
      nome: jogadores.nomeCompleto,
      fotoUrl: jogadores.fotoUrl,
      atributo: apitos.atributo,
      nivelJogador: apitos.nivelJogador,
      nivelApito: apitos.nivelApito,
      turbo: apitos.turbo,
      linha: apitos.linha,
      confianca: apitos.confianca,
    })
    .from(apitos)
    .innerJoin(jogos, eq(apitos.jogoId, jogos.id))
    .innerJoin(jogadores, eq(apitos.jogadorId, jogadores.id))
    .where(
      and(
        eq(apitos.estrategia, 'LISTA_SECRETA'),
        gte(jogos.dataReferencia, deRef),
        lte(jogos.dataReferencia, ateRef),
      ),
    )
    .orderBy(desc(jogos.dataReferencia), asc(jogadores.nomeCompleto), asc(apitos.linha))

  if (linhas.length === 0) return []

  // O TIME É O DA LISTA DO CJ (regra do projeto; a única exceção é a aba de
  // estatísticas). Ler `jogadores.time_id` aqui faria o card de um elenco
  // projetado mostrar a sigla que a Lista Secreta não mostra e, pior, não
  // casar com nenhum lado do jogo — o confronto sumiria do apoio.
  const identidades = await identidadesDeApresentacao(db, [
    ...new Set(linhas.map((l) => l.jogadorId)),
  ])
  const idsJogo = [...new Set(linhas.map((l) => l.jogoId))]
  const timeDoCj = await vinculosDaListaDoCj(db, [...new Set(linhas.map((l) => l.jogadorId))])
  const listaTimes = await db.select({ id: times.id, sigla: times.sigla }).from(times)
  const siglaPorTime = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  const observados = await db
    .select({
      jogoId: estatisticasJogo.jogoId,
      jogadorId: estatisticasJogo.jogadorId,
      ...colunasDeParticipacao,
    })
    .from(estatisticasJogo)
    .where(inArray(estatisticasJogo.jogoId, idsJogo))

  // DNP é neutro (§4.4, §5.1). Minutos positivos OU produção provam que o
  // jogador entrou; uma linha inteira zerada não recebe um erro de aposta.
  const porJogoJogador = new Map(
    observados.filter(entrouEmQuadra).map((o) => [`${o.jogoId}|${o.jogadorId}`, o] as const),
  )

  // (dia, jogador, atributo) é o card; as linhas se acumulam dentro dele.
  const porDia = new Map<string, Map<string, JogadorConferido>>()

  for (const l of linhas) {
    if (l.linha === null) continue

    const doDia = porDia.get(l.dataReferencia) ?? new Map<string, JogadorConferido>()
    const chave = `${l.jogoId}|${l.jogadorId}|${l.atributo}`

    const observado = porJogoJogador.get(`${l.jogoId}|${l.jogadorId}`)
    const valor = observado ? valorDoAtributo(observado, l.atributo) : null
    const bateu = valor === null ? null : valor >= l.linha

    const timeId = timeDoCj.get(`${l.jogadorId}|${l.atributo}`) ?? null
    const timeSigla = timeId === null ? '—' : (siglaPorTime.get(timeId) ?? '—')
    const atual =
      doDia.get(chave) ??
      ({
        chave,
        jogoId: l.jogoId,
        jogadorId: l.jogadorId,
        nome: identidades.get(l.jogadorId)?.nome ?? l.nome,
        timeId,
        timeSigla,
        fotoUrl: l.fotoUrl,
        atributo: l.atributo,
        nivelJogador: l.nivelJogador,
        nivelApito: l.nivelApito,
        turbo: l.turbo,
        linhas: [],
        linhaConferida: null,
        valor,
        maiorLinhaBatida: null,
        fez: valor,
        // preenchido depois de conhecer todas as linhas do card
        bateuLinhaMaisBaixa: null,
      } satisfies JogadorConferido)

    atual.linhas.push({
      linha: l.linha,
      confianca: l.confianca === null ? null : Number(l.confianca),
      bateu,
    })
    if (bateu === true && (atual.maiorLinhaBatida === null || l.linha > atual.maiorLinhaBatida)) {
      atual.maiorLinhaBatida = l.linha
    }

    doDia.set(chave, atual)
    porDia.set(l.dataReferencia, doDia)
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dataReferencia, doDia]) => {
      const lista = [...doDia.values()].map((j) => {
        const linhas = [...j.linhas].sort((a, b) => a.linha - b.linha)
        const maisBaixa = linhas[0]?.linha
        return {
          ...j,
          linhas,
          linhaConferida: maisBaixa ?? null,
          bateuLinhaMaisBaixa:
            j.valor === null || maisBaixa === undefined ? null : j.valor >= maisBaixa,
        }
      })
      return {
        dataReferencia,
        jogadores: lista,
        acertos: lista.filter((j) => j.maiorLinhaBatida !== null).length,
        conferidos: lista.filter((j) => j.valor !== null).length,
      }
    })
}

// ===========================================================================
// RECAP DA NOITE e TAXA DA TEMPORADA — identidade 04
// ===========================================================================

export type JogoEncerradoResumo = {
  jogoId: string
  /**
   * Os times do jogo por ID, não só por sigla: é por eles que a tela descobre
   * o mando do apitado, comparando com `JogadorConferido.timeId` (o vínculo do
   * CJ). Comparar siglas quebrava no elenco projetado.
   */
  casaId: string
  visitanteId: string
  casaSigla: string
  visitanteSigla: string
  /**
   * O ponto da noite em que o JOGO está, lido da própria linha de `jogos`.
   *
   * Vai junto porque a tela não tem como deduzi-lo: casar o recap (que filtra
   * por `data_referencia`, a data americana do provedor) com uma leitura que
   * recorta por horário local deixa de fora o jogo tardio da costa oeste — e
   * assumir ENCERRADO para o que faltou faz um jogo AGENDADO nascer com "FT ·
   * aguardando dado oficial" na tela.
   */
  status: StatusJogo
  quartoAtual: number | null
  dataHoraUtc: Date
  placarCasa: number | null
  placarVisitante: number | null
  /** Pontos por quarto (Q1..Q4) de cada lado; vazio quando o box do time não existe. */
  quartosCasa: number[]
  quartosVisitante: number[]
  /**
   * O box score OFICIAL do jogo chegou — de QUALQUER jogador, não só dos
   * apitados. Um jogo em que todos os apitados foram desfalque tem box e
   * fecha o ciclo em DNP; olhar só os apitados o deixaria "aguardando dado
   * oficial" para sempre (§5.1).
   */
  temBoxOficial: boolean
  /**
   * Quando ESTE jogo foi visto pela última vez. Por jogo, nunca da rodada: o
   * jogo que espera o box não pode herdar o carimbo de outro que acabou de ser
   * atualizado — "um número velho apresentado como atual é pior do que número
   * nenhum" (estatisticas/atualizacao.ts) vale também ao contrário.
   */
  atualizadoEm: Date
}

export type RecapDaNoite = {
  dataReferencia: string
  /**
   * Apitos PUBLICADOS na rodada — um por card em tela. É o número que a tela
   * escreve sob "APITOS" (§4.4: "N apitos · N bateram · taxa").
   *
   * Existe porque `conferidos` não descreve a tela: numa rodada em curso ele é
   * 0 embaixo de dezenas de cards, e numa noite com desfalque ele fica abaixo
   * da contagem visível. Quando os dois diferem, a tela escreve a base da
   * taxa ao lado dela ("22 de 27").
   */
  publicados: number
  /** Com veredito: jogo ENCERRADO e jogador em quadra — o denominador da taxa. DNP fica fora. */
  conferidos: number
  /** Jogadores que bateram ao menos a linha mais baixa. */
  bateram: number
  /** bateram / conferidos; null sem apito conferido. NUNCA "probabilidade" nem "acerto do apito". */
  taxa: number | null
  /**
   * O turbo que bateu, ou quem mais passou da linha mais baixa (§4.4). Vem
   * mesmo com a noite em curso — é a tela que decide não o destacar antes do
   * fim, porque um superlativo da noite só existe quando a noite acabou.
   */
  apitoDaNoite: JogadorConferido | null
  /**
   * A noite TERMINOU: todo jogo com apito está ENCERRADO. Enquanto for false a
   * tela não escreve taxa nem apito da noite — escreve os publicados e
   * "aguardando o fim da noite" (§5.1, nunca inferir de parcial). É por jogo
   * com apito, não pela rodada inteira: o jogo sem apito não tem card.
   */
  noiteEncerrada: boolean
  porJogo: { jogo: JogoEncerradoResumo; cards: JogadorConferido[] }[]
  /** O carimbo mais ANTIGO entre os jogos DESTA rodada; o de cada jogo vai no próprio jogo. */
  atualizacao: Atualizacao
}

/**
 * A noite como unidade: o mesmo `conferirRodadas` agrupado por jogo, com o
 * placar por quarto no cabeçalho e o apito da noite em destaque. Leitura
 * derivada — nenhum número novo nasce aqui além de somas.
 *
 * Os TRÊS NÚMEROS da noite contam só jogo ENCERRADO — a mesma guarda que o SQL
 * de `taxaDaTemporada` já tinha. O box de `estatisticas_jogo` do jogo em
 * andamento é o PARCIAL do 1º quarto, e somá-lo publicaria uma taxa da noite
 * calculada sobre dois ou três jogadores em quadra, colada à taxa da temporada
 * que só conta encerrado (§5.1, "nunca inferir de parcial"). Os cards seguem
 * todos em `porJogo`: quem exibe usa o estado do ciclo para saber o que dizer
 * de cada um.
 */
export async function recapDaNoite(db: Db, dataReferencia: string): Promise<RecapDaNoite> {
  const [dia] = await conferirRodadas(db, somarDias(dataReferencia, 1), 1)
  const cards = dia?.jogadores ?? []
  const vazio: RecapDaNoite = {
    dataReferencia,
    publicados: 0,
    conferidos: 0,
    bateram: 0,
    taxa: null,
    apitoDaNoite: null,
    noiteEncerrada: false,
    porJogo: [],
    atualizacao: maisAntiga([]),
  }
  if (cards.length === 0) return vazio

  const idsJogo = [...new Set(cards.map((c) => c.jogoId))]
  const [partidas, listaTimes, boxes, comBox] = await Promise.all([
    // A ORDEM DAS SEÇÕES É A DO CALENDÁRIO. Sem `orderBy`, a ordem é a que o
    // Postgres devolver, e ela muda quando qualquer linha de `jogos` é
    // atualizada — placar e quarto mudam a noite inteira. O id desempata dois
    // jogos no mesmo horário, que é comum numa rodada da NBA.
    db
      .select()
      .from(jogos)
      .where(inArray(jogos.id, idsJogo))
      .orderBy(asc(jogos.dataHoraUtc), asc(jogos.id)),
    db.select({ id: times.id, sigla: times.sigla }).from(times),
    db.select().from(estatisticasTimeJogo).where(inArray(estatisticasTimeJogo.jogoId, idsJogo)),
    db
      .selectDistinct({ jogoId: estatisticasJogo.jogoId })
      .from(estatisticasJogo)
      .where(inArray(estatisticasJogo.jogoId, idsJogo)),
  ])
  const siglaPorId = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  const jogosComBox = new Set(comBox.map((b) => b.jogoId))
  const quartos = (jogoId: string, timeId: string): number[] => {
    const b = boxes.find((x) => x.jogoId === jogoId && x.timeId === timeId)
    return b ? [b.pontosQ1, b.pontosQ2, b.pontosQ3, b.pontosQ4] : []
  }

  const porJogo = partidas
    .map((j) => ({
      jogo: {
        jogoId: j.id,
        casaId: j.timeCasaId,
        visitanteId: j.timeVisitanteId,
        casaSigla: siglaPorId.get(j.timeCasaId) ?? '—',
        visitanteSigla: siglaPorId.get(j.timeVisitanteId) ?? '—',
        status: j.status,
        quartoAtual: j.quartoAtual,
        dataHoraUtc: j.dataHoraUtc,
        placarCasa: j.placarCasa,
        placarVisitante: j.placarVisitante,
        quartosCasa: quartos(j.id, j.timeCasaId),
        quartosVisitante: quartos(j.id, j.timeVisitanteId),
        temBoxOficial: jogosComBox.has(j.id),
        atualizadoEm: j.atualizadoEm,
      },
      cards: cards.filter((c) => c.jogoId === j.id),
    }))
    .filter((g) => g.cards.length > 0)

  return {
    dataReferencia,
    ...resumoDosCards(porJogo),
    porJogo,
    // Os jogos DESTA rodada, não os da janela local do dia: a rodada tardia
    // cai fora daquela janela e o carimbo degradava para 31/12/1969. E o
    // carimbo da TELA é o do dado mais ANTIGO que ela mostra (doutrina de
    // `estatisticas/atualizacao.ts`); o de cada jogo vai no próprio jogo.
    atualizacao: maisAntiga(
      partidas.map((j) => ({ em: j.atualizadoEm, fonte: 'jogos da rodada' })),
    ),
  }
}

export type FiltrosResultados = {
  atributo?: Atributo
  timeId?: string
  estrategia?: 'LISTA_SECRETA' | 'FIRE_LIVE'
}

export function filtrosResultadosDaUrl(
  params: Record<string, string | string[] | undefined>,
): FiltrosResultados {
  return {
    ...(params.estrategia === 'LISTA_SECRETA' || params.estrategia === 'FIRE_LIVE'
      ? { estrategia: params.estrategia }
      : {}),
    ...(params.atributo === 'PONTOS' ||
    params.atributo === 'REBOTES' ||
    params.atributo === 'ASSISTENCIAS'
      ? { atributo: params.atributo }
      : {}),
    ...(typeof params.time === 'string' && z.uuid().safeParse(params.time).success
      ? { timeId: params.time }
      : {}),
  }
}

export function rotaResultados(data: string, filtros: FiltrosResultados = {}): string {
  const params = new URLSearchParams()
  if (filtros.estrategia) params.set('estrategia', filtros.estrategia)
  if (filtros.atributo) params.set('atributo', filtros.atributo)
  if (filtros.timeId) params.set('time', filtros.timeId)
  return `/resultados/${encodeURIComponent(data)}${params.size ? `?${params}` : ''}`
}

function resumoDosCards(porJogo: RecapDaNoite['porJogo']) {
  const cards = porJogo.flatMap((g) => g.cards)
  const conferiveis = porJogo.filter((g) => g.jogo.status === 'ENCERRADO').flatMap((g) => g.cards)
  const conferidos = conferiveis.filter((c) => c.fez !== null).length
  const bateram = conferiveis.filter((c) => c.bateuLinhaMaisBaixa === true).length
  const folga = (c: JogadorConferido) => (c.fez ?? 0) - (c.linhaConferida ?? 0)
  const apitoDaNoite =
    conferiveis
      .filter((c) => c.bateuLinhaMaisBaixa === true)
      .sort(
        (a, b) =>
          Number(b.turbo) - Number(a.turbo) ||
          folga(b) - folga(a) ||
          b.nivelApito - a.nivelApito ||
          a.nome.localeCompare(b.nome),
      )[0] ?? null
  return {
    publicados: cards.length,
    conferidos,
    bateram,
    taxa: conferidos === 0 ? null : bateram / conferidos,
    apitoDaNoite,
    noiteEncerrada: porJogo.length > 0 && porJogo.every((g) => g.jogo.status === 'ENCERRADO'),
  }
}

/** Filtra a conferência existente sem transformar cada linha em outro card. */
export function filtrarRecapDaNoite(recap: RecapDaNoite, filtros: FiltrosResultados): RecapDaNoite {
  const porJogo = recap.porJogo
    .map((g) => ({
      ...g,
      cards: g.cards.filter(
        (c) =>
          (!filtros.atributo || c.atributo === filtros.atributo) &&
          (!filtros.timeId || c.timeId === filtros.timeId),
      ),
    }))
    .filter((g) => g.cards.length > 0)
  return { ...recap, ...resumoDosCards(porJogo), porJogo }
}

export type ResultadoFireLive = {
  id: string
  jogadorId: string
  jogoId: string
  nome: string
  fotoUrl: string | null
  timeId: string | null
  timeSigla: string
  atributo: Atributo
  alvo: number | null
  valor: number | null
  bateu: boolean | null
  estado: 'CONFERIDO' | 'DNP' | 'PENDENTE'
}

/** Alvo gravado do 1Q contra o split oficial do 1Q; nunca usa o box inteiro. */
export async function conferirFireLive(
  db: Db,
  dataReferencia: string,
): Promise<ResultadoFireLive[]> {
  const linhas = await db
    .select({
      apito: apitos,
      nome: jogadores.nomeCompleto,
      fotoUrl: jogadores.fotoUrl,
      jogo: jogos,
      quarto: estatisticasQuarto,
      box: estatisticasJogo,
    })
    .from(apitos)
    .innerJoin(jogadores, eq(jogadores.id, apitos.jogadorId))
    .innerJoin(jogos, eq(jogos.id, apitos.jogoId))
    .leftJoin(
      estatisticasQuarto,
      and(
        eq(estatisticasQuarto.jogoId, apitos.jogoId),
        eq(estatisticasQuarto.jogadorId, apitos.jogadorId),
        eq(estatisticasQuarto.quarto, 1),
      ),
    )
    .leftJoin(
      estatisticasJogo,
      and(
        eq(estatisticasJogo.jogoId, apitos.jogoId),
        eq(estatisticasJogo.jogadorId, apitos.jogadorId),
      ),
    )
    .where(and(eq(jogos.dataReferencia, dataReferencia), eq(apitos.estrategia, 'FIRE_LIVE')))
    .orderBy(asc(jogos.dataHoraUtc), asc(jogadores.nomeCompleto), asc(apitos.atributo))
  if (linhas.length === 0) return []
  const ids = [...new Set(linhas.map((l) => l.apito.jogadorId))]
  const [identidades, vinculos, listaTimes] = await Promise.all([
    identidadesDeApresentacao(db, ids),
    vinculosDaListaDoCj(db, ids),
    db.select().from(times),
  ])
  const siglas = new Map(listaTimes.map((t) => [t.id, t.sigla]))
  return linhas.map(({ apito, nome, fotoUrl, jogo, quarto, box }) => {
    const encerrado =
      jogo.status === 'ENCERRADO' || (jogo.quartoAtual !== null && jogo.quartoAtual > 1)
    const dnp =
      jogo.status === 'ENCERRADO' &&
      box !== null &&
      box.minutos !== null &&
      Number(box.minutos) === 0 &&
      !entrouEmQuadra({ ...box, rebotes: box.rebotesTotal })
    const temDado =
      quarto !== null &&
      (quarto.minutos !== null ||
        quarto.pontos > 0 ||
        quarto.rebotes > 0 ||
        quarto.assistencias > 0)
    const estado = dnp ? 'DNP' : encerrado && temDado ? 'CONFERIDO' : 'PENDENTE'
    const valor = estado === 'CONFERIDO' && quarto ? valorDoAtributo(quarto, apito.atributo) : null
    const timeId = vinculos.get(`${apito.jogadorId}|${apito.atributo}`) ?? null
    return {
      id: apito.id,
      jogadorId: apito.jogadorId,
      jogoId: jogo.id,
      nome: identidades.get(apito.jogadorId)?.nome ?? nome,
      fotoUrl,
      timeId,
      timeSigla: timeId ? (siglas.get(timeId) ?? '—') : '—',
      atributo: apito.atributo,
      alvo: apito.alvo1q,
      valor,
      bateu: valor === null || apito.alvo1q === null ? null : valor >= apito.alvo1q,
      estado,
    }
  })
}

export type TaxaDaTemporada = { conferidos: number; acertos: number; rodadas: number }

/**
 * A taxa acumulada da janela — UMA consulta agregada, não N dias de
 * `conferirRodadas`. Mesma semântica: o card é (jogo, jogador, atributo), a
 * conferência é pela linha mais baixa, DNP não conta. `ate` é exclusivo.
 *
 * É o número que a tela de Resultados mostra como "temporada · N rodadas".
 * Regra de escrita: ele nunca fica no mesmo elemento que um % de confiança —
 * são coisas diferentes, e a spec da identidade 04 é explícita sobre isso.
 */
/**
 * A JANELA DA TEMPORADA — da abertura até a rodada em tela.
 *
 * O contador não é "os últimos N dias": é a temporada corrente, que começa no
 * mês declarado no ruleset (`temporada.mes_inicio`). Somar dias fixos faria a
 * taxa arrastar jogos da temporada passada em outubro, e é ela que o produto
 * usa como argumento de venda. `taxaDaTemporada` recebe a janela em dias
 * porque a consulta é uma só; a regra de onde ela começa é daqui.
 *
 * Mora na ENTREGA, e não na tela de Resultados, desde a identidade 05: a
 * lateral usa a mesma janela para escrever a taxa da temporada, e duas cópias
 * divergiriam na primeira mudança do calendário.
 */
export function diasDaTemporada(data: string, config: ConfigTemporada): number {
  const meioDia = `${data}T12:00:00.000Z`
  const anoBase = temporadaDe(new Date(meioDia), config).slice(0, 4)
  const abertura = `${anoBase}-${String(config.mesInicio).padStart(2, '0')}-01T12:00:00.000Z`
  const dias = Math.round((Date.parse(meioDia) - Date.parse(abertura)) / 86_400_000)
  // Defesa em profundidade: com o ano preenchido isto não dispara, mas uma
  // abertura ilegível não pode virar NaN dentro de `somarDias`.
  if (!Number.isFinite(dias)) return 1
  // NÃO HÁ ANO 0 no calendário do Postgres: a temporada de 0001-01-01 abriria
  // em 0000-10-01 e a consulta da taxa morreria convertendo o parâmetro
  // (diagnóstico de 13/09). A janela para na primeira data que existe — isto
  // não é limite de calendário da liga, é o alcance do tipo `date`.
  const ateAPrimeiraData =
    Math.round((Date.parse(meioDia) - Date.parse('0001-01-01T12:00:00.000Z')) / 86_400_000) + 1
  return Math.max(1, Math.min(dias + 1, ateAPrimeiraData))
}

export async function taxaDaTemporada(db: Db, ate: string, dias: number): Promise<TaxaDaTemporada> {
  const deRef = somarDias(ate, -dias)
  const ateRef = somarDias(ate, -1)
  const resultado = await db.execute(sql`
    with cards as (
      select j.data_referencia,
             a.jogo_id,
             a.jogador_id,
             a.atributo,
             min(a.linha) as linha_minima,
             -- SÓ JOGO ENCERRADO conta como conferido. O jogo ao vivo tem box
             -- PARCIAL em estatisticas_jogo (o 1º quarto do Fire Live), e
             -- contá-lo daria "não bateu" a quem ainda está em quadra — o teste
             -- da janela exclusiva pegou exatamente isso. E SÓ QUEM ENTROU EM
             -- QUADRA: DNP é neutro (§4.4). Entrou em quadra quem tem minuto
             -- positivo OU produção: a coluna de minutos é nullable, e quem
             -- registrou evento individual jogou. Mesmo predicado do perfil.
             max(case when j.status = 'ENCERRADO'
                       and ${entrouEmQuadraSql('e')} then
                   case a.atributo
                     when 'PONTOS' then e.pontos
                     when 'REBOTES' then e.rebotes_total
                     when 'ASSISTENCIAS' then e.assistencias
                   end
                 end) as valor
        from apitos a
        join jogos j on j.id = a.jogo_id
        left join estatisticas_jogo e on e.jogo_id = a.jogo_id and e.jogador_id = a.jogador_id
       where a.estrategia = 'LISTA_SECRETA'
         and a.linha is not null
         and j.data_referencia >= ${deRef}
         and j.data_referencia <= ${ateRef}
       group by 1, 2, 3, 4
    )
    select count(*) filter (where valor is not null)::int as conferidos,
           count(*) filter (where valor is not null and valor >= linha_minima)::int as acertos,
           -- SÓ RODADA QUE CONFERIU ALGO. A rodada em curso tem apito publicado
           -- e nenhum valor: contá-la fazia a faixa dizer "20 RODADAS" ao lado
           -- dos mesmos "274 de 400" que ontem apareciam sob "19 RODADAS".
           count(distinct data_referencia) filter (where valor is not null)::int as rodadas
      from cards
  `)
  const l = linhasDe(resultado)[0] ?? {}
  return {
    conferidos: Number(l.conferidos ?? 0),
    acertos: Number(l.acertos ?? 0),
    rodadas: Number(l.rodadas ?? 0),
  }
}

/**
 * A ÚLTIMA RODADA COM CONFERÊNCIA até `ate` (inclusive) — a noite que TERMINOU.
 *
 * É para onde `/resultados` sem data leva: o recap da noite (§4.4) é a noite
 * que acabou, não a rodada em curso. Uma rodada conta quando TODO jogo com
 * apito está ENCERRADO e ao menos um apitado tem veredito (box com minutos
 * positivos ou evento estatístico, como na taxa). A rodada de hoje, com
 * jogo AGENDADO ou AO_VIVO, fica de fora mesmo que um jogo já tenha acabado —
 * a seta da tela leva até ela. Sem nada conferido (banco recém-semeado),
 * null: quem chama decide o fallback.
 */
export async function ultimaRodadaConferida(db: Db, ate: string): Promise<string | null> {
  const resultado = await db.execute(sql`
    select j.data_referencia::text as data_referencia
      from apitos a
      join jogos j on j.id = a.jogo_id
      left join estatisticas_jogo e
        on e.jogo_id = a.jogo_id and e.jogador_id = a.jogador_id
       and ${entrouEmQuadraSql('e')}
     where a.estrategia = 'LISTA_SECRETA'
       and a.linha is not null
       and j.data_referencia <= ${ate}
     group by j.data_referencia
    having bool_and(j.status = 'ENCERRADO') and count(e.id) > 0
     order by j.data_referencia desc
     limit 1
  `)
  const valor = linhasDe(resultado)[0]?.data_referencia
  return typeof valor === 'string' ? valor : null
}

export type GreenDoDia = {
  jogadorId: string
  timeId: string | null
  id: string
  nome: string
  atributo: Atributo
  nivelJogador: Nivel
  marco: number
  valor: number
  detectadoEm: Date
}

/** Os greens comemorados pelo Fire Live na data — a outra metade da tela. */
export async function greensDoDia(db: Db, dataReferencia: string): Promise<GreenDoDia[]> {
  const linhas = await db
    .select({
      id: greens.id,
      jogadorId: greens.jogadorId,
      nome: jogadores.nomeCompleto,
      atributo: greens.atributo,
      nivelJogador: greens.nivelJogador,
      marco: greens.marco,
      valor: greens.valor,
      detectadoEm: greens.detectadoEm,
    })
    .from(greens)
    .innerJoin(jogos, eq(greens.jogoId, jogos.id))
    .innerJoin(jogadores, eq(greens.jogadorId, jogadores.id))
    .where(eq(jogos.dataReferencia, dataReferencia))
    .orderBy(desc(greens.marco))

  const ids = [...new Set(linhas.map((l) => l.jogadorId))]
  const [identidades, vinculos] = await Promise.all([
    identidadesDeApresentacao(db, ids),
    vinculosDaListaDoCj(db, ids),
  ])
  return linhas.map((l) => ({
    ...l,
    nome: identidades.get(l.jogadorId)?.nome ?? l.nome,
    timeId: vinculos.get(`${l.jogadorId}|${l.atributo}`) ?? null,
  }))
}
