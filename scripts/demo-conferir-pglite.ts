import { bancoDeTeste } from '../src/modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { publicarListaSecreta } from '../src/modules/entrega/lista-secreta'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { aplicarFotos } from '../src/modules/ingestao/demo/fotos'
import { simularAte } from '../src/modules/ingestao/demo/temporada'
import { LLMFake } from '../src/modules/ingestao/llm'

/**
 * `npm run demo:conferir -- --pglite`: o mesmo portão da apresentação sobre
 * sete semanas determinísticas. Não carrega .env, não usa getDb/Neon e não
 * consulta LLM/CDN. A data fixa evita cortar o histórico no início da temporada.
 */
export async function prepararDemoPglite() {
  const agora = new Date('2026-01-15T18:00:00.000Z')
  const ruleset = await rulesetAtivo()
  const banco = await bancoDeTeste()
  try {
    console.log('PGlite em memória · migrations reais · 49 dias · sem serviços externos')
    const llm = new LLMFake()
    const resumo = await simularAte(banco.db, ruleset, agora, {
      diasDeHistorico: 49,
      llm,
      aoProduzirDia: (dia, indice, total) => {
        if (indice % 7 === 0 || indice === total - 1)
          console.log(`  temporada: ${indice + 1}/${total} · ${dia}`)
      },
    })
    if (resumo.diasRestantes > 0) throw new Error('A temporada PGlite ficou incompleta.')

    // Valida o caminho cadastro → snapshot → card com o mapa curado. O aceite
    // local só monta a fixture; disponibilidade e identidade no CDN são o
    // escopo separado de demo:fotos, nunca uma conclusão deste arnês offline.
    const fotos = await aplicarFotos(banco.db, async () => true)
    console.log(`  fotos: ${fotos.gravadas} URLs do mapa curado (CDN não consultado)`)
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: dataDeReferencia(agora, ruleset.rodada.fuso),
      agora,
      ignorarAntecedencia: true,
      llm,
    })
    return { db: banco.db, ruleset, agora, fechar: banco.fechar }
  } catch (erro) {
    await banco.fechar()
    throw erro
  }
}
