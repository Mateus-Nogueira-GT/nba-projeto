import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { FONTE_IDENTIDADES_NBA } from '../src/modules/dominio/identidades-nba'
import { relatarIdentidades } from '../src/modules/dominio/relatorio-identidades'

/**
 * Relatório de reconciliação sem escrita, sem inferir split/fusão.
 * npx dotenv -e .env.local -- npx vite-node scripts/identidades-relatorio.ts
 * Passar UUIDs restringe o inventário; sem argumentos mostra só pendências.
 * A conexão precisa ter as migrations da versão atual aplicadas.
 */
async function principal() {
  const ids = process.argv.slice(2)
  if (
    ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  ) {
    throw new Error(
      'Informe somente UUIDs de jogadores, ou nenhum argumento para listar pendências.',
    )
  }
  const pendencias = await relatarIdentidades(getDb(), ids.length > 0 ? ids : undefined)
  console.log(
    JSON.stringify(
      { fonte: FONTE_IDENTIDADES_NBA, somenteLeitura: true, identidades: pendencias },
      null,
      2,
    ),
  )
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
