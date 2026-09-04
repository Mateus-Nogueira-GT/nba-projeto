import { eq, sql } from 'drizzle-orm'

import { identidadesJogo, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { dataDeReferencia } from '../../dominio/rodada'
import { normalizarTexto } from '../../dominio/texto'
import type { EventoDaCasa } from './porta'

/**
 * EVENTO DA CASA ↔ JOGO NOSSO, por (data de referência + os dois times).
 *
 * BetMGM e Altenar não compartilham ids com o provedor NBA; o único terreno
 * comum é o confronto do dia. O casamento aceita nome completo, sigla OU o
 * apelido (a última palavra: "Lakers", "Celtics", "Clippers") — a casa grafa
 * "Lakers vs Celtics", o provedor grava "Los Angeles Lakers" — normalizado,
 * nas duas ordens (tem casa que inverte o mando).
 *
 * Ambiguidade NÃO vincula, nos dois sentidos: um evento que serve para dois
 * jogos, ou dois eventos que servem para o mesmo jogo (a revanche daqui a
 * três dias). Vira contagem no resultado do job, nunca palpite — um evento
 * ligado ao jogo errado é a média de OUTRA partida no card.
 */

export type JogoParaCasar = {
  jogoId: string
  nomeCasa: string
  siglaCasa: string
  nomeVisitante: string
  siglaVisitante: string
}

/** As formas pelas quais um lado pode ser reconhecido. */
function chavesDoLado(nome: string, sigla: string): Set<string> {
  const completo = normalizarTexto(nome)
  const apelido = completo.split(' ').at(-1) ?? completo
  return new Set([completo, normalizarTexto(sigla), apelido])
}

function chavesDoEvento(nome: string): string[] {
  const completo = normalizarTexto(nome)
  const apelido = completo.split(' ').at(-1) ?? completo
  return [completo, apelido]
}

function ladoBate(chaves: Set<string>, nome: string): boolean {
  return chavesDoEvento(nome).some((c) => chaves.has(c))
}

export function casarEventos(
  eventos: EventoDaCasa[],
  jogosDoDia: JogoParaCasar[],
): { pares: { jogoId: string; idExterno: string }[]; semPar: number; ambiguos: number } {
  const indice = jogosDoDia.map((j) => ({
    jogoId: j.jogoId,
    ladoCasa: chavesDoLado(j.nomeCasa, j.siglaCasa),
    ladoVisitante: chavesDoLado(j.nomeVisitante, j.siglaVisitante),
  }))

  const candidatos: { jogoId: string; idExterno: string }[] = []
  let semPar = 0
  let ambiguos = 0

  for (const e of eventos) {
    if (!e.nomeCasa || !e.nomeVisitante) {
      semPar += 1
      continue
    }
    const jogosQueBatem = indice.filter(
      (j) =>
        (ladoBate(j.ladoCasa, e.nomeCasa!) && ladoBate(j.ladoVisitante, e.nomeVisitante!)) ||
        (ladoBate(j.ladoCasa, e.nomeVisitante!) && ladoBate(j.ladoVisitante, e.nomeCasa!)),
    )
    if (jogosQueBatem.length === 1) {
      candidatos.push({ jogoId: jogosQueBatem[0]!.jogoId, idExterno: e.idExterno })
    } else if (jogosQueBatem.length === 0) semPar += 1
    else ambiguos += 1
  }

  // O outro sentido: dois eventos para o MESMO jogo é ambiguidade também.
  const porJogo = new Map<string, number>()
  for (const c of candidatos) porJogo.set(c.jogoId, (porJogo.get(c.jogoId) ?? 0) + 1)
  const pares = candidatos.filter((c) => porJogo.get(c.jogoId) === 1)
  ambiguos += candidatos.length - pares.length

  return { pares, semPar, ambiguos }
}

/**
 * Corta os eventos ao DIA de referência antes de casar. A BetMGM devolve toda
 * a agenda futura; a Altenar, dois dias. Sem este corte, a revanche de
 * terça casaria com o jogo de domingo. Evento sem horário informado passa —
 * o casador ainda exige o confronto, e a ambiguidade continua contando.
 */
function doDia(eventos: EventoDaCasa[], dataReferencia: string, fuso: string) {
  const dentro: EventoDaCasa[] = []
  let fora = 0
  for (const e of eventos) {
    if (e.inicioIso) {
      const inicio = new Date(e.inicioIso)
      if (!Number.isNaN(inicio.getTime()) && dataDeReferencia(inicio, fuso) !== dataReferencia) {
        fora += 1
        continue
      }
    }
    dentro.push(e)
  }
  return { dentro, fora }
}

/**
 * Busca os jogos do dia com nomes/siglas e grava os vínculos que casaram.
 *
 * `vinculados` conta os eventos CASADOS, não as linhas novas: reexecutar um
 * dia já vinculado deve reportar o mesmo número, não zero. O upsert é por
 * (jogo, provedor): se a casa reemitir o evento com outro id (adiamento,
 * recriação), o id novo substitui o velho em vez de ficar preso para sempre.
 */
export async function vincularEventosDoDia(
  db: Db,
  provedor: string,
  dataReferencia: string,
  eventos: EventoDaCasa[],
  fuso: string,
): Promise<{
  vinculados: number
  semPar: number
  ambiguos: number
  foraDoDia: number
  pares: { jogoId: string; idExterno: string }[]
}> {
  const { dentro, fora } = doDia(eventos, dataReferencia, fuso)

  const jogosDoDia = await db
    .select({ id: jogos.id, timeCasaId: jogos.timeCasaId, timeVisitanteId: jogos.timeVisitanteId })
    .from(jogos)
    .where(eq(jogos.dataReferencia, dataReferencia))
  const listaTimes = await db.select({ id: times.id, nome: times.nome, sigla: times.sigla }).from(times)
  const porId = new Map(listaTimes.map((t) => [t.id, t] as const))

  const paraCasar = jogosDoDia
    .map((j) => {
      const c = porId.get(j.timeCasaId)
      const v = porId.get(j.timeVisitanteId)
      if (!c || !v) return null
      return {
        jogoId: j.id,
        nomeCasa: c.nome,
        siglaCasa: c.sigla,
        nomeVisitante: v.nome,
        siglaVisitante: v.sigla,
      }
    })
    .filter((j): j is JogoParaCasar => j !== null)

  const { pares, semPar, ambiguos } = casarEventos(dentro, paraCasar)
  if (pares.length > 0) {
    await db
      .insert(identidadesJogo)
      .values(pares.map((p) => ({ jogoId: p.jogoId, provedor, idExterno: p.idExterno })))
      .onConflictDoUpdate({
        target: [identidadesJogo.jogoId, identidadesJogo.provedor],
        set: { idExterno: sql`excluded.id_externo`, atualizadoEm: sql`now()` },
      })
  }
  return { vinculados: pares.length, semPar, ambiguos, foraDoDia: fora, pares }
}
