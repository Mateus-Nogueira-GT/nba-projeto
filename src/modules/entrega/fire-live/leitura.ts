import { and, eq, inArray, or, sql } from 'drizzle-orm'

import {
  estatisticasTimeJogo,
  feedSnapshot,
  jogadores,
  jogos,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { janelaNoBanco } from '../../dominio/janela'
import { somarDias } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import type { Ruleset } from '../../motor/ruleset/schema'
import { colunaMedia } from '../historico-na-linha'
import { agruparPorJogo } from '../lista-por-jogo'
import type { GrupoDeJogo, JogoResumo, StatusJogo } from '../lista-por-jogo'
import type { ConteudoFeedFireLive, ItemFireLive } from './feed'

/**
 * A tela vazia é a experiência DOMINANTE do Fire Live — fora da janela dos
 * jogos, é o que o assinante vê. Cada estado explica o próprio motivo; o
 * quarto caso é o único em que "funcionando e vazio" é a resposta certa.
 */
export type EstadoVazio =
  'SEM_JOGO_HOJE' | 'AGUARDANDO_PRIMEIRO_JOGO' | 'NENHUM_EM_1Q' | 'SEM_APITO_AINDA'

export type FeedFireLive = {
  itens: ItemFireLive[]
  /** Mesma rodada dos snapshots; o placar é o do 1º quarto, inclusive após ele acabar. */
  jogos: JogoResumo[]
  /** Snapshot mais antigo do recorte: outro jogo não pode esconder dado defasado. */
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

/** A rodada vira à meia-noite; uma partida em andamento não termina com ela. */
function partidasDoFeed(dataReferencia: string) {
  return or(
    eq(jogos.dataReferencia, dataReferencia),
    and(
      eq(jogos.dataReferencia, somarDias(dataReferencia, -1)),
      eq(jogos.status, 'AO_VIVO'),
    ),
  )
}

export async function lerFeedFireLive(
  db: Db,
  dataReferencia: string,
  quartoFireLive: number,
  filtro: FiltroFireLive = {},
): Promise<FeedFireLive> {
  const recorteDePartidas = partidasDoFeed(dataReferencia)
  const [partidas, snapshotsComJogo, listaTimes, placaresQ1] = await Promise.all([
    db.select().from(jogos).where(recorteDePartidas),
    db
      .select({ snapshot: feedSnapshot })
      .from(feedSnapshot)
      .innerJoin(jogos, eq(feedSnapshot.jogoId, jogos.id))
      .where(
        and(
          recorteDePartidas,
          eq(feedSnapshot.dataReferencia, sql<string>`${jogos.dataReferencia}::text`),
          eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
        ),
      ),
    db.select({ id: times.id, sigla: times.sigla }).from(times),
    db
      .select({
        jogoId: estatisticasTimeJogo.jogoId,
        timeId: estatisticasTimeJogo.timeId,
        pontos: estatisticasTimeJogo.pontosQ1,
      })
      .from(estatisticasTimeJogo)
      .innerJoin(jogos, eq(estatisticasTimeJogo.jogoId, jogos.id))
      .where(recorteDePartidas),
  ])
  const snapshots = snapshotsComJogo.map(({ snapshot }) => snapshot)

  if (partidas.length === 0) {
    return {
      itens: [],
      jogos: [],
      geradoEm: null,
      estadoVazio: 'SEM_JOGO_HOJE',
      primeiroJogoUtc: null,
    }
  }

  const siglaPorId = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  const q1PorTime = new Map(placaresQ1.map((p) => [`${p.jogoId}|${p.timeId}`, p.pontos] as const))
  const jogosDaRodada: JogoResumo[] = partidas.map((j) => ({
    id: j.id,
    casaSigla: siglaPorId.get(j.timeCasaId) ?? '—',
    visitanteSigla: siglaPorId.get(j.timeVisitanteId) ?? '—',
    dataHoraUtc: j.dataHoraUtc,
    status: j.status,
    quartoAtual: j.quartoAtual,
    // No Q1, o total vivo é o parcial desse quarto. Depois dele, só a quebra
    // oficial responde: usar o total mostraria pontos do Q2 sob "FIM 1º Q".
    placarCasa:
      j.status === 'AO_VIVO' && j.quartoAtual === quartoFireLive
        ? j.placarCasa
        : (q1PorTime.get(`${j.id}|${j.timeCasaId}`) ?? null),
    placarVisitante:
      j.status === 'AO_VIVO' && j.quartoAtual === quartoFireLive
        ? j.placarVisitante
        : (q1PorTime.get(`${j.id}|${j.timeVisitanteId}`) ?? null),
  }))
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

  const jogosDoRecorte = new Set(
    jogosDaRodada
      .filter(
        (j) =>
          (filtro.jogo === undefined || j.id === filtro.jogo) &&
          (filtro.time === undefined ||
            j.casaSigla === filtro.time ||
            j.visitanteSigla === filtro.time),
      )
      .map((j) => j.id),
  )
  const snapshotsDoRecorte = vivos.filter((s) => s.jogoId !== null && jogosDoRecorte.has(s.jogoId))
  const geradoEm =
    snapshotsDoRecorte.length > 0
      ? new Date(Math.min(...snapshotsDoRecorte.map((s) => s.geradoEm.getTime())))
      : null

  if (todos.length > 0) {
    // Havia apito no dia; se o recorte zerou a lista, a tela diz "nada com
    // esse filtro", não "nenhum jogo" — são mensagens diferentes.
    return { itens, jogos: jogosDaRodada, geradoEm, estadoVazio: null, primeiroJogoUtc: null }
  }

  const naoEncerradas = partidas.filter((p) => p.status !== 'ENCERRADO')
  const nenhumComecou =
    naoEncerradas.length > 0 && naoEncerradas.every((p) => p.quartoAtual === null)
  if (nenhumComecou) {
    const primeiro = naoEncerradas.reduce((a, b) => (a.dataHoraUtc <= b.dataHoraUtc ? a : b))
    return {
      itens: [],
      jogos: jogosDaRodada,
      geradoEm,
      estadoVazio: 'AGUARDANDO_PRIMEIRO_JOGO',
      primeiroJogoUtc: primeiro.dataHoraUtc,
    }
  }

  const algumEm1Q = naoEncerradas.some((p) => p.quartoAtual === quartoFireLive)
  return {
    itens: [],
    jogos: jogosDaRodada,
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
        partidasDoFeed(dataReferencia),
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

// ===========================================================================
// A TELA POR JOGO — identidade 04, §4.2
// ===========================================================================

/**
 * O marco do MODO FIRE na barra do card: o percentual da média que acende o
 * modo fire, escrito por extenso.
 *
 * Valor e rótulo nascem AQUI, na entrega, e não no componente: o percentual é
 * regra de estratégia e mora no ruleset (`fire_live.modo_fire`). Se ele mudar
 * no YAML, o texto do card muda junto sem uma linha de código (CLAUDE.md,
 * regra 1).
 */
export type MarcoDoModoFire = { valor: number; rotulo: string }

/** O item do feed com o que só a TELA precisa. O snapshot não muda. */
export type ItemFireLiveNaTela = ItemFireLive & {
  /**
   * O marco do modo fire, ou `null` quando ele não existe para este item —
   * jogador de nível que o ruleset não põe em modo fire, ou sem média gravada.
   * Número que a tela não tem, a tela não inventa.
   */
  alvoFire: MarcoDoModoFire | null
}

/**
 * Junta a cada item o marco do modo fire — média da temporada × o percentual
 * do ruleset.
 *
 * Lê a média na LEITURA, e não da materialização, pelo mesmo motivo da foto: o
 * snapshot do Fire Live é escrito no instante do apito e o card do 1º quarto
 * não carrega média nenhuma (`mediaTemporada: null` em feed.ts). A janela vem
 * do ruleset — a mesma tradução que a Lista Secreta usa —, e a temporada, do
 * instante do apito, que por construção cai dentro do jogo.
 */
export async function comAlvoDoModoFire(
  db: Db,
  ruleset: Ruleset,
  itens: readonly ItemFireLive[],
): Promise<ItemFireLiveNaTela[]> {
  if (itens.length === 0) return []

  const modoFire = ruleset.fire_live.modo_fire
  const calendario = calendarioDoRuleset(ruleset)
  const ids = [...new Set(itens.map((i) => i.jogadorId))]
  const linhas = await db
    .select()
    .from(mediasJogador)
    .where(
      and(
        eq(mediasJogador.janela, janelaNoBanco(ruleset.media.janela)),
        inArray(mediasJogador.jogadorId, ids),
      ),
    )
  const porChave = new Map(linhas.map((m) => [`${m.jogadorId}|${m.temporada}`, m] as const))

  // "75% da média" — o número sai do YAML, e em pt-BR: um percentual quebrado
  // (0,725) sairia "72.5% da média" na interpolação crua.
  const rotulo = `${(modoFire.percentual_media * 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })}% da média`

  return itens.map((item) => {
    if (!modoFire.aplica_a.includes(item.nivelJogador)) return { ...item, alvoFire: null }
    const temporada = temporadaDe(new Date(item.apitadoEm), calendario)
    const linha = porChave.get(`${item.jogadorId}|${temporada}`)
    const media = linha ? colunaMedia(linha, item.atributo) : null
    if (media === null) return { ...item, alvoFire: null }
    return {
      ...item,
      alvoFire: { valor: Number(media) * modoFire.percentual_media, rotulo },
    }
  })
}

/**
 * Os três estados naturais da tela ao vivo (spec 04, §4.2) — chips no topo e
 * ORDEM da tela, nesta sequência:
 *
 *   EM_1Q       o jogo está no quarto que o Fire Live observa
 *   AGUARDANDO  o jogo ainda não começou; os alvos esperam
 *   FIM_1Q      o 1º quarto passou; o apito NÃO some, congela
 */
export type EstadoDoJogoNoFireLive = 'EM_1Q' | 'AGUARDANDO' | 'FIM_1Q'

export type GrupoFireLive = GrupoDeJogo<ItemFireLiveNaTela> & {
  estado: EstadoDoJogoNoFireLive
  /** Quantos alvos da lista de hoje esperam o 1º quarto deste jogo. */
  alvosAguardando: number
}

const ORDEM_DO_ESTADO: Record<EstadoDoJogoNoFireLive, number> = {
  EM_1Q: 0,
  AGUARDANDO: 1,
  FIM_1Q: 2,
}

function estadoDoJogo(
  jogo: { status: StatusJogo; quartoAtual: number | null },
  quartoFireLive: number,
): EstadoDoJogoNoFireLive {
  if (jogo.status === 'AGENDADO') return 'AGUARDANDO'
  return jogo.status === 'AO_VIVO' && jogo.quartoAtual === quartoFireLive ? 'EM_1Q' : 'FIM_1Q'
}

/**
 * A TELA DO FIRE LIVE, POR JOGO — a mesma gramática da Lista Secreta, quente.
 *
 * Três origens, um só resultado ordenado:
 *   · os jogos COM apito, vindos do snapshot (`agruparPorJogo`);
 *   · os jogos que estão NO 1º quarto e ainda não apitaram ninguém — entram
 *     mesmo vazios, porque é a tela ao vivo: o placar do jogo que está rolando
 *     é notícia mesmo sem card (era o que a grade de `PlacarMini` mostrava);
 *   · os jogos AGENDADOS com alvos esperando, que viram cabeçalho mudo.
 *
 * O estado é lido do JOGO a cada render, nunca do `encerrado` gravado no
 * snapshot: entre um ciclo e outro o quarto vira, e o card tem que virar com
 * ele. Jogo agendado com zero alvos esperando não vira grupo — "0 alvos
 * aguardando" não é notícia, é ruído.
 */
export function agruparFireLivePorJogo(
  itens: readonly ItemFireLiveNaTela[],
  doDia: readonly JogoResumo[],
  quartoFireLive: number,
  alvosAguardando: ReadonlyMap<string, number> = new Map(),
): GrupoFireLive[] {
  const comApito: GrupoFireLive[] = agruparPorJogo(itens, doDia).map((grupo) => ({
    ...grupo,
    estado: estadoDoJogo(grupo, quartoFireLive),
    alvosAguardando: alvosAguardando.get(grupo.jogoId) ?? 0,
  }))
  const jaTem = new Set(comApito.map((g) => g.jogoId))

  const semApito: GrupoFireLive[] = doDia
    .filter((jogo) => !jaTem.has(jogo.id))
    .map((jogo) => ({
      ...semId(jogo),
      jogoId: jogo.id,
      estado: estadoDoJogo(jogo, quartoFireLive),
      alvosAguardando: alvosAguardando.get(jogo.id) ?? 0,
      itens: [],
    }))
    // O jogo no 1º quarto entra mesmo sem apito; o agendado só com alvo
    // esperando; o que já passou do 1º quarto e não apitou ninguém não tem o
    // que mostrar.
    .filter((g) => g.estado === 'EM_1Q' || (g.estado === 'AGUARDANDO' && g.alvosAguardando > 0))

  return [...comApito, ...semApito].sort(
    (a, b) =>
      ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado] ||
      a.dataHoraUtc.getTime() - b.dataHoraUtc.getTime() ||
      a.casaSigla.localeCompare(b.casaSigla),
  )
}

function semId(jogo: JogoResumo): Omit<JogoResumo, 'id'> {
  const { id: _id, ...resto } = jogo
  return resto
}

/**
 * Quantos alvos da LISTA DE HOJE esperam o 1º quarto de cada jogo — a contagem
 * do cabeçalho mudo ("4 alvos aguardando o 1º quarto").
 *
 * Conta JOGADORES, não apitos: o mesmo jogador com pontos e rebotes é um alvo
 * só na tela, do mesmo jeito que é um card só na Lista.
 *
 * A fonte é a Lista Secreta do dia porque é o que a tela pode saber sem rodar
 * o motor: o alvo do 1º quarto de cada jogador só existe depois que o Fire
 * Live avalia o jogo, e avaliar aqui violaria `tela-nao-chama-o-motor`.
 */
export function alvosAguardandoPorJogo(
  itens: readonly { jogoId: string; jogadorId: string }[],
): Map<string, number> {
  const porJogo = new Map<string, Set<string>>()
  for (const item of itens) {
    const jogadores = porJogo.get(item.jogoId) ?? new Set<string>()
    jogadores.add(item.jogadorId)
    porJogo.set(item.jogoId, jogadores)
  }
  return new Map([...porJogo].map(([jogoId, jogadores]) => [jogoId, jogadores.size] as const))
}
