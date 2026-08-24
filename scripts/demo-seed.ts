import { readFile } from 'node:fs/promises'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { semearDemo } from '../src/modules/ingestao/demo/semear'
import { carregarRuleset } from '../src/modules/motor/ruleset/carregar'

/**
 * Semeia a demonstração: fatos do documento do CJ + o motor real calculando.
 *
 *   npx dotenv -e .env.local -- npm run demo:seed
 *
 * Idempotente: pode rodar quantas vezes quiser. Para desfazer, demo:limpar.
 */
async function principal() {
  const ruleset = carregarRuleset(await readFile('config/ruleset.v1.yaml', 'utf8'))
  const resumo = await semearDemo(getDb(), ruleset, new Date())

  console.log('Demonstração semeada:')
  console.log(`  times ................. ${resumo.times}`)
  console.log(`  jogadores ............. ${resumo.jogadores}`)
  console.log(`  versão de níveis ...... ${resumo.versaoNiveis}`)
  console.log(`  jogos hoje ............ ${resumo.jogosHoje}`)
  console.log(`  itens na Lista Secreta  ${resumo.itensListaSecreta}`)
  console.log(`  apitos do Fire Live ... ${resumo.apitosFireLive}`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
