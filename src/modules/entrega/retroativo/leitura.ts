import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import {
  apitosRetroativos,
  estatisticasJogo,
  estatisticasQuarto,
  feedRetroativo,
  greensRetroativos,
  jogadores,
  jogos,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import {
  boxDeQuemJogou,
  conferirLinhaFireLive,
  conferirLinhas,
  recapDosCards,
  type GreenDoDia,
  type RecapDaNoite,
  type ResultadoFireLive,
} from '../resultados'
import type { ConteudoFeed } from '../tipos-feed'

/**
 * LEITURA DA TEMPORADA ANTERIOR (spec 25/09) — Resultados e Lista Secreta de
 * uma temporada que já acabou, lidos das tabelas retroativas.
 *
 * Mesmas formas do app ao vivo (`RecapDaNoite`, `GreenDoDia`,
 * `ResultadoFireLive`, `ConteudoFeed`) para a tela desenhar sem saber de onde
 * veio, e a mesma conferência (`conferirLinhas`, `conferirLinhaFireLive`):
 * o que muda é a TABELA e o TIME.
 *
 * O TIME é o que o jogador JOGOU naquela temporada (decisão 2): o
 * `estatisticas_jogo.time_id` do último jogo dele até a data — a mesma regra
 * de `montarFatosRetroativos`. A lista do CJ dá o nível, não o time; usá-la
 * aqui poria o Giannis de 2025-26 no Miami.
 *
 * Toda leitura de um dia é pela TEMPORADA e pela data: é o índice
 * `(temporada, data_referencia)` das tabelas, e uma data nunca é lida sob o
 * rótulo de outra temporada.
 *
 * Só leitura: nada daqui grava, e nada daqui é lido pelo Placar público,
 * pelo Ao Vivo ou pelo push. As telas chegam às datas e à Lista pelo cache
 * (`app/_cache/retroativo.ts`).
 */

/** O time de cada jogador no dia: o do último jogo dele até a data, inclusive. */
async function timeDoDia(db: Db, ids: string[], dataReferencia: string): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const linhas = await db
    .selectDistinctOn([estatisticasJogo.jogadorId], {
      jogadorId: estatisticasJogo.jogadorId,
      timeId: estatisticasJogo.timeId,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(jogos.id, estatisticasJogo.jogoId))
    .where(
      and(
        inArray(estatisticasJogo.jogadorId, ids),
        isNotNull(estatisticasJogo.timeId),
        lte(jogos.dataReferencia, dataReferencia),
      ),
    )
    .orderBy(estatisticasJogo.jogadorId, desc(jogos.dataReferencia), desc(jogos.dataHoraUtc))
  return new Map(linhas.flatMap((l) => (l.timeId === null ? [] : [[l.jogadorId, l.timeId] as const])))
}

/** Nome de apresentação, time do dia e sigla — o que todo card escreve. */
async function apresentacaoDoDia(db: Db, ids: string[], dataReferencia: string) {
  const [identidades, time, listaTimes] = await Promise.all([
    identidadesDeApresentacao(db, ids),
    timeDoDia(db, ids, dataReferencia),
    db.select({ id: times.id, sigla: times.sigla }).from(times),
  ])
  const sigla = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  return (jogadorId: string, nomeDoCadastro: string) => {
    const timeId = time.get(jogadorId) ?? null
    return {
      nome: identidades.get(jogadorId)?.nome ?? nomeDoCadastro,
      timeId,
      timeSigla: timeId === null ? '—' : (sigla.get(timeId) ?? '—'),
    }
  }
}

/**
 * A noite da temporada anterior, na forma de `recapDaNoite`: os apitos da
 * Lista Secreta daquele dia conferidos contra o box score, agrupados por jogo.
 * Os jogos já terminaram — a "noite encerrada" sai da mesma regra de sempre
 * (todo jogo com apito ENCERRADO), e não de uma constante.
 */
export async function recapRetroativo(
  db: Db,
  temporada: string,
  dataReferencia: string,
): Promise<RecapDaNoite> {
  const linhas = await db
    .select({
      jogoId: apitosRetroativos.jogoId,
      jogadorId: apitosRetroativos.jogadorId,
      nome: jogadores.nomeCompleto,
      fotoUrl: jogadores.fotoUrl,
      atributo: apitosRetroativos.atributo,
      nivelJogador: apitosRetroativos.nivelJogador,
      nivelApito: apitosRetroativos.nivelApito,
      turbo: apitosRetroativos.turbo,
      linha: apitosRetroativos.linha,
      confianca: apitosRetroativos.confianca,
    })
    .from(apitosRetroativos)
    .innerJoin(jogadores, eq(apitosRetroativos.jogadorId, jogadores.id))
    .where(
      and(
        eq(apitosRetroativos.estrategia, 'LISTA_SECRETA'),
        eq(apitosRetroativos.temporada, temporada),
        eq(apitosRetroativos.dataReferencia, dataReferencia),
      ),
    )
    // A mesma ordem de `conferirRodadas`: nome, depois a linha.
    .orderBy(asc(jogadores.nomeCompleto), asc(apitosRetroativos.linha))
  if (linhas.length === 0) return recapDosCards(db, dataReferencia, [])

  const ids = [...new Set(linhas.map((l) => l.jogadorId))]
  const [apresentar, box] = await Promise.all([
    apresentacaoDoDia(db, ids, dataReferencia),
    boxDeQuemJogou(db, [...new Set(linhas.map((l) => l.jogoId))]),
  ])
  const cards = conferirLinhas(
    linhas.map((l) => ({
      ...l,
      ...apresentar(l.jogadorId, l.nome),
      box: box.get(`${l.jogoId}|${l.jogadorId}`) ?? null,
    })),
  )
  return recapDosCards(db, dataReferencia, cards)
}

/** Os greens do Fire Live da temporada anterior na data, na forma de `greensDoDia`. */
export async function greensRetroativosDoDia(
  db: Db,
  temporada: string,
  dataReferencia: string,
): Promise<GreenDoDia[]> {
  const linhas = await db
    .select({
      id: greensRetroativos.id,
      jogadorId: greensRetroativos.jogadorId,
      nome: jogadores.nomeCompleto,
      atributo: greensRetroativos.atributo,
      nivelJogador: greensRetroativos.nivelJogador,
      marco: greensRetroativos.marco,
      valor: greensRetroativos.valor,
    })
    .from(greensRetroativos)
    .innerJoin(jogadores, eq(greensRetroativos.jogadorId, jogadores.id))
    .where(and(eq(greensRetroativos.temporada, temporada), eq(greensRetroativos.dataReferencia, dataReferencia)))
    .orderBy(desc(greensRetroativos.marco))
  if (linhas.length === 0) return []
  const apresentar = await apresentacaoDoDia(db, [...new Set(linhas.map((l) => l.jogadorId))], dataReferencia)
  return linhas.map((l) => {
    const { nome, timeId } = apresentar(l.jogadorId, l.nome)
    // Sem lance a lance, o minuto do green não existe — null, não um horário inventado.
    return { ...l, nome, timeId, detectadoEm: null }
  })
}

/** Os sinais do Fire Live da temporada anterior, na forma de `conferirFireLive`. */
export async function fireLiveRetroativo(
  db: Db,
  temporada: string,
  dataReferencia: string,
): Promise<ResultadoFireLive[]> {
  const linhas = await db
    .select({
      apito: {
        id: apitosRetroativos.id,
        jogadorId: apitosRetroativos.jogadorId,
        atributo: apitosRetroativos.atributo,
        alvo1q: apitosRetroativos.alvo1q,
      },
      nome: jogadores.nomeCompleto,
      fotoUrl: jogadores.fotoUrl,
      jogo: jogos,
      quarto: estatisticasQuarto,
      box: estatisticasJogo,
    })
    .from(apitosRetroativos)
    .innerJoin(jogadores, eq(jogadores.id, apitosRetroativos.jogadorId))
    .innerJoin(jogos, eq(jogos.id, apitosRetroativos.jogoId))
    .leftJoin(
      estatisticasQuarto,
      and(
        eq(estatisticasQuarto.jogoId, apitosRetroativos.jogoId),
        eq(estatisticasQuarto.jogadorId, apitosRetroativos.jogadorId),
        // O mesmo 1º quarto de `conferirFireLive`: Fire Live é só 1º quarto.
        eq(estatisticasQuarto.quarto, 1),
      ),
    )
    .leftJoin(
      estatisticasJogo,
      and(
        eq(estatisticasJogo.jogoId, apitosRetroativos.jogoId),
        eq(estatisticasJogo.jogadorId, apitosRetroativos.jogadorId),
      ),
    )
    .where(
      and(
        eq(apitosRetroativos.temporada, temporada),
        eq(apitosRetroativos.dataReferencia, dataReferencia),
        eq(apitosRetroativos.estrategia, 'FIRE_LIVE'),
      ),
    )
    .orderBy(asc(jogos.dataHoraUtc), asc(jogadores.nomeCompleto), asc(apitosRetroativos.atributo))
  if (linhas.length === 0) return []
  const apresentar = await apresentacaoDoDia(db, [...new Set(linhas.map((l) => l.apito.jogadorId))], dataReferencia)
  return linhas.map((l) => conferirLinhaFireLive(l, apresentar(l.apito.jogadorId, l.nome)))
}

/** A Lista Secreta daquele dia como teria saído antes dos jogos — sem odd. */
export async function feedRetroativoDoDia(
  db: Db,
  temporada: string,
  dataReferencia: string,
): Promise<ConteudoFeed | null> {
  const [linha] = await db
    .select({ conteudo: feedRetroativo.conteudoJson })
    .from(feedRetroativo)
    .where(and(eq(feedRetroativo.temporada, temporada), eq(feedRetroativo.dataReferencia, dataReferencia)))
    .limit(1)
  return linha ? (linha.conteudo as ConteudoFeed) : null
}

/**
 * As datas da temporada com apito ou com Lista, em ordem — as setas de
 * Resultados e o seletor de data da Lista andam só por elas.
 */
export async function datasRetroativas(db: Db, temporada: string): Promise<string[]> {
  const resultado = await db.execute(sql`
    select data_referencia::text as data
      from ${apitosRetroativos}
     where temporada = ${temporada}
    union
    select data_referencia::text as data
      from ${feedRetroativo}
     where temporada = ${temporada}
     order by 1
  `)
  const linhas = Array.isArray(resultado)
    ? (resultado as { data: string }[])
    : ((resultado as { rows?: { data: string }[] }).rows ?? [])
  return linhas.map((l) => l.data)
}
