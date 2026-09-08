import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { aplicarFotos } from '../src/modules/ingestao/demo/fotos'

/**
 * Grava `foto_url` para o mapa curado da demonstração — só para as URLs
 * que responderem 200 no CDN da NBA (ver src/modules/ingestao/demo/fotos.ts).
 *
 * Fica FORA do demo:seed de propósito: o seed é determinístico e roda sem
 * rede, inclusive sob PGlite nos testes. Este script toca rede.
 *
 *   npx dotenv -e .env.local -- npm run demo:fotos
 */
async function principal() {
  const resultado = await aplicarFotos(getDb(), async (url) => {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    await resposta.body?.cancel()
    return resposta.ok
  })

  console.log(`Fotos gravadas: ${resultado.gravadas}`)
  if (resultado.semId.length > 0) {
    console.log(`Sem foto de propósito (ambíguo na lista do CJ): ${resultado.semId.join(', ')}`)
  }
  if (resultado.puladas.length > 0) {
    console.log('Puladas (sem jogador correspondente ou falha ao verificar a URL):')
    for (const nome of resultado.puladas) console.log(`  - ${nome}`)
    // O lote terminou, mas a operação ainda tem pendências. Reexecutar só
    // atualiza foto_url; não semeia dados nem altera identidade ou estratégia.
    process.exitCode = 1
  }
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
