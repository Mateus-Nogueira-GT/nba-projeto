import { and, eq, inArray } from 'drizzle-orm'

import { feedSnapshot, jogadores, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { ConteudoFeedFireLive, ItemFireLive } from './feed'

/**
 * A tela vazia é a experiência DOMINANTE do Fire Live — fora da janela dos
 * jogos, é o que o assinante vê. Cada estado explica o próprio motivo; o
 * quarto caso é o único em que "funcionando e vazio" é a resposta certa.
 */
export type EstadoVazio =
  | 'SEM_JOGO_HOJE'
  | 'AGUARDANDO_PRIMEIRO_JOGO'
  | 'NENHUM_EM_1Q'
  | 'SEM_APITO_AINDA'

export type FeedFireLive = {
  itens: ItemFireLive[]
  /** Snapshot mais recente entre os jogos considerados. Null sem snapshot. */
  geradoEm: Date | null
  estadoVazio: EstadoVazio | null
  /** Tipoff do primeiro jogo ainda não começado — para "começa às 21h30". */
  primeiroJogoUtc: Date | null
}

/**
 * Lê os snapshots FIRE_LIVE do dia — um por jogo (spec 05) — e junta.
 *
 * Apito de jogo ENCERRADO sai do feed ao vivo (regra da spec); enquanto o
 * jogo segue, o item fica, marcado como `encerrado` quando o 1Q acabou
 * (G2 — proposta enviada ao CJ).
 */
export type FiltroFireLive = {
  /** Sigla do time — recorte de leitura, direto da query string. */
  time?: string
  /** Id do jogo — é para cá que o toque no push aponta. */
  jogo?: string
}

export async function lerFeedFireLive(
  db: Db,
  dataReferencia: string,
  quartoFireLive: number,
  filtro: FiltroFireLive = {},
): Promise<FeedFireLive> {
  const [partidas, snapshots] = await Promise.all([
    db.select().from(jogos).where(eq(jogos.dataReferencia, dataReferencia)),
    db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dataReferencia), eq(feedSnapshot.estrategia, 'FIRE_LIVE')),
      ),
  ])

  if (partidas.length === 0) {
    return { itens: [], geradoEm: null, estadoVazio: 'SEM_JOGO_HOJE', primeiroJogoUtc: null }
  }

  const statusPorJogo = new Map(partidas.map((p) => [p.id, p.status] as const))
  const vivos = snapshots.filter(
    (s) => s.jogoId !== null && statusPorJogo.get(s.jogoId) !== 'ENCERRADO',
  )

  const todos = vivos.flatMap((s) => (s.conteudoJson as ConteudoFeedFireLive).itens)

  // Recortes de leitura, combináveis. Valor desconhecido recorta para o vazio
  // — nunca erro: o estado de janela abaixo só fala quando NADA foi apitado.
  const recortados = todos
    .filter((i) => (filtro.time === undefined ? true : i.timeSigla === filtro.time))
    .filter((i) => (filtro.jogo === undefined ? true : i.jogoId === filtro.jogo))
    // PROPOSTA aguardando CJ — spec 05, pergunta 3: mais recente primeiro.
    .sort((a, b) => b.apitadoEm.localeCompare(a.apitadoEm))
  // A foto é lida ao vivo de `jogadores`, não do snapshot do ciclo — mesma
  // regra e mesmo motivo de `lerFeed` na Lista Secreta (identidade 04): foto
  // é apresentação, e o snapshot é escrito no instante do apito.
  const itens = await comFotosAoVivo(db, recortados)

  const geradoEm =
    vivos.length > 0 ? new Date(Math.max(...vivos.map((s) => s.geradoEm.getTime()))) : null

  if (todos.length > 0) {
    // Havia apito no dia; se o recorte zerou a lista, a tela diz "nada com
    // esse filtro", não "nenhum jogo" — são mensagens diferentes.
    return { itens, geradoEm, estadoVazio: null, primeiroJogoUtc: null }
  }

  const naoEncerradas = partidas.filter((p) => p.status !== 'ENCERRADO')
  const nenhumComecou =
    naoEncerradas.length > 0 && naoEncerradas.every((p) => p.quartoAtual === null)
  if (nenhumComecou) {
    const primeiro = naoEncerradas.reduce((a, b) => (a.dataHoraUtc <= b.dataHoraUtc ? a : b))
    return {
      itens: [],
      geradoEm,
      estadoVazio: 'AGUARDANDO_PRIMEIRO_JOGO',
      primeiroJogoUtc: primeiro.dataHoraUtc,
    }
  }

  const algumEm1Q = naoEncerradas.some((p) => p.quartoAtual === quartoFireLive)
  return {
    itens: [],
    geradoEm,
    estadoVazio: algumEm1Q ? 'SEM_APITO_AINDA' : 'NENHUM_EM_1Q',
    primeiroJogoUtc: null,
  }
}

export type PlacarAoVivo = {
  jogoId: string
  casaSigla: string
  casaPlacar: number
  visitanteSigla: string
  visitantePlacar: number
}

/**
 * Placares dos jogos AO VIVO NO 1º QUARTO — a grade que abre a tela.
 *
 * A trava mais dura do projeto: Fire Live é só 1º quarto, então o placar só
 * existe para `quartoAtual === quartoFireLive`. Um jogo que já avançou de
 * quarto some daqui mesmo que ainda esteja `AO_VIVO` — ele sai pelo mesmo
 * motivo que os apitos saem do feed.
 */
export async function placaresAoVivo(
  db: Db,
  dataReferencia: string,
  quartoFireLive: number,
): Promise<PlacarAoVivo[]> {
  const partidas = await db
    .select()
    .from(jogos)
    .where(
      and(
        eq(jogos.dataReferencia, dataReferencia),
        eq(jogos.status, 'AO_VIVO'),
        eq(jogos.quartoAtual, quartoFireLive),
      ),
    )
  if (partidas.length === 0) return []

  const idsTimes = [...new Set(partidas.flatMap((p) => [p.timeCasaId, p.timeVisitanteId]))]
  const listaTimes = await db.select().from(times).where(inArray(times.id, idsTimes))
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  return partidas.map((p) => ({
    jogoId: p.id,
    casaSigla: timePorId.get(p.timeCasaId)?.sigla ?? '—',
    casaPlacar: p.placarCasa ?? 0,
    visitanteSigla: timePorId.get(p.timeVisitanteId)?.sigla ?? '—',
    visitantePlacar: p.placarVisitante ?? 0,
  }))
}

/** Sobrescreve `fotoUrl` com o valor atual de `jogadores`, por jogador. */
async function comFotosAoVivo(db: Db, itens: ItemFireLive[]): Promise<ItemFireLive[]> {
  const ids = [...new Set(itens.map((i) => i.jogadorId))]
  if (ids.length === 0) return itens
  const fotos = await db
    .select({ id: jogadores.id, fotoUrl: jogadores.fotoUrl })
    .from(jogadores)
    .where(inArray(jogadores.id, ids))
  const porId = new Map(fotos.map((f) => [f.id, f.fotoUrl] as const))
  return itens.map((i) => ({ ...i, fotoUrl: porId.get(i.jogadorId) ?? null }))
}
