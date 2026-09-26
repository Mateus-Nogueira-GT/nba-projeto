import { and, gte, lte, sql } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { jogos } from '../src/modules/dominio/db/schema'
import { calendarioDoRuleset } from '../src/modules/dominio/temporada'
import { dataCalendarioValida } from '../src/modules/entrega/retroativo/data'
import {
  executarTemporadaRetroativa,
  temporadaDoIntervalo,
} from '../src/modules/entrega/retroativo/executar'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'

/**
 * CLI DO OPERADOR — roda o motor de sempre sobre um intervalo de datas de uma
 * TEMPORADA QUE JÁ ACABOU. Nunca a do calendário: essa é publicada pelo job
 * diário, ao vivo, com push — rodar o retroativo por cima duplicaria trabalho
 * e arrisca confundir "resultado histórico" com "resultado publicado".
 *
 *   npx dotenv -e .env.local -- npm run motor:retroativo -- --de=2025-11-01 --ate=2025-11-07
 *   npx dotenv -e .env.local -- npm run motor:retroativo -- --de=2025-11-01 --ate=2025-11-07 --dry-run
 */

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

function validarData(valor: string | null, nome: string): string {
  // Round-trip, não `Date.parse`: 30/02, 31/04 e 29/02 fora de ano bissexto
  // rolam para o mês seguinte em vez de virar NaN — `dataCalendarioValida`
  // é o que recusa data inexistente de verdade.
  if (!valor || !dataCalendarioValida(valor)) {
    throw new Error(`--${nome}=YYYY-MM-DD é obrigatório`)
  }
  return valor
}

async function main() {
  const de = validarData(argumento('de'), 'de')
  const ate = validarData(argumento('ate'), 'ate')
  if (de > ate) throw new Error('--de não pode ser posterior a --ate')
  const dryRun = process.argv.includes('--dry-run')

  const ruleset = await rulesetAtivo()
  const calendario = calendarioDoRuleset(ruleset)

  // O intervalo INTEIRO numa temporada só, e anterior à do calendário — a
  // temporada do calendário é publicada pelo job diário, ao vivo. Recusado
  // aqui, antes de abrir o banco; o executor confere de novo, dia a dia.
  const agora = new Date()
  const temporada = temporadaDoIntervalo(de, ate, calendario, agora)
  console.log(`temporada ${temporada}: ${de}..${ate}`)

  const db = getDb()

  try {
    if (dryRun) {
      const [linha] = await db
        .select({
          datas: sql<number>`count(distinct ${jogos.dataReferencia})::int`,
          jogosEncerrados: sql<number>`count(*) filter (where ${jogos.status} = 'ENCERRADO')::int`,
        })
        .from(jogos)
        .where(and(gte(jogos.dataReferencia, de), lte(jogos.dataReferencia, ate)))
      console.log(
        `dry-run ${de}..${ate}: ${linha?.datas ?? 0} data(s) com jogo, ` +
          `${linha?.jogosEncerrados ?? 0} jogo(s) ENCERRADO`,
      )
      return
    }

    const total = await executarTemporadaRetroativa(db, ruleset, {
      de,
      ate,
      agora,
      aoConcluirDia: (data, resultado) => {
        console.log(
          `  ${data}: ${resultado.jogos} jogo(s), ${resultado.apitos} apito(s), ` +
            `${resultado.greens} green(s)`,
        )
      },
    })
    console.log(
      `total ${de}..${ate}: ${total.jogos} jogo(s), ${total.apitos} apito(s), ${total.greens} green(s)`,
    )
  } finally {
    await fecharDb()
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : 'falha desconhecida no motor:retroativo')
  process.exitCode = 1
})
