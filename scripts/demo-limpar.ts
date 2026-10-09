import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import {
  contarDadoParaLimpar,
  linhaDeRecusa,
  podeRodarScriptDaDemo,
} from '../src/modules/ingestao/demo/guarda-scripts'
import { limparDemo } from '../src/modules/ingestao/demo/semear'

/**
 * Desfaz a demonstração. Apaga SOMENTE dado de domínio — contas, sessões,
 * assinaturas e inscrições de push ficam intactas.
 *
 *   npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar
 *
 * Em banco com dado REAL (checkpoint de ingestão, ou a ingestão real ligada)
 * a mesma guarda do cron recusa (pente fino de 09/10, achado 5): um
 * `--confirmar` de rotina com `.env.local` apontando para produção apagava a
 * temporada 2025-26 real. Para apagar mesmo assim, a flag tem outro nome de
 * propósito — não sai por hábito:
 *
 *   npm run demo:limpar -- --confirmar --apagar-dado-real
 *
 * As contagens do que vai sumir saem ANTES, em qualquer caso.
 */
async function principal() {
  const db = getDb()
  const apagarDadoReal = process.argv.includes('--apagar-dado-real')

  console.log('O que a limpeza levaria (amostra das tabelas de domínio):')
  for (const [tabela, quantidade] of Object.entries(await contarDadoParaLimpar(db))) {
    console.log(`  ${tabela.padEnd(22, '.')} ${quantidade}`)
  }
  console.log('')

  const decisao = await podeRodarScriptDaDemo(db, process.env, {
    script: 'limpar',
    apagarDadoReal,
  })
  if (!decisao.pode) {
    console.error(linhaDeRecusa(decisao.motivo))
    console.error('Recusado: este banco tem dado REAL (ou a ingestão real está ligada).')
    console.error('Se é isso mesmo que se quer, repita com --confirmar --apagar-dado-real')
    process.exitCode = 1
    return
  }

  if (!process.argv.includes('--confirmar')) {
    console.log('Isto APAGARIA todo o dado de domínio (times, jogadores, jogos,')
    console.log('médias, níveis, apitos e feeds). Contas e assinaturas ficam.')
    console.log('Para executar de verdade, repita com --confirmar')
    process.exitCode = 1
    return
  }

  const contagens = await limparDemo(db)
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
