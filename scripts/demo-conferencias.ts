import { eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { times } from '../src/modules/dominio/db/schema'
import { conferenciaDe } from '../src/modules/dominio/conferencias'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { semearClassificacao } from '../src/modules/ingestao/demo/jogos'

/**
 * Preenche `times.conferencia` num banco já semeado e RECOMPUTA a
 * classificação, que passa a numerar posição por conferência (é assim que a
 * NBA classifica, e é o único recorte em que playoff/play-in significa algo).
 *
 *   npx dotenv -e .env.local -- npm run demo:conferencias
 *
 * Idempotente: reexecutar dá o mesmo resultado.
 */
async function principal() {
  const db = getDb()
  const lista = await db.select({ id: times.id, sigla: times.sigla }).from(times)
  let gravadas = 0
  const semConferencia: string[] = []
  for (const t of lista) {
    const conferencia = conferenciaDe(t.sigla)
    if (conferencia === null) {
      semConferencia.push(t.sigla)
      continue
    }
    await db.update(times).set({ conferencia }).where(eq(times.id, t.id))
    gravadas += 1
  }
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const linhas = await semearClassificacao(db, ruleset, hoje)
  console.log(`Conferência gravada em ${gravadas} de ${lista.length} times.`)
  if (semConferencia.length > 0)
    console.log(`Sem conferência (sigla fora da NBA): ${semConferencia.join(', ')}`)
  console.log(`Classificação recomputada: ${linhas} linhas, posição por conferência.`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
