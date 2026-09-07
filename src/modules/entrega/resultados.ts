import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import {
  apitos,
  estatisticasJogo,
  estatisticasTimeJogo,
  greens,
  jogadores,
  jogos,
  times,
} from '../dominio/db/schema'
import { somarDias } from '../dominio/rodada'
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
  jogoId: string
  jogadorId: string
  nome: string
  timeSigla: string
  fotoUrl: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: number
  /** Ordenadas da mais baixa para a mais alta — a ordem da tela. */
  linhas: LinhaConferida[]
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
      timeSigla: times.sigla,
      fotoUrl: jogadores.fotoUrl,
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
        jogoId: l.jogoId,
        jogadorId: l.jogadorId,
        nome: l.nome,
        timeSigla: l.timeSigla ?? '—',
        fotoUrl: l.fotoUrl,
        atributo: l.atributo,
        nivelJogador: l.nivelJogador,
        nivelApito: l.nivelApito,
        linhas: [],
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
  casaSigla: string
  visitanteSigla: string
  placarCasa: number | null
  placarVisitante: number | null
  /** Pontos por quarto (Q1..Q4) de cada lado; vazio quando o box do time não existe. */
  quartosCasa: number[]
  quartosVisitante: number[]
}

export type RecapDaNoite = {
  dataReferencia: string
  /** Jogadores que entraram em quadra — o denominador. */
  apitos: number
  /** Jogadores que bateram ao menos a linha mais baixa. */
  bateram: number
  /** bateram / apitos; null sem apito conferido. NUNCA "probabilidade" nem "acerto do apito". */
  taxa: number | null
  /** Entre os que bateram, o que mais passou da linha mais baixa. */
  apitoDaNoite: JogadorConferido | null
  porJogo: { jogo: JogoEncerradoResumo; cards: JogadorConferido[] }[]
}

/**
 * A noite como unidade: o mesmo `conferirRodadas` agrupado por jogo, com o
 * placar por quarto no cabeçalho e o apito da noite em destaque. Leitura
 * derivada — nenhum número novo nasce aqui além de somas.
 */
export async function recapDaNoite(db: Db, dataReferencia: string): Promise<RecapDaNoite> {
  const [dia] = await conferirRodadas(db, somarDias(dataReferencia, 1), 1)
  const cards = dia?.jogadores ?? []
  const vazio: RecapDaNoite = { dataReferencia, apitos: 0, bateram: 0, taxa: null, apitoDaNoite: null, porJogo: [] }
  if (cards.length === 0) return vazio

  const idsJogo = [...new Set(cards.map((c) => c.jogoId))]
  const [partidas, listaTimes, boxes] = await Promise.all([
    db.select().from(jogos).where(inArray(jogos.id, idsJogo)),
    db.select({ id: times.id, sigla: times.sigla }).from(times),
    db.select().from(estatisticasTimeJogo).where(inArray(estatisticasTimeJogo.jogoId, idsJogo)),
  ])
  const siglaPorId = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  const quartos = (jogoId: string, timeId: string): number[] => {
    const b = boxes.find((x) => x.jogoId === jogoId && x.timeId === timeId)
    return b ? [b.pontosQ1, b.pontosQ2, b.pontosQ3, b.pontosQ4] : []
  }

  const porJogo = partidas
    .sort((a, b) => a.dataHoraUtc.getTime() - b.dataHoraUtc.getTime())
    .map((j) => ({
      jogo: {
        jogoId: j.id,
        casaSigla: siglaPorId.get(j.timeCasaId) ?? '—',
        visitanteSigla: siglaPorId.get(j.timeVisitanteId) ?? '—',
        placarCasa: j.placarCasa,
        placarVisitante: j.placarVisitante,
        quartosCasa: quartos(j.id, j.timeCasaId),
        quartosVisitante: quartos(j.id, j.timeVisitanteId),
      },
      cards: cards.filter((c) => c.jogoId === j.id),
    }))
    .filter((g) => g.cards.length > 0)

  const apitos = dia!.conferidos
  const bateram = dia!.acertos
  const folga = (c: JogadorConferido) => (c.fez ?? 0) - Math.min(...c.linhas.map((l) => l.linha))
  const apitoDaNoite =
    cards
      .filter((c) => c.bateuLinhaMaisBaixa === true)
      .sort((a, b) => folga(b) - folga(a) || b.nivelApito - a.nivelApito)[0] ?? null

  return {
    dataReferencia,
    apitos,
    bateram,
    taxa: apitos === 0 ? null : bateram / apitos,
    apitoDaNoite,
    porJogo,
  }
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
             -- da janela exclusiva pegou exatamente isso.
             max(case when j.status = 'ENCERRADO' then
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
           count(distinct data_referencia)::int as rodadas
      from cards
  `)
  const linhas = Array.isArray(resultado)
    ? (resultado as Record<string, unknown>[])
    : ((resultado as { rows?: Record<string, unknown>[] }).rows ?? [])
  const l = linhas[0] ?? {}
  return {
    conferidos: Number(l.conferidos ?? 0),
    acertos: Number(l.acertos ?? 0),
    rodadas: Number(l.rodadas ?? 0),
  }
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
