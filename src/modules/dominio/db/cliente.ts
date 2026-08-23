import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

/**
 * Cliente de banco — inicialização preguiçosa.
 *
 * O Next avalia código de topo de módulo em build time; chamar neon() ali
 * quebraria `next build` antes de DATABASE_URL existir. Por isso getDb().
 *
 * Sem Proxy de propósito: wrappers de Proxy quebram bibliotecas que inspecionam
 * o objeto do adapter.
 */
function criarDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL ausente. Rode `vercel env pull` — as credenciais nunca ficam no código.',
    )
  }
  // O driver HTTP do Neon não oferece transações interativas. Sessões,
  // bootstrap e webhook dependem de lock + múltiplas escritas atômicas, então
  // usam uma conexão WebSocket compatível com `node-postgres`.
  neonConfig.webSocketConstructor = ws
  const pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
  return { db: drizzle({ client: pool, schema }), pool }
}

let _db: ReturnType<typeof criarDb> | null = null

export function getDb() {
  if (!_db) _db = criarDb()
  return _db.db
}

/** Fecha conexões em comandos one-shot, como o bootstrap administrativo. */
export async function fecharDb(): Promise<void> {
  const atual = _db
  _db = null
  await atual?.pool.end()
}

export { schema }
