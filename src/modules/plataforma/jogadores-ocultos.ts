import { and, eq } from 'drizzle-orm'

import { jogadoresOcultos } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'

/**
 * Exclusão de jogadores no Fire Live — preferência por CONTA.
 *
 * O snapshot do feed é materializado por EVENTO (uma vez por publicação,
 * nunca por usuário); a preferência entra como recorte de LEITURA puro na
 * tela. Motor e materialização não sabem que isto existe.
 */

/** Idempotente: ocultar quem já está oculto não é erro. */
export async function ocultarJogador(db: Db, usuarioId: string, jogadorId: string): Promise<void> {
  await db.insert(jogadoresOcultos).values({ usuarioId, jogadorId }).onConflictDoNothing()
}

export async function exibirJogador(db: Db, usuarioId: string, jogadorId: string): Promise<void> {
  await db
    .delete(jogadoresOcultos)
    .where(and(eq(jogadoresOcultos.usuarioId, usuarioId), eq(jogadoresOcultos.jogadorId, jogadorId)))
}

export async function jogadoresOcultosDe(db: Db, usuarioId: string): Promise<Set<string>> {
  const linhas = await db
    .select({ jogadorId: jogadoresOcultos.jogadorId })
    .from(jogadoresOcultos)
    .where(eq(jogadoresOcultos.usuarioId, usuarioId))
  return new Set(linhas.map((l) => l.jogadorId))
}

/** Recorte de leitura PURO — a tela filtra, o feed não muda. */
export function filtrarOcultos<T extends { jogadorId: string }>(
  itens: T[],
  ocultos: Set<string>,
): T[] {
  if (ocultos.size === 0) return itens
  return itens.filter((i) => !ocultos.has(i.jogadorId))
}
