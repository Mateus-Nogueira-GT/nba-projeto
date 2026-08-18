import { eq, ne } from 'drizzle-orm'
import { niveisVersao } from '../db/schema'
import type { Db } from '../db/tipos'

/**
 * Ativa uma versão da lista de níveis, desativando a anterior.
 *
 * Precisa ser transação: o índice único parcial `niveis_versao_unica_ativa`
 * rejeita duas linhas com ativa = true, então desativar e ativar têm que
 * acontecer juntos ou nenhum dos dois.
 *
 * A ordem importa — desativa ANTES de ativar, ou o índice barra no meio.
 */
export async function ativarVersaoNiveis(db: Db, versaoId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(niveisVersao)
      .set({ ativa: false })
      .where(ne(niveisVersao.id, versaoId))

    await tx.update(niveisVersao).set({ ativa: true }).where(eq(niveisVersao.id, versaoId))
  })
}

export async function versaoAtiva(db: Db) {
  const linhas = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  return linhas[0] ?? null
}
