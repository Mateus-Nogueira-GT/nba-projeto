import { readFile } from 'node:fs/promises'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { semearDemo } from '../src/modules/ingestao/demo/semear'
import { portaLLMDoAmbiente } from '../src/modules/ingestao/llm'
import { carregarRuleset } from '../src/modules/motor/ruleset/carregar'

/**
 * Semeia a demonstração: fatos do documento do CJ + o motor real calculando.
 *
 *   npx dotenv -e .env.local -- npm run demo:seed
 *
 * Idempotente: pode rodar quantas vezes quiser. Para desfazer, demo:limpar.
 *
 * A porta de LLM entra aqui pelo mesmo motivo que entra no cron da demo: quem
 * grava o snapshot PRIMEIRO fixa o hash, e a narrativa só é gerada na
 * transição de hash. Semeando sem ela, os três snapshots nascem sem narrativa,
 * o cron da lista que rodar depois encontra o mesmo hash, conclui "não mudou"
 * e nunca gera — o dia inteiro da demonstração fica sem texto. E este script é
 * justamente o que o operador roda à mão antes de uma apresentação.
 */
async function principal() {
  const ruleset = carregarRuleset(await readFile('config/ruleset.v1.yaml', 'utf8'))
  const resumo = await semearDemo(getDb(), ruleset, new Date(), portaLLMDoAmbiente())

  console.log('Demonstração semeada:')
  console.log(`  times ................. ${resumo.times}`)
  console.log(`  jogadores ............. ${resumo.jogadores}`)
  console.log(`  versão de níveis ...... ${resumo.versaoNiveis}`)
  console.log(`  jogos hoje ............ ${resumo.jogosHoje}`)
  console.log(`  itens na Lista Secreta  ${resumo.itensListaSecreta}`)
  console.log(`  apitos do Fire Live ... ${resumo.apitosFireLive}`)
  console.log(`  linhas com odd ........ ${resumo.linhasComOdd}`)
  console.log(`  rodadas conferíveis ... ${resumo.rodadasPublicadas}`)
  console.log(`  placares derivados .. ${resumo.placares}`)
  console.log(`  times classificados . ${resumo.classificados}`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
