import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { repararEmpates } from '../src/modules/ingestao/demo/reparo-empates'

/**
 * Repara os jogos encerrados que nasceram empatados na demo antiga, com a
 * mesma decisão que o gerador novo tomaria, e recomputa a classificação.
 *
 *   npx dotenv -e .env.local -- npm run demo:desempatar
 *
 * Idempotente: rodar de novo não encontra empate e não escreve nada.
 */
async function principal() {
  const db = getDb()
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const r = await repararEmpates(db, ruleset, { hoje })
  console.log(`Empates encontrados: ${r.encontrados} · reparados: ${r.reparados}`)
  console.log(
    `Classificação recomputada: ${r.classificacao.linhas} linhas · empates restantes: ${r.classificacao.empates}`,
  )
  if (r.classificacao.empates > 0) process.exitCode = 1
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
