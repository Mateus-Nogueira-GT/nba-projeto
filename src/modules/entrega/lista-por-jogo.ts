import { and, asc, eq, gte, lt } from 'drizzle-orm'

import { jogos, niveis, niveisVersao, times } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { intervaloDoDia } from '../dominio/rodada'
import type { Atributo } from '../motor/tipos'
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
export function agruparPorJogo(
  itens: readonly ItemFeed[],
  doDia: readonly JogoResumo[],
): GrupoDeJogo[] {
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
    (a, b) =>
      a.dataHoraUtc.getTime() - b.dataHoraUtc.getTime() || a.casaSigla.localeCompare(b.casaSigla),
  )
  return [...conhecidos, ...orfaos]
}

function semId(j: JogoResumo): Omit<JogoResumo, 'id'> {
  const { id: _id, ...resto } = j
  return resto
}

/**
 * A ORDEM DE LEITURA DOS ATRIBUTOS — PTS · REB · AST (spec 04, §4.1).
 *
 * É ordem de LEITURA, não de força: o rodapé de todo card traz as abas na
 * mesma sequência para que a lista possa ser VARRIDA. Ordem que muda de card
 * para card obriga a ler.
 */
const ORDEM_DE_LEITURA: readonly Atributo[] = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']

/** Um card por jogador: o apito de maior sinal manda, os outros viram abas. */
export type CartaoDeJogador = {
  /**
   * O apito de MAIOR sinal do jogador — o sujeito da ordenação e do
   * agrupamento, mesmo quando a aba aberta é outra: abrir "REB" não pode fazer
   * o card pular de lugar embaixo do dedo de quem tocou nele.
   */
  principal: ItemFeed
  /** O apito à vista: o da aba aberta, ou o principal. */
  visivel: ItemFeed
  /** Todos os apitos do jogador hoje, em ordem fixa PTS · REB · AST. */
  atributos: ItemFeed[]
}

/**
 * O mesmo jogador com dois ou três atributos vira UM card com abas (spec 04,
 * §4.1) — era o que a tela mais repetia.
 *
 * Entra a lista JÁ EM ORDEM DE SINAL (`ordenarPorSinal`): a primeira aparição
 * de cada jogador é o melhor atributo dele, e a ordem de saída é a ordem da
 * varredura. `abaAberta` responde qual atributo a URL abriu para aquele card —
 * uma função, e não a rota, para esta camada não saber de querystring.
 */
export function cartoesPorJogador(
  itens: readonly ItemFeed[],
  abaAberta?: (jogadorId: string) => Atributo | undefined,
): CartaoDeJogador[] {
  const porJogador = new Map<string, ItemFeed[]>()
  for (const item of itens) {
    porJogador.set(item.jogadorId, [...(porJogador.get(item.jogadorId) ?? []), item])
  }
  return [...porJogador.values()].map((doJogador) => {
    const principal = doJogador[0]!
    const atributos = [...doJogador].sort(
      (a, b) => ORDEM_DE_LEITURA.indexOf(a.atributo) - ORDEM_DE_LEITURA.indexOf(b.atributo),
    )
    const pedido = abaAberta?.(principal.jogadorId)
    return {
      principal,
      visivel: atributos.find((i) => i.atributo === pedido) ?? principal,
      atributos,
    }
  })
}

/** Contra quem, e de que lado: `IND · vs MIA` (casa) ou `MIA · @ IND` (fora). */
export type Confronto = { adversarioSigla: string; emCasa: boolean }

/**
 * O confronto do card sai do JOGO, não do item: o vínculo jogador↔time é
 * curadoria do CJ e pode não bater com nenhum dos dois lados da partida real
 * (Giannis no Miami). Sem certeza, o card simplesmente não fala em confronto —
 * melhor que um "vs —" que não informa nada.
 */
export function confrontoDoItem(
  item: { timeSigla: string },
  jogo: { casaSigla: string; visitanteSigla: string } | null,
): Confronto | null {
  if (jogo === null) return null
  if (item.timeSigla === jogo.casaSigla)
    return { adversarioSigla: jogo.visitanteSigla, emCasa: true }
  if (item.timeSigla === jogo.visitanteSigla)
    return { adversarioSigla: jogo.casaSigla, emCasa: false }
  return null
}

/** Posição do jogador na hierarquia do time NAQUELE atributo — lente HIERARQUIA. */
export type PosicaoNaHierarquia = { posicao: number; total: number }

type LinhaDeNivel = {
  jogadorId: string
  timeId: string
  atributo: Atributo
  posicaoHierarquia: number
}

/** A chave do mapa da hierarquia: o par (jogador, atributo) que o card mostra. */
export const chaveDaHierarquia = (jogadorId: string, atributo: Atributo): string =>
  `${jogadorId}:${atributo}`

/**
 * O depth chart do CJ virando "Nº 2 DE 8". O total é do TIME do jogador
 * NAQUELE atributo — a hierarquia é por (time, atributo), como a OPD a lê.
 * Quem não está na versão ativa fica de fora: a lente escreve "—", nunca um
 * palpite.
 */
export function posicoesNaHierarquia(
  linhas: readonly LinhaDeNivel[],
  chaves: readonly { jogadorId: string; atributo: Atributo }[],
): Map<string, PosicaoNaHierarquia> {
  const totalPorTime = new Map<string, number>()
  const porJogador = new Map<string, LinhaDeNivel>()
  for (const l of linhas) {
    const doTime = `${l.timeId}:${l.atributo}`
    totalPorTime.set(doTime, (totalPorTime.get(doTime) ?? 0) + 1)
    porJogador.set(chaveDaHierarquia(l.jogadorId, l.atributo), l)
  }

  const mapa = new Map<string, PosicaoNaHierarquia>()
  for (const { jogadorId, atributo } of chaves) {
    const linha = porJogador.get(chaveDaHierarquia(jogadorId, atributo))
    if (!linha) continue
    mapa.set(chaveDaHierarquia(jogadorId, atributo), {
      posicao: linha.posicaoHierarquia,
      total: totalPorTime.get(`${linha.timeId}:${linha.atributo}`) ?? 1,
    })
  }
  return mapa
}

/**
 * A hierarquia dos apitados de hoje, em UMA consulta: a versão ativa de
 * `niveis` é a curadoria do CJ (poucas centenas de linhas), e a tela só a lê
 * quando a lente HIERARQUIA está escolhida.
 */
export async function hierarquiaDosApitados(
  db: Db,
  chaves: readonly { jogadorId: string; atributo: Atributo }[],
): Promise<Map<string, PosicaoNaHierarquia>> {
  if (chaves.length === 0) return new Map()
  const [versao] = await db
    .select({ id: niveisVersao.id })
    .from(niveisVersao)
    .where(eq(niveisVersao.ativa, true))
    .limit(1)
  if (!versao) return new Map()

  const linhas = await db
    .select({
      jogadorId: niveis.jogadorId,
      timeId: niveis.timeId,
      atributo: niveis.atributo,
      posicaoHierarquia: niveis.posicaoHierarquia,
    })
    .from(niveis)
    .where(eq(niveis.niveisVersaoId, versao.id))
  return posicoesNaHierarquia(linhas, chaves)
}

/** Os jogos do dia (no fuso da rodada), no formato que o cabeçalho de jogo lê. */
export async function jogosDoDiaResumo(
  db: Db,
  dataReferencia: string,
  fuso: string,
): Promise<JogoResumo[]> {
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
