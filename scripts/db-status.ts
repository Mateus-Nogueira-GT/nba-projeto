import { readFileSync } from 'node:fs'

import { sql } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { migracoesPendentes } from '../src/modules/dominio/db/migracoes-pendentes'

/**
 * Diz se o BANCO está no schema que este CÓDIGO espera.
 *
 * Existe por causa do incidente de 25/08/2026: o deploy pelo Git subiu código
 * pedindo `jogadores_ocultos` a um banco sem a tabela, e a tela do Fire Live
 * respondeu 500 ao assinante. Rodar isto antes de mesclar na main (e depois
 * de mesclar) é o que separa "deploy verde" de "produto no ar".
 *
 * Somente leitura. Sai com código 1 quando há pendência — serve em CI.
 *
 *   npx dotenv -e .env.local -- npm run db:status
 */
async function principal() {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: { tag: string }[]
  }
  const tags = journal.entries.map((e) => e.tag)

  const resposta = await getDb().execute(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  )
  const linhas = (
    Array.isArray(resposta) ? resposta : ((resposta as { rows?: unknown[] }).rows ?? [])
  ) as { n: number }[]
  const aplicadas = Number(linhas[0]?.n ?? 0)

  const { pendentes, bancoAdiantado } = migracoesPendentes(tags, aplicadas)

  console.log(`migrações no código: ${tags.length}`)
  console.log(`aplicadas no banco:  ${aplicadas}`)

  if (bancoAdiantado) {
    console.log('\n⚠ O BANCO ESTÁ À FRENTE DO CÓDIGO.')
    console.log('  Deploy revertido? O schema tem migração que este código não conhece.')
    process.exitCode = 1
    return
  }

  if (pendentes.length === 0) {
    console.log('\n✓ Banco em dia com o código.')
    return
  }

  console.log(`\n⚠ ${pendentes.length} MIGRAÇÃO(ÕES) PENDENTE(S):`)
  for (const tag of pendentes) console.log(`    ${tag}`)
  console.log('\n  O deploy da Vercel NÃO roda migração — `next build` só compila.')
  console.log('  Rode:  npm run db:migrate')
  process.exitCode = 1
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
