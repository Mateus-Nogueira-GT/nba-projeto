import { and, asc, gte, lt } from 'drizzle-orm'

import { jogos, times } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { intervaloDoDia } from '../dominio/rodada'
import type { ItemFeed } from './tipos-feed'

/**
 * A GRAMÁTICA DA VARREDURA — identidade 04.
 *
 * A Lista Secreta e o Fire Live são lidos POR JOGO: o cabeçalho do jogo é a
 * única fronteira de seção da tela, e dentro dele o sinal mais forte vem
 * primeiro. Tudo aqui é função pura sobre o snapshot materializado — a tela
 * ordena e agrupa, o feed não muda e o motor não roda (`tela-nao-chama-o-motor`).
 *
 * A única I/O deste módulo é `jogosDoDiaResumo`, que lê a tabela `jogos` para a
 * tela ter siglas, horário, status e placar de cada cabeçalho.
 */

export type StatusJogo = 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'

export type JogoResumo = {
  id: string
  casaSigla: string
  visitanteSigla: string
  dataHoraUtc: Date
  status: StatusJogo
  quartoAtual: number | null
  placarCasa: number | null
  placarVisitante: number | null
}

export type GrupoDeJogo = Omit<JogoResumo, 'id'> & {
  jogoId: string
  /** Em ordem de sinal: turbo, depois N3 → N1; empate por grau e por confiança. */
  itens: ItemFeed[]
}

/**
 * O card sabe em que ponto da noite está. É derivado do jogo e da existência
 * de box score — nunca de um campo digitado — e é o que faz o MESMO card servir
 * a Lista, o Fire Live e os Resultados.
 *
 *   PRE                 jogo agendado
 *   Q1                  ao vivo, no quarto que o Fire Live observa
 *   FIM_Q1              ao vivo, já fora desse quarto
 *   AGUARDANDO_OFICIAL  encerrado, mas ainda sem box score — nunca inferir de parcial
 *   CONFERIDO           encerrado com box: o rodapé pode dizer "fez N ✓/✗"
 */
export type EstadoDoCiclo = 'PRE' | 'Q1' | 'FIM_Q1' | 'AGUARDANDO_OFICIAL' | 'CONFERIDO'

export function estadoDoCiclo(
  jogo: { status: StatusJogo; quartoAtual: number | null },
  temBox: boolean,
  quartoFireLive: number,
): EstadoDoCiclo {
  switch (jogo.status) {
    case 'AGENDADO':
      return 'PRE'
    case 'AO_VIVO':
      return jogo.quartoAtual === quartoFireLive ? 'Q1' : 'FIM_Q1'
    case 'ENCERRADO':
      return temBox ? 'CONFERIDO' : 'AGUARDANDO_OFICIAL'
  }
}

/**
 * Dentro de um jogo, o sinal mais forte primeiro. É a ordem do bloco de topo
 * do CJ lida pelo card: turbo acima de tudo, depois o nível do apito, depois o
 * grau de confiança, depois a confiança bruta. Estável — dois cards iguais
 * mantêm a ordem em que vieram, e a entrada não é mutada.
 */
export function ordenarPorSinal(itens: readonly ItemFeed[]): ItemFeed[] {
  return [...itens].sort(
    (a, b) =>
      Number(b.turbo) - Number(a.turbo) ||
      b.nivelApito - a.nivelApito ||
      (b.grauConfianca ?? 0) - (a.grauConfianca ?? 0) ||
      (b.confianca ?? 0) - (a.confianca ?? 0),
  )
}

/**
 * Um grupo por jogo COM apito, em ordem de horário. Jogo do dia sem apito não
 * vira grupo: a Lista mostra onde há sinal. Item cujo jogo não está na lista
 * (snapshot e `jogos` divergindo por um instante) NÃO é engolido — vai para um
 * grupo sem cabeçalho no fim, porque perder o apito em silêncio é pior do que
 * mostrá-lo sem siglas.
 */
export function agruparPorJogo(itens: readonly ItemFeed[], doDia: readonly JogoResumo[]): GrupoDeJogo[] {
  const porId = new Map(doDia.map((j) => [j.id, j] as const))
  const baldes = new Map<string, ItemFeed[]>()
  for (const item of itens) {
    const lista = baldes.get(item.jogoId) ?? []
    lista.push(item)
    baldes.set(item.jogoId, lista)
  }

  const conhecidos: GrupoDeJogo[] = []
  const orfaos: GrupoDeJogo[] = []
  for (const [jogoId, lista] of baldes) {
    const jogo = porId.get(jogoId)
    const grupo: GrupoDeJogo = jogo
      ? { ...semId(jogo), jogoId, itens: ordenarPorSinal(lista) }
      : {
          jogoId,
          casaSigla: '—',
          visitanteSigla: '—',
          dataHoraUtc: new Date(8640000000000000),
          status: 'AGENDADO',
          quartoAtual: null,
          placarCasa: null,
          placarVisitante: null,
          itens: ordenarPorSinal(lista),
        }
    ;(jogo ? conhecidos : orfaos).push(grupo)
  }

  conhecidos.sort(
    (a, b) => a.dataHoraUtc.getTime() - b.dataHoraUtc.getTime() || a.casaSigla.localeCompare(b.casaSigla),
  )
  return [...conhecidos, ...orfaos]
}

function semId(j: JogoResumo): Omit<JogoResumo, 'id'> {
  const { id: _id, ...resto } = j
  return resto
}

/** Os jogos do dia (no fuso da rodada), no formato que o cabeçalho de jogo lê. */
export async function jogosDoDiaResumo(db: Db, dataReferencia: string, fuso: string): Promise<JogoResumo[]> {
  const { inicio, fim } = intervaloDoDia(dataReferencia, fuso)
  const [partidas, listaTimes] = await Promise.all([
    db
      .select()
      .from(jogos)
      .where(and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim)))
      .orderBy(asc(jogos.dataHoraUtc)),
    db.select({ id: times.id, sigla: times.sigla }).from(times),
  ])
  const siglaPorId = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  return partidas.map((j) => ({
    id: j.id,
    casaSigla: siglaPorId.get(j.timeCasaId) ?? '—',
    visitanteSigla: siglaPorId.get(j.timeVisitanteId) ?? '—',
    dataHoraUtc: j.dataHoraUtc,
    status: j.status,
    quartoAtual: j.quartoAtual,
    placarCasa: j.placarCasa,
    placarVisitante: j.placarVisitante,
  }))
}
