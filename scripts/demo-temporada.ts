import { readFile } from 'node:fs/promises'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { simularAte } from '../src/modules/ingestao/demo/temporada'
import { portaLLMDoAmbiente } from '../src/modules/ingestao/llm'
import { carregarRuleset } from '../src/modules/motor/ruleset/carregar'

/**
 * A CARGA DA TEMPORADA SIMULADA — sete semanas até hoje, à mão.
 *
 *   npx dotenv -e .env.local -- npm run demo:temporada
 *
 * É daqui que a temporada nasce, e não do cron. `simularAte` só abre a rodada
 * de HOJE quando todos os dias pendentes da janela já foram produzidos, e o
 * cron corta o trabalho no orçamento de 240 s — num banco vazio ele levaria
 * DIAS de execuções diárias até a primeira rodada aparecer. Aqui não há
 * orçamento: a janela inteira sai numa passada.
 *
 * Idempotente e resumível: interrompida no meio, a execução seguinte continua
 * do último dia completo. Para desfazer, `demo:limpar -- --confirmar`.
 *
 * A porta de LLM entra aqui pelo mesmo motivo que entra no cron: quem grava o
 * snapshot PRIMEIRO fixa o hash, e a narrativa só é gerada na transição de
 * hash. Semeando sem ela, o snapshot de hoje nasce sem narrativa, o cron da
 * lista que rodar depois encontra o mesmo hash, conclui "não mudou" e nunca
 * gera — o dia da demonstração fica sem texto. E este script é justamente o
 * que o operador roda à mão antes de uma apresentação. Sem
 * `OPENROUTER_API_KEY` a porta cai no fake determinístico, que é o que a demo
 * quer quando não há chave.
 */

const rotulo = (texto: string, largura = 30) => `    ${texto} `.padEnd(largura, '.')

async function principal() {
  const ruleset = carregarRuleset(await readFile('config/ruleset.v1.yaml', 'utf8'))
  const comecou = Date.now()

  console.log('Produzindo a temporada simulada. Cada dia é agendado, tem a Lista')
  console.log('Secreta publicada com o que se sabia na véspera e só então é jogado.\n')

  const resumo = await simularAte(getDb(), ruleset, new Date(), {
    llm: portaLLMDoAmbiente(),
    // Quarenta e nove dias em silêncio parecem travamento. O progresso sai
    // antes de cada dia, não depois: é como se vê ONDE parou se parar.
    aoProduzirDia: (dia, indice, total) =>
      console.log(`  dia ${String(indice + 1).padStart(3)}/${total} · ${dia}`),
  })

  const segundos = ((Date.now() - comecou) / 1000).toFixed(1)
  const completa = resumo.diasRestantes === 0

  console.log(`\nTemporada simulada · janela ${resumo.inicio} → ${resumo.hoje} · ${segundos}s\n`)

  console.log('  produzido NESTA execução')
  const faltando = resumo.diasRestantes > 0 ? ` (faltam ${resumo.diasRestantes})` : ''
  console.log(`${rotulo('dias')} ${resumo.diasProduzidos}${faltando}`)
  console.log(`${rotulo('jogos')} ${resumo.jogosCriados}`)
  console.log(`${rotulo('box scores')} ${resumo.boxScores}`)
  console.log(`${rotulo('listas publicadas')} ${resumo.publicacoes}`)

  // Os números de hoje são ESTADO, não novidade: rodar de novo no mesmo dia
  // repete os mesmos, porque a rodada continua sendo a mesma rodada.
  if (completa) {
    console.log(`\n  rodada de hoje (${resumo.hoje}), estado atual`)
    console.log(`${rotulo('jogos')} ${resumo.jogosHoje}`)
    console.log(`${rotulo('itens na Lista Secreta')} ${resumo.itensListaSecreta}`)
    console.log(`${rotulo('apitos do Fire Live')} ${resumo.apitosFireLive}`)
    console.log(`${rotulo('linhas com odd')} ${resumo.linhasComOdd}`)
  } else {
    console.log(`\n  rodada de hoje (${resumo.hoje}): NÃO ABRIU`)
    console.log('    O dia de hoje só nasce com o passado inteiro no lugar — média')
    console.log('    com buraco não é a média que o motor leria na véspera.')
  }

  console.log('\n  cadastro')
  console.log(`${rotulo('times / jogadores')} ${resumo.times} / ${resumo.jogadores}`)
  console.log(`${rotulo('versão de níveis')} ${resumo.versaoNiveis}`)
  console.log(`${rotulo('times classificados')} ${resumo.classificados}`)
  if (resumo.empates > 0)
    console.log(`\n⚠ ${resumo.empates} jogo(s) encerrado(s) empatado(s) — rode: npm run demo:desempatar`)

  if (completa) {
    console.log('\n✓ Temporada pronta até hoje. Confira com: npm run demo:conferir')
    return
  }

  console.log(`\n! Faltam ${resumo.diasRestantes} dia(s) da janela — a demonstração AINDA NÃO`)
  console.log('  está pronta para apresentar. Rode este mesmo comando de novo; ele')
  console.log('  continua do último dia completo e abre a rodada de hoje ao fechar')
  console.log('  o passado:\n')
  console.log('    npx dotenv -e .env.local -- npm run demo:temporada')
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
