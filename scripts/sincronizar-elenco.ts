import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { contextoDoJob } from '../src/modules/ingestao/jobs/contexto'
import { executarJobComLease } from '../src/modules/ingestao/jobs/execucao'
import { dataReferenciaNba, executarJobElenco } from '../src/modules/ingestao/jobs/orquestradores'
import { montarFontes } from '../src/modules/ingestao/sincronizar/fonte'

/**
 * O mesmo job do cron `/api/cron/sincronizar-elenco` (times + elenco ativo +
 * identidades de jogo do dia), disparado da linha de comando.
 *
 *   npx dotenv -e .env.local -- npm run ingestao:elenco
 *
 * Existe por dois motivos: no Hobby esse cron não roda sozinho, e o backfill
 * NÃO cria times — depois de `demo:limpar` a tabela fica vazia e todo jogo é
 * ignorado até isto rodar (runbook da temporada retroativa, 06/10/2026).
 */
async function principal() {
  const contexto = await contextoDoJob()
  const dataReferencia = dataReferenciaNba(contexto.agora, contexto.ruleset.rodada.fuso)
  const db = getDb()
  const fontes = montarFontes(db, contexto.config)
  const resultado = await executarJobComLease(
    db,
    {
      job: 'sincronizar-elenco',
      janelaInicio: dataReferencia,
      janelaFim: dataReferencia,
      temporada: contexto.temporada,
      origem: 'CLI',
      leaseMs: 240_000,
    },
    async ({ confirmarLease }) => {
      await confirmarLease()
      return executarJobElenco(db, fontes, dataReferencia, contexto.agora)
    },
  )
  console.info(JSON.stringify({ dataReferencia, resultado }))
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : 'falha desconhecida no elenco')
    process.exitCode = 1
  })
  .finally(() => fecharDb())
