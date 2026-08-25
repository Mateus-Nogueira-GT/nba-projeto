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

  // UMA consulta, não duas. Eram dois SELECTs em sequência (o usuário, depois
  // o direito) e toda tela autenticada pagava os dois. Numa cadeia que
  // atravessa continente — função em iad1, banco em sa-east-1 — cada ida e
  // volta custa ~150ms (ADR-0008).
  //
  // O LEFT JOIN preserva a distinção que importa: sem LINHA é usuário
  // inexistente (sem-sessao, leva a /entrar); linha COM direito nulo é
  // usuário sem assinatura (sem-direito-ativo, leva a /assinar). Colapsar os
  // dois mandaria quem perdeu a sessão para a tela de pagamento.
  const [linha] = await db
    .select({
      status: usuarios.status,
      direitoId: direitosAcesso.id,
      fim: direitosAcesso.fim,
    })
    .from(usuarios)
    .leftJoin(
      direitosAcesso,
      and(
        eq(direitosAcesso.usuarioId, usuarios.id),
        eq(direitosAcesso.produto, produto),
        isNull(direitosAcesso.revogadoEm),
        lte(direitosAcesso.inicio, agora),
        or(isNull(direitosAcesso.fim), gt(direitosAcesso.fim, agora)),
      ),
    )
    .where(eq(usuarios.id, usuarioId))
    .limit(1)

  if (!linha) return { permitido: false, motivo: 'sem-sessao' }
  // A ORDEM é regra de negócio (Spec 04, princípio 4): bloqueio administrativo
  // prevalece sobre direito vigente. Com as duas informações chegando juntas,
  // quem responde primeiro passou a ser escolha explícita do código.
  if (linha.status === 'BLOQUEADO') {
    return { permitido: false, motivo: 'bloqueio-administrativo' }
  }

  return linha.direitoId
    ? { permitido: true, direitoId: linha.direitoId, validoAte: linha.fim }
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
