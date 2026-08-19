import { and, eq, gte, sql } from 'drizzle-orm'
import { tentativasLogin } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

export type PoliticaRateLimit = {
  maxTentativas: number
  janelaMs: number
}

export const POLITICA_PADRAO: PoliticaRateLimit = {
  maxTentativas: 5,
  janelaMs: 15 * 60_000,
}

export async function registrarTentativa(
  db: Db,
  dados: { identificador: string; ip: string | null; sucesso: boolean; agora: Date },
): Promise<void> {
  await db.insert(tentativasLogin).values({
    identificador: dados.identificador.toLowerCase(),
    ip: dados.ip,
    sucesso: dados.sucesso,
    tentadoEm: dados.agora,
  })
}

/**
 * Bloqueia após N falhas na janela.
 *
 * Conta apenas FALHAS: login bem-sucedido não deve aproximar o usuário
 * legítimo de um bloqueio.
 */
export async function excedeuTentativas(
  db: Db,
  identificador: string,
  agora: Date,
  politica: PoliticaRateLimit = POLITICA_PADRAO,
): Promise<boolean> {
  const desde = new Date(agora.getTime() - politica.janelaMs)

  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(
      and(
        eq(tentativasLogin.identificador, identificador.toLowerCase()),
        eq(tentativasLogin.sucesso, false),
        gte(tentativasLogin.tentadoEm, desde),
      ),
    )

  return (linha?.total ?? 0) >= politica.maxTentativas
}
