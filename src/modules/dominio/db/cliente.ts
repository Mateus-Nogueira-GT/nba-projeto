import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
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
  return drizzle(neon(url), { schema })
}

let _db: ReturnType<typeof criarDb> | null = null

export function getDb() {
  if (!_db) _db = criarDb()
  return _db
}

export { schema }
