/**
 * Deriva a migration de DESCIDA a partir da de subida.
 *
 * Drizzle Kit não gera down migration. Escrever à mão convida a drift: alguém
 * adiciona tabela na subida e esquece da descida. Derivar elimina a classe
 * inteira de erro.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'drizzle'
const DIR_DOWN = join(DIR, 'down')
mkdirSync(DIR_DOWN, { recursive: true })

const migrations = readdirSync(DIR).filter((f) => f.endsWith('.sql'))

for (const arquivo of migrations) {
  const sql = readFileSync(join(DIR, arquivo), 'utf8')

  const tabelas = [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([a-z_]+)"/g)].map((m) => m[1])
  const tipos = [...sql.matchAll(/CREATE TYPE "public"\."([a-z_]+)"/g)].map((m) => m[1])

  const linhas = [
    `-- DESCIDA de ${arquivo} — GERADO por scripts/gerar-down.mjs, não editar à mão.`,
    '',
    ...tabelas.reverse().map((t) => `DROP TABLE IF EXISTS "${t}" CASCADE;`),
    '',
    ...tipos.reverse().map((t) => `DROP TYPE IF EXISTS "public"."${t}" CASCADE;`),
    '',
  ]

  writeFileSync(join(DIR_DOWN, arquivo), linhas.join('\n'))
  console.log(`${arquivo}: ${tabelas.length} tabelas, ${tipos.length} tipos`)
}
