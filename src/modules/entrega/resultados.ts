import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'

import {
  apitos,
  estatisticasJogo,
  greens,
  jogadores,
  jogos,
  times,
} from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
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
  jogadorId: string
  nome: string
  timeSigla: string
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: number
  /** Ordenadas da mais baixa para a mais alta — a ordem da tela. */
  linhas: LinhaConferida[]
  /** null = DNP. */
  valor: number | null
  /** A linha mais alta que ele superou. null quando não superou nenhuma. */
  maiorLinhaBatida: number | null
}

export type DiaConferido = {
  dataReferencia: string
  jogadores: JogadorConferido[]
  /** Jogadores que superaram ao menos a linha mais baixa que a lista ofereceu. */
  acertos: number
  /** Jogadores que entraram em quadra — DNP não é acerto nem erro. */
  conferidos: number
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
export async function conferirRodadas(
  db: Db,
  ate: string,
  dias: number,
): Promise<DiaConferido[]> {
  const fim = new Date(`${ate}T00:00:00.000Z`)
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60_000)
  const deRef = inicio.toISOString().slice(0, 10)
  const ateRef = new Date(fim.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 10)

  const linhas = await db
    .select({
      dataReferencia: jogos.dataReferencia,
      jogoId: apitos.jogoId,
      jogadorId: apitos.jogadorId,
      nome: jogadores.nomeCompleto,
      timeSigla: times.sigla,
      atributo: apitos.atributo,
      nivelJogador: apitos.nivelJogador,
      nivelApito: apitos.nivelApito,
      linha: apitos.linha,
      confianca: apitos.confianca,
    })
    .from(apitos)
    .innerJoin(jogos, eq(apitos.jogoId, jogos.id))
    .innerJoin(jogadores, eq(apitos.jogadorId, jogadores.id))
    .leftJoin(times, eq(jogadores.timeId, times.id))
    .where(
      and(
        eq(apitos.estrategia, 'LISTA_SECRETA'),
        gte(jogos.dataReferencia, deRef),
        lte(jogos.dataReferencia, ateRef),
      ),
    )
    .orderBy(desc(jogos.dataReferencia), asc(jogadores.nomeCompleto), asc(apitos.linha))

  if (linhas.length === 0) return []

  const idsJogo = [...new Set(linhas.map((l) => l.jogoId))]
  const observados = await db
    .select({
      jogoId: estatisticasJogo.jogoId,
      jogadorId: estatisticasJogo.jogadorId,
      pontos: estatisticasJogo.pontos,
      rebotes: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
    })
    .from(estatisticasJogo)
    .where(inArray(estatisticasJogo.jogoId, idsJogo))

  const porJogoJogador = new Map(observados.map((o) => [`${o.jogoId}|${o.jogadorId}`, o] as const))

  // (dia, jogador, atributo) é o card; as linhas se acumulam dentro dele.
  const porDia = new Map<string, Map<string, JogadorConferido>>()

  for (const l of linhas) {
    if (l.linha === null) continue

    const doDia = porDia.get(l.dataReferencia) ?? new Map<string, JogadorConferido>()
    const chave = `${l.jogoId}|${l.jogadorId}|${l.atributo}`

    const observado = porJogoJogador.get(`${l.jogoId}|${l.jogadorId}`)
    const valor = observado ? valorDoAtributo(observado, l.atributo) : null
    const bateu = valor === null ? null : valor >= l.linha

    const atual =
      doDia.get(chave) ??
      ({
        chave,
        jogadorId: l.jogadorId,
        nome: l.nome,
        timeSigla: l.timeSigla ?? '—',
        atributo: l.atributo,
        nivelJogador: l.nivelJogador,
        nivelApito: l.nivelApito,
        linhas: [],
        valor,
        maiorLinhaBatida: null,
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
      const lista = [...doDia.values()].map((j) => ({
        ...j,
        linhas: [...j.linhas].sort((a, b) => a.linha - b.linha),
      }))
      return {
        dataReferencia,
        jogadores: lista,
        acertos: lista.filter((j) => j.maiorLinhaBatida !== null).length,
        conferidos: lista.filter((j) => j.valor !== null).length,
      }
    })
}

export type GreenDoDia = {
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

  return linhas
}
