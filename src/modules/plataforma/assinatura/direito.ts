import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'

import { direitosAcesso, usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { PRODUTO_PAGO } from './configuracao'

export type ResultadoAcesso =
  | { permitido: true; direitoId: string; validoAte: Date | null }
  | {
      permitido: false
      motivo: 'sem-sessao' | 'bloqueio-administrativo' | 'sem-direito-ativo'
    }

export async function avaliarAcesso(
  db: Db,
  usuarioId: string | null,
  agora = new Date(),
  produto = PRODUTO_PAGO,
): Promise<ResultadoAcesso> {
  if (!usuarioId) return { permitido: false, motivo: 'sem-sessao' }

  const [usuario] = await db
    .select({ status: usuarios.status })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!usuario) return { permitido: false, motivo: 'sem-sessao' }
  if (usuario.status === 'BLOQUEADO') {
    return { permitido: false, motivo: 'bloqueio-administrativo' }
  }

  const [direito] = await db
    .select({ id: direitosAcesso.id, fim: direitosAcesso.fim })
    .from(direitosAcesso)
    .where(
      and(
        eq(direitosAcesso.usuarioId, usuarioId),
        eq(direitosAcesso.produto, produto),
        isNull(direitosAcesso.revogadoEm),
        lte(direitosAcesso.inicio, agora),
        or(isNull(direitosAcesso.fim), gt(direitosAcesso.fim, agora)),
      ),
    )
    .limit(1)

  return direito
    ? { permitido: true, direitoId: direito.id, validoAte: direito.fim }
    : { permitido: false, motivo: 'sem-direito-ativo' }
}

export async function concederCortesia(
  db: Db,
  entrada: { usuarioId: string; referencia: string; inicio: Date; fim: Date | null },
): Promise<string> {
  const [direito] = await db
    .insert(direitosAcesso)
    .values({
      usuarioId: entrada.usuarioId,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA_ADMIN',
      referenciaOrigem: entrada.referencia,
      inicio: entrada.inicio,
      fim: entrada.fim,
      atualizadoEm: entrada.inicio,
    })
    .onConflictDoUpdate({
      target: [direitosAcesso.origem, direitosAcesso.referenciaOrigem, direitosAcesso.produto],
      set: {
        usuarioId: entrada.usuarioId,
        inicio: entrada.inicio,
        fim: entrada.fim,
        revogadoEm: null,
        motivoRevogacao: null,
        atualizadoEm: entrada.inicio,
      },
    })
    .returning({ id: direitosAcesso.id })
  if (!direito) throw new Error('não foi possível conceder cortesia')
  return direito.id
}
