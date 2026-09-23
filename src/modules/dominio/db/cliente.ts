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
  const pool = criarPool(url)
  return { db: drizzle({ client: pool, schema }), pool }
}

/**
 * O POOL É POR INSTÂNCIA, E A INSTÂNCIA É COMPARTILHADA.
 *
 * No Fluid Compute dezenas de requisições dividem a mesma instância, e cada
 * uma dispara de 4 a 9 consultas em paralelo. Com 2 conexões, uma lentidão do
 * Neon virava fila de 10 s e depois 500 em massa (auditoria de 23/09). A URL
 * é a do pooler do Neon (PgBouncer, modo transação): conexão de cliente é
 * barata lá, o custo no Postgres é por consulta. `DB_POOL_MAX` existe para
 * ajustar no dia sem deploy de código.
 */
export function opcoesDoPool(ambiente: Readonly<Record<string, string | undefined>>) {
  const bruto = Number(ambiente.DB_POOL_MAX)
  const max = Number.isInteger(bruto) && bruto > 0 ? bruto : 5
  return { max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 }
}

export function criarPool(
  url: string,
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): Pool {
  const pool = new Pool({ connectionString: url, ...opcoesDoPool(ambiente) })
  // O driver emite `error` quando uma conexão OCIOSA cai (restart do compute,
  // rede). Sem ouvinte, o EventEmitter lança e derruba a instância inteira —
  // junto com as requisições em andamento nela. O README do pacote manda ter.
  pool.on('error', (erro: Error) => {
    console.error(JSON.stringify({ evento: 'pool_erro', mensagem: erro.message }))
  })
  return pool
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
