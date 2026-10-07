import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { calendarioDoRuleset } from '../src/modules/dominio/temporada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { recalcularRodadaDosJogos } from '../src/modules/ingestao/rodada/recalcular'

/**
 * CLI DO OPERADOR — refaz `jogos.data_referencia` pelo fuso do DIA do ruleset
 * (`rodada.fuso`, Nova York desde 07/10/2026). Dry-run por padrão; só grava
 * com `--confirmar`, e nunca grava se a chave única colidir.
 *
 *   npx dotenv -e <env> -- npm run jogos:recalcular-rodada
 *   npx dotenv -e <env> -- npm run jogos:recalcular-rodada -- --confirmar
 *
 * Depois de gravar, as tabelas retroativas ainda guardam a rodada antiga:
 * rodar `motor:retroativo --limpar-temporada` sobre a temporada inteira
 * (docs/runbooks/temporada-retroativa.md).
 */

const MOSTRAR = 20

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const ruleset = await rulesetAtivo()
  // O fuso do DIA, pela mesma fonte única que a ingestão e o motor usam.
  const { fuso } = calendarioDoRuleset(ruleset)
  console.log(`fuso do dia: ${fuso} · modo: ${confirmar ? 'CONFIRMAR (grava)' : 'dry-run (não grava)'}`)

  const db = getDb()
  try {
    const r = await recalcularRodadaDosJogos(db, { fuso, confirmar })
    console.log(
      `${r.total} jogo(s) ENCERRADO lido(s), ${r.mudancas.length} mudam de rodada ` +
        `(${r.naoEncerrados} agendado(s)/ao vivo ficam como estão)`,
    )
    if (r.horarioADefinir.length > 0) {
      console.log(
        `${r.horarioADefinir.length} jogo(s) às 00:00:00 UTC — horário possivelmente a definir, ` +
          'NÃO mudam (confira no provedor):',
      )
      for (const j of r.horarioADefinir.slice(0, MOSTRAR)) {
        console.log(`  ${j.jogoId} ${j.dataHoraUtc.toISOString()}: fica em ${j.dataReferencia}`)
      }
      if (r.horarioADefinir.length > MOSTRAR) console.log(`  … e mais ${r.horarioADefinir.length - MOSTRAR}`)
    }
    for (const m of r.mudancas.slice(0, MOSTRAR)) {
      console.log(`  ${m.jogoId} ${m.dataHoraUtc.toISOString()}: ${m.de} → ${m.para}`)
    }
    if (r.mudancas.length > MOSTRAR) console.log(`  … e mais ${r.mudancas.length - MOSTRAR}`)

    if (r.colisoes.length > 0) {
      console.error(`ABORTADO: ${r.colisoes.length} colisão(ões) na chave (data_referencia, casa, visitante). Nada foi gravado.`)
      for (const c of r.colisoes) {
        console.error(`  ${c.dataReferencia} casa=${c.timeCasaId} visitante=${c.timeVisitanteId}: jogos ${c.jogoIds.join(', ')}`)
      }
      process.exitCode = 1
      return
    }
    if (confirmar) console.log(r.gravou ? `gravado: ${r.mudancas.length} jogo(s)` : 'nada a gravar')
    else if (r.mudancas.length > 0) console.log('dry-run: rode de novo com --confirmar para gravar')
  } finally {
    await fecharDb()
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : 'falha desconhecida no jogos:recalcular-rodada')
  for (let causa = erro instanceof Error ? erro.cause : null; causa instanceof Error; causa = causa.cause) {
    console.error(`causa: ${causa.message.split('\n')[0]}`)
  }
  process.exitCode = 1
})
