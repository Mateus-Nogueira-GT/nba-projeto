import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../src/modules/dominio/temporada'
import { telaDoJogador } from '../src/modules/entrega/estatisticas/jogador'
import { telaJogosDoDia } from '../src/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao, telaDoTime } from '../src/modules/entrega/estatisticas/time'
import { buscar } from '../src/modules/entrega/estatisticas/busca'
import { lerFeedFireLive, placaresAoVivo } from '../src/modules/entrega/fire-live/leitura'
import { planoDoDia } from '../src/modules/entrega/gestao'
import { detalheDoApito } from '../src/modules/entrega/detalhe-apito'
import { lerFeed, linhasDoJogador } from '../src/modules/entrega/lista-secreta'
import { conferirRodadas } from '../src/modules/entrega/resultados'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'

/**
 * A LISTA DE CONFERÊNCIA DA DEMONSTRAÇÃO.
 *
 * A demo é ancorada num DIA: `semearDemo` monta a rodada da data de
 * referência de quando roda. No dia seguinte, `data_referencia = hoje` não
 * casa com nada e a tela do Fire Live abre em "Sem jogos hoje" — foi o que
 * aconteceu em 25/08/2026, com a apresentação marcada.
 *
 * Este script pergunta, tela por tela, se o cliente veria o produto vivo.
 * Somente leitura; sai com código 1 quando alguma resposta é "não".
 *
 *   npx dotenv -e .env.local -- npm run demo:conferir
 */

type Item = { tela: string; ok: boolean; detalhe: string }

const itens: Item[] = []
const registrar = (tela: string, ok: boolean, detalhe: string) =>
  itens.push({ tela, ok, detalhe })

