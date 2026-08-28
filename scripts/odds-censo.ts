import { fecharDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { autenticarAltenar, censoAltenar, eventosDoDiaAltenar } from '../src/modules/ingestao/odds/altenar'
import { censoBetmgm, eventosDoDiaBetmgm } from '../src/modules/ingestao/odds/betmgm'
import { fontesDeOdds } from '../src/modules/ingestao/odds/fontes'
import type { CensoDaCasa } from '../src/modules/ingestao/odds/porta'

/**
 * CENSO de mercados e jogadores de uma casa — o passo entre "conta criada" e
 * "média no card".
 *
 * Nenhuma das duas documentações mostra como a casa grafia os props de NBA.
 * Este script imprime o que a casa oferece HOJE, com contagens, para alimentar
 * a curadoria de `mapa_mercados` e `mapa_jogadores_casa`. Somente leitura:
 * não grava nada, não liga nada, não envia nada (ADR-0004).
 *
 *   npx dotenv -e .env.local -- npm run odds:censo -- --fonte=altenar
 */
async function principal() {
  const alvo = process.argv.find((a) => a.startsWith('--fonte='))?.slice('--fonte='.length)
  if (!alvo) throw new Error('use --fonte=betmgm|altenar')
  const fonte = fontesDeOdds().find((f) => f.nome === alvo)
  if (!fonte) {
    throw new Error(
      `fonte "${alvo}" sem config completa no ambiente — ver docs/runbooks/casas-de-aposta.md`,
    )
  }

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  console.log(`Censo da fonte ${fonte.nome} para ${hoje}\n`)

  const mercados = new Map<string, number>()
  const jogadores = new Map<string, number>()
  const acumular = (censo: CensoDaCasa) => {
    for (const m of censo.mercados) {
      mercados.set(m.nome, (mercados.get(m.nome) ?? 0) + m.cotacoesAtivas)
    }
    for (const j of censo.jogadores) jogadores.set(j, (jogadores.get(j) ?? 0) + 1)
  }

  if (fonte.nome === 'altenar') {
    const token = await autenticarAltenar(fonte.config)
    const eventos = await eventosDoDiaAltenar(fonte.config, token, hoje)
    console.log(`${eventos.length} evento(s) no dia`)
    for (const e of eventos) {
      acumular(await censoAltenar(fonte.config, token, e.idExterno))
      console.log(`  evento ${e.idExterno}: ${e.nomeCasa ?? '?'} × ${e.nomeVisitante ?? '?'}`)
    }
  } else {
    const eventos = await eventosDoDiaBetmgm(fonte.config, hoje)
    console.log(`${eventos.length} evento(s) PREMATCH`)
    for (const e of eventos) {
      acumular(await censoBetmgm(fonte.config, e.idExterno))
      console.log(`  evento ${e.idExterno}: ${e.nomeCasa ?? '?'} × ${e.nomeVisitante ?? '?'}`)
    }
  }

  const topo = (mapa: Map<string, number>) =>
    [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  console.log('\n== Mercados (nome na casa · cotações ativas) ==')
  for (const [nome, n] of topo(mercados)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\n== Jogadores (nome na casa · mercados) ==')
  for (const [nome, n] of topo(jogadores)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\nPróximo passo: confirmar mapa_mercados e mapa_jogadores_casa')
  console.log('(docs/runbooks/casas-de-aposta.md, passo 3).')
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
