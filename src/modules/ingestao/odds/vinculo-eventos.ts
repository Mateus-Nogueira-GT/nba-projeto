import { eq } from 'drizzle-orm'

import { identidadesJogo, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'

/**
 * EVENTO DA CASA ↔ JOGO NOSSO, por (data de referência + os dois times).
 *
 * BetMGM e Altenar não compartilham ids com o provedor NBA; o único terreno
 * comum é o confronto do dia. O casamento aceita nome completo OU sigla,
 * normalizado, nas duas ordens (tem casa que inverte o mando). Ambiguidade
 * NÃO vincula — vira contagem no resultado do job, nunca palpite: um evento
 * ligado ao jogo errado é a média de outra partida no card.
 */

export type EventoDaCasa = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
}

export type JogoParaCasar = {
  jogoId: string
  nomeCasa: string
  siglaCasa: string
  nomeVisitante: string
  siglaVisitante: string
}

function chavesDoLado(nome: string, sigla: string): string[] {
  return [normalizarTexto(nome), normalizarTexto(sigla)]
}

export function casarEventos(
  eventos: EventoDaCasa[],
  jogosDoDia: JogoParaCasar[],
): { pares: { jogoId: string; idExterno: string }[]; semPar: number; ambiguos: number } {
  // Índice: para cada jogo, o conjunto de chaves aceitas de cada lado.
  const indice = jogosDoDia.map((j) => ({
    jogoId: j.jogoId,
    ladoCasa: new Set(chavesDoLado(j.nomeCasa, j.siglaCasa)),
    ladoVisitante: new Set(chavesDoLado(j.nomeVisitante, j.siglaVisitante)),
  }))

  const pares: { jogoId: string; idExterno: string }[] = []
  let semPar = 0
  let ambiguos = 0

  for (const e of eventos) {
    if (!e.nomeCasa || !e.nomeVisitante) {
      semPar += 1
      continue
    }
    const a = normalizarTexto(e.nomeCasa)
    const b = normalizarTexto(e.nomeVisitante)
    const candidatos = indice.filter(
      (j) =>
        (j.ladoCasa.has(a) && j.ladoVisitante.has(b)) ||
        (j.ladoCasa.has(b) && j.ladoVisitante.has(a)),
    )
    if (candidatos.length === 1) {
      pares.push({ jogoId: candidatos[0]!.jogoId, idExterno: e.idExterno })
    } else if (candidatos.length === 0) semPar += 1
    else ambiguos += 1
  }
  return { pares, semPar, ambiguos }
}

/**
 * Busca os jogos do dia com nomes/siglas e grava os vínculos que casaram.
 *
 * `vinculados` conta os eventos CASADOS, não as linhas novas: reexecutar um
 * dia já vinculado deve reportar o mesmo número, não zero. A idempotência é
 * das UNIQUEs de `identidades_jogo` (provedor+id externo e jogo+provedor).
 */
export async function vincularEventosDoDia(
  db: Db,
  provedor: string,
  dataReferencia: string,
  eventos: EventoDaCasa[],
): Promise<{
  vinculados: number
  semPar: number
  ambiguos: number
  pares: { jogoId: string; idExterno: string }[]
}> {
  const doDia = await db.select().from(jogos).where(eq(jogos.dataReferencia, dataReferencia))
  const listaTimes = await db.select().from(times)
  const porId = new Map(listaTimes.map((t) => [t.id, t] as const))

  const paraCasar = doDia
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

  const { pares, semPar, ambiguos } = casarEventos(eventos, paraCasar)
  for (const par of pares) {
    await db
      .insert(identidadesJogo)
      .values({ jogoId: par.jogoId, provedor, idExterno: par.idExterno })
      .onConflictDoNothing()
  }
  return { vinculados: pares.length, semPar, ambiguos, pares }
}