async function principal() {
  const db = getDb()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  console.log(`Conferindo a demonstração para a rodada de ${hoje} (fuso ${fuso})\n`)

  // 1 · Lista Secreta — a vitrine.
  const feed = await lerFeed(db, hoje)
  const itensFeed = feed?.conteudo.itens ?? []
  registrar('Lista Secreta', itensFeed.length > 0, `${itensFeed.length} entradas publicadas`)

  const comFoto = itensFeed.filter((i) => i.fotoUrl).length
  registrar('  · fotos nos cards', comFoto > 0, `${comFoto} de ${itensFeed.length} com headshot`)

  const comHistorico = itensFeed.filter((i) => (i.ultimos5?.length ?? 0) > 0).length
  registrar('  · barrinhas (últ. 5)', comHistorico > 0, `${comHistorico} com histórico na linha`)

  const comMedia = itensFeed.filter((i) => i.mediaTemporada !== null).length
  registrar('  · média no rodapé', comMedia > 0, `${comMedia} com média da temporada`)

  const comOdd = itensFeed.filter((i) => i.oddFaixa !== null).length
  registrar('  · odd no rodapé', comOdd > 0, `${comOdd} com faixa/média de odds`)

  const turbo = itensFeed.filter((i) => i.turbo).length
  registrar('  · destaque turbo', turbo > 0, `${turbo} apito(s) turbo para mostrar o azul`)

  const opd = itensFeed.filter((i) => i.metodo === 'OPD').length
  registrar('  · OPD (desfalque)', opd > 0, `${opd} entrada(s) por oportunidade`)

  // 2 · Fire Live — o que estava vazio.
  const fire = await lerFeedFireLive(db, hoje, ruleset.fire_live.quarto)
  registrar(
    'Fire Live',
    fire.itens.length > 0,
    fire.itens.length > 0
      ? `${fire.itens.length} apitos ao vivo`
      : `VAZIO (estado: ${fire.estadoVazio}) — rode "npm run demo:seed" para trazer a rodada para hoje`,
  )
  const placares = await placaresAoVivo(db, hoje, ruleset.fire_live.quarto)
  registrar('  · placar do 1º quarto', placares.length > 0, `${placares.length} jogo(s) ao vivo`)
  const fogo = fire.itens.filter((i) => i.modoFire).length
  registrar('  · modo fire (75%)', fogo > 0, `${fogo} jogador(es) em modo fire`)

  // 3 · Detalhe do apito — a tela do "por que entrou".
  const comLinha = itensFeed.find((i) => i.linha !== null)
  if (comLinha) {
    const { itens: linhas } = await linhasDoJogador(db, hoje, comLinha.jogadorId, comLinha.atributo)
    const detalhe = await detalheDoApito(db, ruleset, comLinha)
    registrar('Detalhe do apito', linhas.length > 0, `${linhas.length} linha(s) para ${comLinha.nome}`)
    registrar(
      '  · por que entrou',
      detalhe.porQueEntrou.length > 0,
      `${detalhe.porQueEntrou.length} linha(s) de explicação`,
    )
    registrar('  · últimos 5 na linha', detalhe.blocos.length > 0, `${detalhe.blocos.length} jogos`)
  } else {
    registrar('Detalhe do apito', false, 'nenhum item com linha para abrir')
  }

  // 4 · Resultados — a conferência dos dias anteriores.
  const rodadas = await conferirRodadas(db, hoje, 5)
  const conferidos = rodadas.reduce((soma, r) => soma + r.conferidos, 0)
  const acertos = rodadas.reduce((soma, r) => soma + r.acertos, 0)
  registrar(
    'Resultados',
    conferidos > 0,
    `${rodadas.length} rodada(s), ${conferidos} conferidos, ${acertos} acerto(s)`,
  )

  // 5 · Gestão de banca.
  const plano = await planoDoDia(db, ruleset, hoje, 1000)
  registrar('Gestão de banca', plano.entradas.length > 0, `${plano.entradas.length} entradas no plano`)

  // 6 · Estatísticas — as três telas.
  const jogosDoDia = await telaJogosDoDia(db, hoje, fuso)
  registrar('Estatísticas · jogos do dia', jogosDoDia.jogos.length > 0, `${jogosDoDia.jogos.length} jogos`)

  // Busca com um NOME de verdade: a busca exige score mínimo, e uma letra
  // solta não pontua (é o comportamento certo — não devolve o elenco inteiro).
  const termo = (itensFeed[0]?.nome ?? 'James').split(' ').pop() ?? 'James'
  const achados = await buscar(db, termo, { apenas: 'JOGADOR' })
  registrar('Estatísticas · busca', achados.length > 0, `${achados.length} resultado(s) para "${termo}"`)

  const alvo = itensFeed[0]
  if (alvo) {
    const temporada = temporadaDe(new Date(), calendarioDoRuleset(ruleset))
    const tela = await telaDoJogador(db, alvo.jogadorId, { temporada })
    const jogos = tela?.historico.length ?? 0
    registrar('Estatísticas · jogador', jogos > 0, `${jogos} jogos no histórico de ${alvo.nome}`)
    const arremessos = tela?.perfilNumeros.ataque.doisPercentual ?? null
    registrar('  · 2P%/3P%/LL%', arremessos !== null, arremessos === null ? 'sem arremessos' : `2P ${arremessos}%`)

    if (tela?.perfil.timeId) {
      const time = await telaDoTime(db, tela.perfil.timeId, { temporada })
      registrar('Estatísticas · time', (time?.jogosDoTime.length ?? 0) > 0, `${time?.jogosDoTime.length ?? 0} partidas com box score`)
    }
  }
  const tabela = await telaDaClassificacao(db, temporadaDe(new Date(), calendarioDoRuleset(ruleset)))
  registrar('Estatísticas · classificação', tabela.linhas.length > 0, `${tabela.linhas.length} times na campanha`)

  // Relatório.
  const largura = Math.max(...itens.map((i) => i.tela.length))
  for (const i of itens) {
    console.log(`${i.ok ? '✓' : '✗'} ${i.tela.padEnd(largura)}  ${i.detalhe}`)
  }
  const falhas = itens.filter((i) => !i.ok)
  if (falhas.length === 0) {
    console.log('\n✓ Demonstração pronta para apresentar.')
    return
  }
  console.log(`\n✗ ${falhas.length} item(ns) sem dado para mostrar ao cliente.`)
  process.exitCode = 1
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
