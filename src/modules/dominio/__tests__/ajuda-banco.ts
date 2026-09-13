import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'

const DIR = 'drizzle'

function arquivosSql(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
}

async function executar(pg: PGlite, sql: string) {
  for (const comando of sql.split('--> statement-breakpoint')) {
    const limpo = comando.trim()
    if (limpo.length > 0) await pg.exec(limpo)
  }
}

/**
 * Banco de teste em PGlite — Postgres 17 real, compilado para WASM.
 *
 * Não é mock: é o mesmo motor. `UNIQUE NULLS NOT DISTINCT` e índice único
 * parcial se comportam aqui exatamente como no Neon. As migrations aplicadas
 * são as MESMAS que vão para produção, sem tradução no meio.
 */
export async function bancoDeTeste() {
  const pg = new PGlite()
  const db = drizzle(pg, { schema })

  const subir = async () => {
    for (const sql of arquivosSql(DIR)) await executar(pg, sql)
  }
  const descer = async () => {
    // Ordem inversa da subida: a última migration desce primeiro.
    for (const sql of arquivosSql(join(DIR, 'down')).reverse()) await executar(pg, sql)
  }
  const contarTabelas = async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    return r.rows[0]?.n ?? 0
  }

  /**
   * FECHAR SÓ DEPOIS DO QUE ESTÁ EM VOO. Um teste que falha no meio de um
   * Promise.all deixa consultas pendentes; `pg.close()` nesse estado gira o
   * worker a 100% de CPU sem fim (diagnóstico de 13/09). O `select 1` entra
   * na fila do mesmo mutex do PGlite e só volta quando o que estava na frente
   * terminou — aí fechar é seguro.
   */
  const fechar = async () => {
    await pg.query('select 1').catch(() => undefined)
    await pg.close()
  }

  await subir()
  return { pg, db, subir, descer, contarTabelas, fechar }
}
