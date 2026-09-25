import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { exportarListaDoCj } from '../src/modules/ingestao/niveis/backup'

/**
 * Salva a lista do CJ (todas as versões de `niveis`) num JSON local, ANTES de
 * qualquer limpeza da demo — apagar os jogadores de demonstração leva a lista
 * junto, e o dado do CJ não pode se perder.
 *
 *   npx dotenv -e .env.local -- npm run lista-cj:backup
 *
 * A pasta `backups/` fica fora do git: o arquivo é do operador, não do código.
 */
function carimbo(agora: Date): string {
  // AAAA-MM-DDTHHMM, em UTC — sem ":" para o nome valer em qualquer sistema.
  return agora.toISOString().slice(0, 16).replace(':', '')
}

async function main() {
  const backup = await exportarListaDoCj(getDb())

  mkdirSync('backups', { recursive: true })
  const caminho = join('backups', `lista-cj-${carimbo(new Date(backup.geradoEm))}.json`)
  writeFileSync(caminho, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')

  console.log(`backup gravado em ${caminho}`)
  for (const v of backup.versoes) {
    console.log(`  ${v.versao}${v.ativa ? ' (ativa)' : ''}: ${v.niveis.length} linha(s)`)
  }
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : 'falha desconhecida no lista-cj:backup')
    process.exitCode = 1
  })
  .finally(() => fecharDb())
