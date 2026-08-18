/**
 * Deriva a migration de DESCIDA a partir da de subida.
 *
 * Drizzle Kit não gera down migration. Escrever à mão convida a drift: alguém
 * adiciona tabela na subida e esquece da descida. Derivar elimina a classe
 * inteira de erro.
 *
 * REGRA: se aparecer um comando que este script não sabe inverter, ele FALHA.
 * Emitir descida incompleta em silêncio é pior do que não emitir nada.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'drizzle'
const DIR_DOWN = join(DIR, 'down')
mkdirSync(DIR_DOWN, { recursive: true })

/** Comandos cuja inversão é conhecida. Qualquer outro derruba o script. */
const INVERSORES = [
  {
    reconhece: /^CREATE TABLE(?: IF NOT EXISTS)? "([a-z_]+)"/i,
    inverte: (m) => `DROP TABLE IF EXISTS "${m[1]}" CASCADE;`,
  },
  {
    reconhece: /^CREATE TYPE "public"\."([a-z_]+)"/i,
    inverte: (m) => `DROP TYPE IF EXISTS "public"."${m[1]}" CASCADE;`,
  },
  {
    reconhece: /^ALTER TABLE "([a-z_]+)" ADD COLUMN "([a-z_]+)"/i,
    inverte: (m) => `ALTER TABLE "${m[1]}" DROP COLUMN IF EXISTS "${m[2]}";`,
  },
  // Índices e constraints caem junto com a tabela; nada a inverter.
  { reconhece: /^CREATE (UNIQUE )?INDEX/i, inverte: () => null },
  { reconhece: /^ALTER TABLE .* ADD CONSTRAINT/i, inverte: () => null },
  { reconhece: /^DO \$\$/i, inverte: () => null },
]

let falhou = false

for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(DIR, arquivo), 'utf8')
  const comandos = sql
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)

  const inversoes = []

  for (const comando of comandos) {
    const inversor = INVERSORES.find((i) => i.reconhece.test(comando))

    if (!inversor) {
      console.error(`ERRO em ${arquivo}: não sei inverter\n  ${comando.split('\n')[0]}`)
      falhou = true
      continue
    }

    const invertido = inversor.inverte(comando.match(inversor.reconhece))
    if (invertido) inversoes.push(invertido)
  }

  writeFileSync(
    join(DIR_DOWN, arquivo),
    [`-- DESCIDA de ${arquivo} — GERADO por scripts/gerar-down.mjs, não editar à mão.`, '', ...inversoes.reverse(), ''].join('\n'),
  )
  console.log(`${arquivo}: ${inversoes.length} comandos de descida`)
}

if (falhou) {
  console.error('\nDescida INCOMPLETA. Ensine o inversor ou escreva a descida à mão.')
  process.exit(1)
}
