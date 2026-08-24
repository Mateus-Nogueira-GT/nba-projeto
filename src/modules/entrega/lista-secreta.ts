import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'

import { montarFatos, primeiroJogoDoDia } from '../dominio/fatos'
import { feedSnapshot, jogadores, niveis, niveisVersao, times } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { gravarApitos } from '../dominio/repositorios/apitos'
import { avaliar } from '../motor'
import type { Apito, Atributo, Metodo, Nivel, NivelApito } from '../motor/tipos'
import type { Ruleset } from '../motor/ruleset/schema'

/**
 * Item já pronto para a tela.
 *
 * O feed é MATERIALIZADO: o motor roda uma vez por evento, não uma vez por
 * usuário. Com 10k conectados, é essa diferença que decide se a conta fecha.
 * Ver docs/01-arquitetura.md > "10.000 simultâneos".
 */
export type ItemFeed = {
  chave: string
  jogoId: string
  jogadorId: string
  nome: string
  timeSigla: string
  timeNome: string
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  turbo: boolean
  modoFire: boolean
  opdOrigemNivel: NivelApito | null
  linha: number | null
  /** Nota de confiança da análise do CJ. Nunca "probabilidade". */
  confianca: number | null
  alvo1Q: number | null
  /**
   * Método que produziu o apito. Viaja no feed porque o documento do CJ pede
   * filtragem por método. Null em snapshot anterior à spec 08.
   */
  metodo: Metodo | null
  /** G/F/C — dado canônico do jogador, usado só como recorte de leitura. */
  posicao: string | null
}

export type ConteudoFeed = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  itens: ItemFeed[]
}

export type ResultadoPublicacao =
  | { publicou: false; motivo: 'ainda-cedo' | 'sem-jogos' | 'sem-lista-ativa' }
  | { publicou: true; mudou: boolean; hash: string; itens: number; apitosNovos: number }

function hashDe(conteudo: ConteudoFeed): string {
  // O horário de geração fica FORA do hash de propósito: senão toda execução
  // pareceria uma mudança, e o reprocessamento perderia o sentido.
  const estavel = JSON.stringify(
    conteudo.itens.map((i) => [i.chave, i.nivelApito, i.turbo, i.modoFire, i.confianca]),
  )
  return createHash('sha256').update(estavel).digest('hex').slice(0, 16)
}

/**
 * Publica a Lista Secreta do dia.
 *
 * Reexecutável de propósito: escalação muda até 1h antes do jogo, e a OPD
 * depende inteiramente dela. Chamar de novo recalcula, e o snapshot só é
 * regravado quando o conteúdo realmente mudou.
 */
export async function publicarListaSecreta(
  db: Db,
  ruleset: Ruleset,
  opcoes: { dataReferencia: string; agora: Date; ignorarAntecedencia?: boolean },
): Promise<ResultadoPublicacao> {
  const primeiro = await primeiroJogoDoDia(db, opcoes.dataReferencia)
  if (primeiro === null) return { publicou: false, motivo: 'sem-jogos' }

  if (opcoes.ignorarAntecedencia !== true) {
    const antecedenciaMs = ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000
    if (opcoes.agora.getTime() < primeiro.getTime() - antecedenciaMs) {
      return { publicou: false, motivo: 'ainda-cedo' }
    }
  }

  const fatos = await montarFatos(db, opcoes.dataReferencia, {
    mesInicio: ruleset.temporada.mes_inicio,
    formato: ruleset.temporada.formato,
  })
  if (fatos.times.length === 0) return { publicou: false, motivo: 'sem-lista-ativa' }

  const apitos = avaliar(fatos, ruleset).filter((a) => a.estrategia === 'LISTA_SECRETA')

  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  const rulesetVersao = `v${ruleset.version}`

  const gravados = await gravarApitos(db, rulesetVersao, apitos)

  const conteudo: ConteudoFeed = {
    dataReferencia: opcoes.dataReferencia,
    geradoEm: opcoes.agora.toISOString(),
    rulesetVersao: versao ? `${rulesetVersao}+${versao.versao}` : rulesetVersao,
    itens: await enriquecer(db, apitos),
  }

  const hash = hashDe(conteudo)

  const [existente] = await db
    .select()
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, opcoes.dataReferencia),
        eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
      ),
    )
    .limit(1)

  const mudou = existente?.hash !== hash

  if (mudou) {
    await db
      .insert(feedSnapshot)
      .values({
        dataReferencia: opcoes.dataReferencia,
        estrategia: 'LISTA_SECRETA',
        conteudoJson: conteudo,
        geradoEm: opcoes.agora,
        hash,
      })
      .onConflictDoUpdate({
        // A UNIQUE passou a incluir jogo_id (spec 05); NULL colide via nullsNotDistinct.
        target: [feedSnapshot.dataReferencia, feedSnapshot.estrategia, feedSnapshot.jogoId],
        set: { conteudoJson: conteudo, geradoEm: opcoes.agora, hash },
      })
  }

  return { publicou: true, mudou, hash, itens: conteudo.itens.length, apitosNovos: gravados.length }
}

