import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { limparDemo } from '../src/modules/ingestao/demo/semear'

/**
 * Desfaz a demonstração. Apaga SOMENTE dado de domínio — contas, sessões,
 * assinaturas e inscrições de push ficam intactas.
 *
 *   npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar
 */
async function principal() {
  if (!process.argv.includes('--confirmar')) {
    console.log('Isto APAGARIA todo o dado de domínio (times, jogadores, jogos,')
    console.log('médias, níveis, apitos e feeds). Contas e assinaturas ficam.')
    console.log('Para executar de verdade, repita com --confirmar')
    process.exitCode = 1
    return
  }

  const contagens = await limparDemo(getDb())
  console.log('Demonstração removida:')
  for (const [tabela, quantidade] of Object.entries(contagens)) {
    if (quantidade > 0) console.log(`  ${tabela.padEnd(22, '.')} ${quantidade}`)
  }
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
