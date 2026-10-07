import { and, desc, eq } from 'drizzle-orm'

import type { Db } from '../dominio/db/tipos'
import { entradasRealizadas, jogadores } from '../dominio/db/schema'

type Atributo = (typeof entradasRealizadas.$inferSelect)['atributo']

/**
 * ENTRADAS REALIZADAS — o que o usuário digitou ter feito em outro lugar,
 * separado do que a NIP sugeriu (`entrega/gestao.ts`). A plataforma continua
 * somente leitura: este módulo só guarda e lista, nunca calcula lucro,
 * retorno ou taxa de acerto sobre o que foi registrado.
 */
export type EntradaRealizada = {
  id: string
  dataReferencia: string
  jogadorId: string
  nome: string
  atributo: Atributo
  linha: number
  unidades: number
  odd: number | null
  registradaEm: Date
}

/**
 * Grava o que o usuário registrou. `onConflictDoUpdate` pela chave natural
 * (usuário, dia, jogador, atributo, linha) faz o segundo toque em "Registrei"
 * ATUALIZAR unidades/odd em vez de duplicar a linha.
 *
 * `odd` AUSENTE (`undefined`) mantém a odd já salva: com a odd desligada no
 * ruleset (07/10/2026) o formulário nem traz o campo, e ajustar as unidades
 * não pode apagar o que a pessoa registrou antes. `null` explícito apaga.
 */
export async function registrarEntradaRealizada(
  db: Db,
  e: {
    usuarioId: string
    dataReferencia: string
    jogadorId: string
    atributo: Atributo
    linha: number
    unidades: number
    odd?: number | null
    agora: Date
  },
): Promise<void> {
  const odd = e.odd === undefined || e.odd === null ? null : e.odd.toFixed(2)
  const valores = {
    unidades: e.unidades.toFixed(2),
    registradaEm: e.agora,
    // Sem o campo, o conflito não toca a odd salva.
    ...(e.odd === undefined ? {} : { odd }),
  }
  await db
    .insert(entradasRealizadas)
    .values({
      usuarioId: e.usuarioId,
      dataReferencia: e.dataReferencia,
      jogadorId: e.jogadorId,
      atributo: e.atributo,
      linha: e.linha,
      ...valores,
      odd,
    })
    .onConflictDoUpdate({
      target: [
        entradasRealizadas.usuarioId,
        entradasRealizadas.dataReferencia,
        entradasRealizadas.jogadorId,
        entradasRealizadas.atributo,
        entradasRealizadas.linha,
      ],
      set: valores,
    })
}

/** O que o usuário registrou para aquele dia — nunca o que a NIP sugeriu. */
export async function entradasRealizadasDoDia(
  db: Db,
  usuarioId: string,
  dataReferencia: string,
): Promise<EntradaRealizada[]> {
  const linhas = await db
    .select({
      id: entradasRealizadas.id,
      dataReferencia: entradasRealizadas.dataReferencia,
      jogadorId: entradasRealizadas.jogadorId,
      nome: jogadores.nomeCompleto,
      atributo: entradasRealizadas.atributo,
      linha: entradasRealizadas.linha,
      unidades: entradasRealizadas.unidades,
      odd: entradasRealizadas.odd,
      registradaEm: entradasRealizadas.registradaEm,
    })
    .from(entradasRealizadas)
    .innerJoin(jogadores, eq(entradasRealizadas.jogadorId, jogadores.id))
    .where(
      and(
        eq(entradasRealizadas.usuarioId, usuarioId),
        eq(entradasRealizadas.dataReferencia, dataReferencia),
      ),
    )
    .orderBy(desc(entradasRealizadas.registradaEm))
  return linhas.map((l) => ({ ...l, unidades: Number(l.unidades), odd: l.odd === null ? null : Number(l.odd) }))
}
