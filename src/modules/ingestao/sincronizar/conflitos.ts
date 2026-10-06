import { and, eq } from 'drizzle-orm'

import {
  conflitosIdentidadeJogador,
  identidadesJogador,
  jogadores,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * CURADORIA DE CONFLITO DE IDENTIDADE — a decisão humana que faltava.
 *
 * `garantirJogadores` nunca une dois ids pelo nome: registra o conflito e o
 * snapshot do jogo é recusado. Até 06/10/2026 não havia como resolver — e o
 * backfill com a chave GOAT parou nele: a BallDontLie tem REGISTROS DUPLICADOS
 * da mesma pessoa (Micah Potter em MIA e POR, Alex Antetokounmpo em SAC e
 * MIL, Yabusele no CHI e no Real Madrid).
 *
 * As duas saídas são decisão de quem conhece o jogador, nunca do código:
 *   vincular — é a MESMA pessoa: o id novo aponta para o jogador candidato;
 *   separar  — é OUTRA pessoa: nasce um jogador próprio para o id novo.
 */

export type ConflitoPendente = {
  provedor: string
  idExterno: string
  nomeExterno: string
  motivo: string
  ocorrencias: number
  candidato: { id: string; nome: string; time: string | null; idsExternos: string[] } | null
}

export async function listarConflitosPendentes(db: Db): Promise<ConflitoPendente[]> {
  const linhas = await db
    .select({
      provedor: conflitosIdentidadeJogador.provedor,
      idExterno: conflitosIdentidadeJogador.idExterno,
      nomeExterno: conflitosIdentidadeJogador.nomeExterno,
      motivo: conflitosIdentidadeJogador.motivo,
      ocorrencias: conflitosIdentidadeJogador.ocorrencias,
      candidatoId: jogadores.id,
      candidatoNome: jogadores.nomeCompleto,
      candidatoTime: times.sigla,
    })
    .from(conflitosIdentidadeJogador)
    .leftJoin(jogadores, eq(jogadores.id, conflitosIdentidadeJogador.jogadorCandidatoId))
    .leftJoin(times, eq(times.id, jogadores.timeId))
    .where(eq(conflitosIdentidadeJogador.estado, 'PENDENTE'))
    .orderBy(conflitosIdentidadeJogador.primeiraOcorrenciaEm)

  const resultado: ConflitoPendente[] = []
  for (const l of linhas) {
    const ids = l.candidatoId
      ? await db
          .select({ idExterno: identidadesJogador.idExterno })
          .from(identidadesJogador)
          .where(
            and(
              eq(identidadesJogador.jogadorId, l.candidatoId),
              eq(identidadesJogador.provedor, l.provedor),
            ),
          )
      : []
    resultado.push({
      provedor: l.provedor,
      idExterno: l.idExterno,
      nomeExterno: l.nomeExterno,
      motivo: l.motivo,
      ocorrencias: l.ocorrencias,
      candidato: l.candidatoId
        ? {
            id: l.candidatoId,
            nome: l.candidatoNome ?? '',
            time: l.candidatoTime,
            idsExternos: ids.map((i) => i.idExterno),
          }
        : null,
    })
  }
  return resultado
}

async function pendente(db: Db, provedor: string, idExterno: string) {
  const [conflito] = await db
    .select()
    .from(conflitosIdentidadeJogador)
    .where(
      and(
        eq(conflitosIdentidadeJogador.provedor, provedor),
        eq(conflitosIdentidadeJogador.idExterno, idExterno),
        eq(conflitosIdentidadeJogador.estado, 'PENDENTE'),
      ),
    )
    .limit(1)
  if (!conflito) throw new Error(`nenhum conflito PENDENTE para ${provedor}:${idExterno}`)
  return conflito
}

/** É a mesma pessoa: o id novo passa a apontar para o jogador candidato. */
export async function vincularConflito(
  db: Db,
  provedor: string,
  idExterno: string,
  resolvidoPor: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const conflito = await pendente(tx, provedor, idExterno)
    const jogadorId = conflito.jogadorCandidatoId
    if (!jogadorId) {
      throw new Error(`${idExterno} tem nome ambíguo, sem candidato único — use separar`)
    }
    await tx.insert(identidadesJogador).values({ jogadorId, provedor, idExterno })
    await resolver(tx, conflito.id, jogadorId, resolvidoPor)
    return jogadorId
  })
}

/** É outra pessoa com o mesmo nome: nasce um jogador próprio para o id. */
export async function separarConflito(
  db: Db,
  provedor: string,
  idExterno: string,
  resolvidoPor: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const conflito = await pendente(tx, provedor, idExterno)
    const [novo] = await tx
      .insert(jogadores)
      .values({ nomeCompleto: conflito.nomeExterno })
      .returning({ id: jogadores.id })
    if (!novo) throw new Error('não foi possível criar o jogador')
    await tx.insert(identidadesJogador).values({ jogadorId: novo.id, provedor, idExterno })
    await resolver(tx, conflito.id, novo.id, resolvidoPor)
    return novo.id
  })
}

async function resolver(db: Db, conflitoId: string, jogadorId: string, resolvidoPor: string) {
  await db
    .update(conflitosIdentidadeJogador)
    .set({
      estado: 'RESOLVIDO',
      jogadorResolvidoId: jogadorId,
      resolvidoPor,
      resolvidoEm: new Date(),
    })
    .where(eq(conflitosIdentidadeJogador.id, conflitoId))
}
