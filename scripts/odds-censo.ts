import { fecharDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { prepararFonte } from '../src/modules/ingestao/odds/coleta-do-dia'
import { fontesDeOdds, fontesIncompletas } from '../src/modules/ingestao/odds/fontes'
import type { CensoDaCasa } from '../src/modules/ingestao/odds/porta'

/**
 * CENSO de mercados e jogadores de uma casa — o passo entre "conta criada" e
 * "média no card".
 *
 * Nenhuma das duas documentações mostra como a casa grafia os props de NBA.
 * Este script imprime o que a casa oferece HOJE, com contagens, para alimentar
 * a curadoria de `mapa_mercados` e dos vínculos de jogador. Somente leitura:
 * não grava nada, não liga nada, não envia nada (ADR-0004). Fala com a casa
 * pelo MESMO caminho do cron (`prepararFonte`) — o que você vê aqui é o que a
 * coleta vai ver.
 *
 *   npx dotenv -e .env.local -- npm run odds:censo -- --fonte=altenar
 */
async function principal() {
  const alvo = process.argv.find((a) => a.startsWith('--fonte='))?.slice('--fonte='.length)
  if (!alvo) throw new Error('use --fonte=betmgm|altenar')
  const fonte = fontesDeOdds().find((f) => f.nome === alvo)
  if (!fonte) {
    const incompleta = fontesIncompletas().find((f) => f.nome === alvo)
    const detalhe = incompleta ? ` — faltam ${incompleta.faltam.join(', ')}` : ''
    throw new Error(`fonte "${alvo}" sem config completa no ambiente${detalhe} (docs/runbooks/casas-de-aposta.md)`)
  }

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  console.log(`Censo da fonte ${fonte.nome} para ${hoje}\n`)

  const pecas = await prepararFonte(fonte, hoje)
  console.log(`${pecas.eventos.length} evento(s) devolvidos pela casa`)

  const mercados = new Map<string, number>()
  const jogadores = new Map<string, number>()
  const acumular = (censo: CensoDaCasa) => {
    for (const m of censo.mercados) mercados.set(m.nome, (mercados.get(m.nome) ?? 0) + m.cotacoesAtivas)
    for (const j of censo.jogadores) jogadores.set(j, (jogadores.get(j) ?? 0) + 1)
  }
  for (const e of pecas.eventos) {
    acumular(await pecas.censo(e.idExterno))
    console.log(
      `  ${e.idExterno}: ${e.nomeCasa ?? '?'} × ${e.nomeVisitante ?? '?'}${e.inicioIso ? ` · ${e.inicioIso}` : ''}`,
    )
  }

  const topo = (mapa: Map<string, number>) =>
    [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  console.log('\n== Mercados (nome como a curadoria deve gravar · cotações ativas) ==')
  for (const [nome, n] of topo(mercados)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\n== Jogadores (nome na casa · mercados) ==')
  for (const [nome, n] of topo(jogadores)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\nPróximo passo: confirmar mapa_mercados e os vínculos de jogador no /admin/mercados')
  console.log('(docs/runbooks/casas-de-aposta.md, passo 3).')
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
