import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../../dominio/db/tipos'
import {
  atributosSilenciados,
  jogadores,
  jogadoresAcompanhados,
  jogadoresOcultos,
  jogadoresSilenciados,
  preferenciasUsuario,
  times,
  timesAcompanhados,
} from '../../dominio/db/schema'
import { preferenciasPushDoUsuario } from '../push/inscricoes'
import {
  estadoExperienciaPadrao,
  schemaAcompanhamento,
  schemaExclusaoAlerta,
  schemaPreferenciasExperiencia,
  type EstadoExperiencia,
} from './contrato'

export class AlvoExperienciaNaoEncontradoError extends Error {
  constructor() {
    super('jogador ou time não encontrado')
    this.name = 'AlvoExperienciaNaoEncontradoError'
  }
}

export async function estadoExperienciaDoUsuario(
  db: Db,
  usuarioId: string,
): Promise<EstadoExperiencia> {
  const [preferencias, acompanhados, favoritos, jogadoresSemAlerta, atributosSemAlerta, canais] =
    await Promise.all([
      db
        .select({
          intensidade: preferenciasUsuario.intensidade,
          somHabilitado: preferenciasUsuario.somHabilitado,
          volume: preferenciasUsuario.volume,
          apenasAcompanhados: preferenciasUsuario.apenasAcompanhados,
        })
        .from(preferenciasUsuario)
        .where(eq(preferenciasUsuario.usuarioId, usuarioId))
        .limit(1),
      db
        .select({ id: jogadoresAcompanhados.jogadorId })
        .from(jogadoresAcompanhados)
        .where(eq(jogadoresAcompanhados.usuarioId, usuarioId))
        .orderBy(jogadoresAcompanhados.jogadorId),
      db
        .select({ id: timesAcompanhados.timeId })
        .from(timesAcompanhados)
        .where(eq(timesAcompanhados.usuarioId, usuarioId))
        .orderBy(timesAcompanhados.timeId),
      db
        .select({ id: jogadoresSilenciados.jogadorId })
        .from(jogadoresSilenciados)
        .where(eq(jogadoresSilenciados.usuarioId, usuarioId))
        .orderBy(jogadoresSilenciados.jogadorId),
      db
        .select({ atributo: atributosSilenciados.atributo })
        .from(atributosSilenciados)
        .where(eq(atributosSilenciados.usuarioId, usuarioId))
        .orderBy(atributosSilenciados.atributo),
      preferenciasPushDoUsuario(db, usuarioId),
    ])
  const estado = estadoExperienciaPadrao()
  const validas = schemaPreferenciasExperiencia.safeParse(preferencias[0])
  if (validas.success) Object.assign(estado.preferencias, validas.data)
  return {
    ...estado,
    jogadoresAcompanhados: acompanhados.map((item) => item.id),
    timesAcompanhados: favoritos.map((item) => item.id),
    jogadoresSilenciados: jogadoresSemAlerta.map((item) => item.id),
    atributosSilenciados: atributosSemAlerta.map((item) => item.atributo),
    canais,
  }
}

export async function gravarPreferenciasExperiencia(
  db: Db,
  usuarioId: string,
  parcial: z.infer<typeof schemaPreferenciasExperiencia>,
): Promise<void> {
  const validas = schemaPreferenciasExperiencia.parse(parcial)
  const mudancas = { ...validas, atualizadoEm: new Date() }
  await db
    .insert(preferenciasUsuario)
    .values({ usuarioId, ...mudancas })
    .onConflictDoUpdate({
      target: preferenciasUsuario.usuarioId,
      set: mudancas,
    })
}

export async function definirAcompanhamento(
  db: Db,
  usuarioId: string,
  entrada: z.infer<typeof schemaAcompanhamento>,
): Promise<void> {
  const { tipo, id, acompanhar } = schemaAcompanhamento.parse(entrada)
  await db.transaction(async (tx) => {
    if (tipo === 'JOGADOR') {
      const [existe] = await tx
        .select({ id: jogadores.id })
        .from(jogadores)
        .where(eq(jogadores.id, id))
        .limit(1)
      if (!existe) throw new AlvoExperienciaNaoEncontradoError()
      if (acompanhar) {
        await tx
          .insert(jogadoresAcompanhados)
          .values({ usuarioId, jogadorId: id })
          .onConflictDoNothing()
        await tx
          .delete(jogadoresOcultos)
          .where(and(eq(jogadoresOcultos.usuarioId, usuarioId), eq(jogadoresOcultos.jogadorId, id)))
      } else {
        await tx
          .delete(jogadoresAcompanhados)
          .where(
            and(
              eq(jogadoresAcompanhados.usuarioId, usuarioId),
              eq(jogadoresAcompanhados.jogadorId, id),
            ),
          )
      }
    } else {
      const [existe] = await tx
        .select({ id: times.id })
        .from(times)
        .where(eq(times.id, id))
        .limit(1)
      if (!existe) throw new AlvoExperienciaNaoEncontradoError()
      if (acompanhar) {
        await tx.insert(timesAcompanhados).values({ usuarioId, timeId: id }).onConflictDoNothing()
      } else {
        await tx
          .delete(timesAcompanhados)
          .where(and(eq(timesAcompanhados.usuarioId, usuarioId), eq(timesAcompanhados.timeId, id)))
      }
    }
  })
}

export async function definirExclusaoAlerta(
  db: Db,
  usuarioId: string,
  entrada: z.infer<typeof schemaExclusaoAlerta>,
): Promise<void> {
  const valida = schemaExclusaoAlerta.parse(entrada)
  if (valida.tipo === 'ATRIBUTO') {
    if (valida.silenciado) {
      await db
        .insert(atributosSilenciados)
        .values({ usuarioId, atributo: valida.id })
        .onConflictDoNothing()
    } else {
      await db
        .delete(atributosSilenciados)
        .where(
          and(
            eq(atributosSilenciados.usuarioId, usuarioId),
            eq(atributosSilenciados.atributo, valida.id),
          ),
        )
    }
    return
  }
  const [existe] = await db
    .select({ id: jogadores.id })
    .from(jogadores)
    .where(eq(jogadores.id, valida.id))
    .limit(1)
  if (!existe) throw new AlvoExperienciaNaoEncontradoError()
  if (valida.silenciado) {
    await db
      .insert(jogadoresSilenciados)
      .values({ usuarioId, jogadorId: valida.id })
      .onConflictDoNothing()
  } else {
    await db
      .delete(jogadoresSilenciados)
      .where(
        and(
          eq(jogadoresSilenciados.usuarioId, usuarioId),
          eq(jogadoresSilenciados.jogadorId, valida.id),
        ),
      )
  }
}
