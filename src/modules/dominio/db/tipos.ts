import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

/**
 * Tipo comum a qualquer driver Postgres do Drizzle.
 *
 * Em produção é Neon; nos testes é PGlite — o MESMO motor Postgres compilado
 * para WASM, não um mock. Constraint que passa num passa no outro.
 *
 * Usa a classe base em vez de uma UNIÃO dos dois drivers de propósito: união
 * quebra a resolução de sobrecarga de `.returning()` e `.transaction()`.
 */
export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>