/** Junta ao apito o que a tela precisa mostrar: nome, time, sigla. */
async function enriquecer(db: Db, apitos: Apito[]): Promise<ItemFeed[]> {
  if (apitos.length === 0) return []

  const [elenco, listaTimes, vinculos] = await Promise.all([
    db.select().from(jogadores),
    db.select().from(times),
    db.select().from(niveis),
  ])

  const nomePorJogador = new Map(elenco.map((j) => [j.id, j.nomeCompleto] as const))
  const posicaoPorJogador = new Map(elenco.map((j) => [j.id, j.posicao] as const))
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  // O time vem da LISTA do CJ, não de jogadores.time_id — elencos projetados.
  const timeDoJogador = new Map(vinculos.map((v) => [v.jogadorId, v.timeId] as const))

  return apitos.map((a) => {
    const time = timePorId.get(timeDoJogador.get(a.jogadorId) ?? '')
    return {
      chave: a.chaveDeduplicacao,
      jogoId: a.jogoId,
      jogadorId: a.jogadorId,
      nome: nomePorJogador.get(a.jogadorId) ?? a.jogadorId,
      timeSigla: time?.sigla ?? '—',
      timeNome: time?.nome ?? '—',
      atributo: a.atributo,
      nivelJogador: a.nivelJogador,
      nivelApito: a.nivelApito,
      turbo: a.turbo,
      modoFire: a.modoFire,
      opdOrigemNivel: a.opdOrigemNivel,
      linha: a.linha,
      confianca: a.confianca,
      alvo1Q: a.alvo1Q,
      metodo: a.metodo,
      posicao: posicaoPorJogador.get(a.jogadorId) ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// FILTROS DA LISTA — recorte de LEITURA, puro. A tela nunca executa o motor.
// ---------------------------------------------------------------------------

/** "TURBO" não é um método do motor: é o destaque que atravessa os dois. */
export type FiltroLista = {
  metodo?: 'OSCILACAO' | 'OPD' | 'TURBO'
  nivel?: Nivel
  time?: string
  posicao?: string
}

export function filtrarItens(itens: ItemFeed[], filtro: FiltroLista): ItemFeed[] {
  return itens
    .filter((i) =>
      filtro.metodo === undefined
        ? true
        : filtro.metodo === 'TURBO'
          ? i.turbo
          : i.metodo === filtro.metodo,
    )
    .filter((i) => (filtro.nivel === undefined ? true : i.nivelJogador === filtro.nivel))
    .filter((i) => (filtro.time === undefined ? true : i.timeSigla === filtro.time))
    .filter((i) => (filtro.posicao === undefined ? true : i.posicao === filtro.posicao))
}

/**
 * Um card por JOGADOR, não por linha.
 *
 * O motor emite um apito por linha de pontos (20/25/30/35). O documento do CJ
 * desenha uma BARRA por jogador com os "quadradinhos" das linhas dentro dela —
 * as linhas restantes vivem em /apito/<jogador>. Sem isso o mesmo nome aparece
 * três ou quatro vezes seguidas na lista.
 *
 * Escolhe a linha de maior confiança; empate resolve pela MENOR linha, para
 * que a ordem não dependa da ordem de chegada.
 */
export function agruparPorJogador(itens: ItemFeed[]): ItemFeed[] {
  const melhor = new Map<string, ItemFeed>()
  for (const item of itens) {
    const atual = melhor.get(item.jogadorId)
    if (atual === undefined) {
      melhor.set(item.jogadorId, item)
      continue
    }
    const c = item.confianca ?? -1
    const cAtual = atual.confianca ?? -1
    if (c > cAtual || (c === cAtual && (item.linha ?? Infinity) < (atual.linha ?? Infinity))) {
      melhor.set(item.jogadorId, item)
    }
  }
  return [...melhor.values()]
}

/** Lê o feed materializado. É por aqui que a tela entra — nunca pelo motor. */
export async function lerFeed(
  db: Db,
  dataReferencia: string,
): Promise<{ conteudo: ConteudoFeed; geradoEm: Date } | null> {
  const [linha] = await db
    .select()
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, dataReferencia),
        eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
      ),
    )
    .limit(1)

  if (!linha) return null
  return { conteudo: linha.conteudoJson as ConteudoFeed, geradoEm: linha.geradoEm }
}

/**
 * Ordena pela escala de confiança, do mais forte para o mais fraco.
 *
 * Turbo primeiro, depois nível do apito, depois a nota. Empate desempata pela
 * chave, para que a ordem seja estável entre execuções.
 */
export function ordenarPorConfianca(itens: ItemFeed[]): ItemFeed[] {
  return [...itens].sort(
    (a, b) =>
      Number(b.turbo) - Number(a.turbo) ||
      b.nivelApito - a.nivelApito ||
      (b.confianca ?? 0) - (a.confianca ?? 0) ||
      a.chave.localeCompare(b.chave),
  )
}

/**
 * Aplica a mudança de escalação e republica.
 *
 * Escalações oficiais saem até 1h antes do jogo, e a OPD é inteiramente
 * dependente delas: um desfalque no topo da hierarquia muda os apitos dos
 * três jogadores seguintes.
 */
export async function reprocessarPorEscalacao(
  db: Db,
  ruleset: Ruleset,
  opcoes: { dataReferencia: string; agora: Date },
): Promise<ResultadoPublicacao> {
  return publicarListaSecreta(db, ruleset, { ...opcoes, ignorarAntecedencia: true })
}
