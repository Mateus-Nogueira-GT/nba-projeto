import { sql } from 'drizzle-orm'

/**
 * Referência ao valor que o INSERT tentou gravar, dentro do `DO UPDATE`.
 *
 * Toda sincronização é um upsert pela chave natural — é isso que torna a
 * ingestão reexecutável, e reexecutar é o caminho normal: o cron roda de novo,
 * o Vercel reinvoca, o failover repete a chamada na outra fonte.
 *
 * `sql.raw` é seguro aqui porque o argumento nunca vem de fora: são nomes de
 * coluna escritos no próprio código.
 */
export function excluded(coluna: string) {
  return sql.raw(`excluded."${coluna}"`)
}
