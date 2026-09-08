import { and, eq, lt } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { jogos as tabelaJogos } from '../src/modules/dominio/db/schema'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../src/modules/dominio/temporada'
import { telaDoJogador } from '../src/modules/entrega/estatisticas/jogador'
import { telaDoJogo } from '../src/modules/entrega/estatisticas/jogo'
import { telaJogosDoDia } from '../src/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao, telaDoTime } from '../src/modules/entrega/estatisticas/time'
import { buscar } from '../src/modules/entrega/estatisticas/busca'
import { lerFeedFireLive, placaresAoVivo } from '../src/modules/entrega/fire-live/leitura'
import { planoDoDia } from '../src/modules/entrega/gestao'
import { detalheDoApito } from '../src/modules/entrega/detalhe-apito'
import { lerFeed, linhasDoJogador } from '../src/modules/entrega/lista-secreta'
import { conferirRodadas } from '../src/modules/entrega/resultados'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { autossemeaduraHabilitada } from '../src/modules/ingestao/demo/autossemeadura'

/**
 * A LISTA DE CONFERÊNCIA DA DEMONSTRAÇÃO — o portão da apresentação.
 *
 * A demo é uma TEMPORADA SIMULADA de sete semanas que termina em HOJE: cada
 * dia foi jogado por sorteio e teve a Lista Secreta publicada pelo motor
 * ANTES de ser jogado. Duas coisas podem estar erradas na véspera de uma
 * apresentação, e são diferentes:
 *
 *   - a rodada de HOJE não existe — `data_referencia = hoje` não casa com
 *     nada e o Fire Live abre em "Sem jogos hoje" (25/08/2026, com a
 *     apresentação marcada);
 *   - a rodada de hoje existe, mas o PASSADO tem buraco — e aí a tela de
 *     Resultados, a classificação e as médias contam uma história pela metade.
 *
 * Este script pergunta, tela por tela, se o cliente veria o produto vivo.
 * Somente leitura; sai com código 1 quando alguma resposta é "não".
 *
 * DOIS TIPOS DE ITEM, e a diferença importa:
 *
 *   ✓ / ✗  CONFERÊNCIA — faltando, estraga a apresentação. O ✗ reprova e o
 *          script sai com código 1.
 *   ✓ / ·  INFORMATIVO — o retrato de um dia SORTEADO, ou de algo que este
 *          processo não tem como saber. Nunca reprova: um item que reprova
 *          por sorte reprovaria uma demo perfeitamente boa, e o operador
 *          aprenderia a ignorar o ✗ — que é o oposto do que este script faz.
 *
 *   npx dotenv -e .env.local -- npm run demo:conferir
 */

type Item = { tela: string; marca: '✓' | '✗' | '·'; detalhe: string }

const itens: Item[] = []

/** Conferência de verdade: `ok: false` reprova a demonstração. */
const registrar = (tela: string, ok: boolean, detalhe: string) =>
  itens.push({ tela, marca: ok ? '✓' : '✗', detalhe })

/** Retrato do dia: `presente` só escolhe a marca. Informativo nunca reprova. */
const informar = (tela: string, presente: boolean, detalhe: string) =>
  itens.push({ tela, marca: presente ? '✓' : '·', detalhe })

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

  // A narrativa é anexada DEPOIS do hash e só na transição dele
  // (`lista-secreta.ts`). Publicar sem porta de LLM, cotar as odds e
  // republicar deixaria o hash fixado sem texto — e a lista do dia ficaria
  // sem narrativa para sempre. É a regressão que a errata 4b da spec fechou,
  // e zero aqui é exatamente ela de volta.
  const comNarrativa = itensFeed.filter((i) => (i.narrativa ?? '') !== '').length
  registrar('  · narrativa (LLM)', comNarrativa > 0, `${comNarrativa} card(s) com frase de análise`)

  // INFORMATIVO. Turbo é MVP com três jogos abaixo SEGUIDOS; numa temporada
  // sorteada isso não acontece todo dia. Exigi-lo reprovaria uma demo boa por
  // sorteio, e a tela azul continua existindo em qualquer outro dia da janela.
  const turbo = itensFeed.filter((i) => i.turbo).length
  informar(
    '  · destaque turbo (varia por dia)',
    turbo > 0,
    turbo > 0
      ? `${turbo} apito(s) turbo para mostrar o azul`
      : 'nenhum hoje — depende de 3 jogos abaixo seguidos',
  )

  // A OPD, ao contrário, NÃO é sorte: `produzirHoje` força um desfalque em
  // prefixo da hierarquia todo dia, de propósito (spec §3). Zero aqui não é
  // um dia sem sorte, é o cenário forçado que parou de funcionar.
  const opd = itensFeed.filter((i) => i.metodo === 'OPD').length
  registrar('  · OPD (desfalque)', opd > 0, `${opd} entrada(s) por oportunidade`)

  // 2 · Fire Live — o que estava vazio.
  const fire = await lerFeedFireLive(db, hoje, ruleset.fire_live.quarto)
  registrar(
    'Fire Live',
    fire.itens.length > 0,
    fire.itens.length > 0
      ? `${fire.itens.length} apitos ao vivo`
      : `VAZIO (estado: ${fire.estadoVazio}) — rode "npm run demo:temporada" para abrir a rodada de hoje`,
  )
  const placares = await placaresAoVivo(db, hoje, ruleset.fire_live.quarto)
  registrar('  · placar do 1º quarto', placares.length > 0, `${placares.length} jogo(s) ao vivo`)
  // Também forçado (spec §3, cenário (b)): o protagonista do jogo ao vivo
  // cruza os 75% da média no 1Q. Sem ele, a peça mais vistosa da demo sumiu.
  const fogo = fire.itens.filter((i) => i.modoFire).length
  registrar('  · modo fire (75%)', fogo > 0, `${fogo} jogador(es) em modo fire`)

  // 3 · Detalhe do apito — a tela do "por que entrou".
  const comLinha = itensFeed.find((i) => i.linha !== null)
  if (comLinha) {
    const { itens: linhas } = await linhasDoJogador(db, hoje, comLinha.jogadorId, comLinha.atributo)
    const detalhe = await detalheDoApito(db, ruleset, comLinha)
    registrar(
      'Detalhe do apito',
      linhas.length > 0,
      `${linhas.length} linha(s) para ${comLinha.nome}`,
    )
    registrar(
      '  · por que entrou',
      detalhe.porQueEntrou.length > 0,
      `${detalhe.porQueEntrou.length} linha(s) de explicação`,
    )
    registrar('  · últimos 5 na linha', detalhe.blocos.length > 0, `${detalhe.blocos.length} jogos`)
  } else {
    registrar('Detalhe do apito', false, 'nenhum item com linha para abrir')
  }

  // 4 · Resultados — a conferência dos dias anteriores. SETE dias: é a janela
  // que a tela mostra, e a temporada simulada tem histórico para ela.
  const rodadas = await conferirRodadas(db, hoje, 7)
  const conferidos = rodadas.reduce((soma, r) => soma + r.conferidos, 0)
  const acertos = rodadas.reduce((soma, r) => soma + r.acertos, 0)
  registrar(
    'Resultados',
    conferidos > 0,
    `${rodadas.length} rodada(s), ${conferidos} conferidos, ${acertos} acerto(s)`,
  )
  // A HONESTIDADE DA DEMO EM UM NÚMERO. A lista de cada dia foi publicada
  // antes de o dia ser jogado, então a tela tem de mostrar os dois lados. Só
  // green (ou só red) em centenas de conferências não é sorte: é sinal de que
  // o resultado voltou a ser escrito por alguém, e é a primeira coisa que um
  // cliente cético pergunta.
  registrar(
    '  · green e red',
    acertos > 0 && acertos < conferidos,
    `${acertos} green / ${conferidos - acertos} red em ${conferidos} conferidos`,
  )

  // 4b · A TEMPORADA POR TRÁS DOS NÚMEROS — o lastro que a tela não mostra.
  // As médias, a classificação, as barrinhas e a própria taxa de acerto só
  // significam alguma coisa se as sete semanas estiverem inteiras no banco.
  const encerrados = await db
    .select({
      dia: tabelaJogos.dataReferencia,
      casa: tabelaJogos.timeCasaId,
      visitante: tabelaJogos.timeVisitanteId,
    })
    .from(tabelaJogos)
    .where(and(eq(tabelaJogos.status, 'ENCERRADO'), lt(tabelaJogos.dataReferencia, hoje)))

  const diasComJogo = new Set(encerrados.map((j) => j.dia)).size
  registrar(
    'Temporada · dias com jogo',
    diasComJogo >= 45,
    `${diasComJogo} dia(s) encerrados (esperado ≥ 45 das 7 semanas)`,
  )

  const jogosPorTime = new Map<string, number>()
  for (const j of encerrados) {
    for (const t of [j.casa, j.visitante]) jogosPorTime.set(t, (jogosPorTime.get(t) ?? 0) + 1)
  }
  // Cada time joga 3× por semana — 21 jogos em 49 dias (errata 4b da spec).
  // Menos de 20 num time só significa janela pela metade, e é a aba de
  // estatísticas que denuncia: time sem campanha na tabela de classificação.
  const minimoDeJogos = jogosPorTime.size === 0 ? 0 : Math.min(...jogosPorTime.values())
  registrar(
    'Temporada · jogos por time',
    jogosPorTime.size === 30 && minimoDeJogos >= 20,
    `${jogosPorTime.size} time(s) com jogo, mínimo ${minimoDeJogos} (esperado 30 times, ≥ 20 jogos)`,
  )

  // O ESTADO DA RODADA DE HOJE, separado do que a temporada acumulou — são
  // dois defeitos diferentes com o mesmo sintoma na tela. `simularAte` só abre
  // hoje depois de fechar TODO o passado, e o cron corta no orçamento de
  // 240 s: num banco vazio dá para ter temporada crescendo e hoje vazio por
  // dias seguidos. Aí a vitrine inteira abre em branco.
  const rodadaDeHoje = await db
    .select({ status: tabelaJogos.status })
    .from(tabelaJogos)
    .where(eq(tabelaJogos.dataReferencia, hoje))
  const noStatus = (status: string) => rodadaDeHoje.filter((j) => j.status === status).length
  registrar(
    'Temporada · rodada de hoje',
    rodadaDeHoje.length > 0,
    rodadaDeHoje.length > 0
      ? `${rodadaDeHoje.length} jogo(s): ${noStatus('AO_VIVO')} ao vivo, ${noStatus('AGENDADO')} agendado(s), ${noStatus('ENCERRADO')} encerrado(s)`
      : 'NENHUM jogo em hoje — rode "npm run demo:temporada" (o cron não abre a rodada sozinho)',
  )
  // Um, e exatamente um. Zero é Fire Live vazio; mais de um só apareceria se
  // alguém mexesse na ordem agendar → ao vivo → publicar → odds → republicar.
  registrar(
    '  · um jogo ao vivo',
    noStatus('AO_VIVO') === 1,
    `${noStatus('AO_VIVO')} jogo(s) AO_VIVO hoje (esperado 1)`,
  )

  // 5 · Gestão de banca.
  const plano = await planoDoDia(db, ruleset, hoje, 1000)
  registrar(
    'Gestão de banca',
    plano.entradas.length > 0,
    `${plano.entradas.length} entradas no plano`,
  )

  // 6 · Estatísticas — as três telas.
  const jogosDoDia = await telaJogosDoDia(db, hoje, fuso)
  registrar(
    'Estatísticas · jogos do dia',
    jogosDoDia.jogos.length > 0,
    `${jogosDoDia.jogos.length} jogos`,
  )

  // Busca com um NOME de verdade: a busca exige score mínimo, e uma letra
  // solta não pontua (é o comportamento certo — não devolve o elenco inteiro).
  const termo = (itensFeed[0]?.nome ?? 'James').split(' ').pop() ?? 'James'
  const achados = await buscar(db, termo, { apenas: 'JOGADOR' })
  registrar(
    'Estatísticas · busca',
    achados.length > 0,
    `${achados.length} resultado(s) para "${termo}"`,
  )

  const alvo = itensFeed[0]
  if (alvo) {
    const calendario = calendarioDoRuleset(ruleset)
    const temporada = temporadaDe(new Date(), calendario)
    const tela = await telaDoJogador(db, alvo.jogadorId, { temporada, calendario })
    const jogos = tela?.historico.length ?? 0
    registrar('Estatísticas · jogador', jogos > 0, `${jogos} jogos no histórico de ${alvo.nome}`)
    const arremessos = tela?.perfilNumeros.ataque.doisPercentual ?? null
    registrar(
      '  · 2P%/3P%/LL%',
      arremessos !== null,
      arremessos === null ? 'sem arremessos' : `2P ${arremessos}%`,
    )

    if (tela?.perfil.timeId) {
      const time = await telaDoTime(db, tela.perfil.timeId, { temporada })
      registrar(
        'Estatísticas · time',
        (time?.jogosDoTime.length ?? 0) > 0,
        `${time?.jogosDoTime.length ?? 0} partidas com box score`,
      )
    }
  }
  const tabela = await telaDaClassificacao(
    db,
    temporadaDe(new Date(), calendarioDoRuleset(ruleset)),
  )
  registrar(
    'Estatísticas · classificação',
    tabela.linhas.length > 0,
    `${tabela.linhas.length} times na campanha`,
  )

  // 7 · Tela de partida — as três variantes de estado.
  for (const [estado, rotulo] of [
    ['ENCERRADO', 'encerrado'],
    ['AO_VIVO', 'ao vivo'],
    ['AGENDADO', 'agendado'],
  ] as const) {
    const [linha] = await db
      .select()
      .from(tabelaJogos)
      .where(eq(tabelaJogos.status, estado))
      .limit(1)
    if (!linha) {
      registrar(`Tela de partida · ${rotulo}`, false, 'nenhum jogo nesse estado na demo')
      continue
    }
    const partida = await telaDoJogo(db, linha.id, {})
    if (partida === null) {
      registrar(`Tela de partida · ${rotulo}`, false, 'telaDoJogo devolveu null')
      continue
    }
    const linhas = partida.casa.boxScore.length + partida.visitante.boxScore.length
    const comNota = [...partida.casa.boxScore, ...partida.visitante.boxScore].filter(
      (l) => l.nota !== null,
    ).length
    const detalhe =
      estado === 'AGENDADO'
        ? `forma ${partida.casa.forma.join('') || '—'}/${partida.visitante.forma.join('') || '—'}, ${partida.h2h.length} confronto(s) anterior(es)`
        : `${linhas} linha(s) de box, ${comNota} com nota, ${partida.lideres.length} líder(es)`
    // O QUE A TELA AGENDADA PROMETE É A FORMA DOS DOIS TIMES, não o H2H.
    // O calendário é um rodízio de ciclo fixo: dois times quaisquer podem
    // simplesmente não ter se cruzado nas sete semanas, e a tela abre correta
    // com o histórico vazio. Cobrar H2H aqui era reprovar por sorteio — a
    // contagem fica no detalhe, onde informa sem bloquear.
    const ok =
      estado === 'AGENDADO'
        ? partida.casa.forma.length > 0 && partida.visitante.forma.length > 0
        : linhas > 0
    registrar(`Tela de partida · ${rotulo}`, ok, detalhe)
  }

  // 8 · O SELO DE DEMONSTRAÇÃO — informativo, e por um motivo estrutural.
  //
  // A faixa "Temporada demonstrativa · dados simulados" é renderizada pelo
  // layout do APP, que lê `DEMO_AUTOSSEMEADURA` do ambiente do servidor Next —
  // o painel da Vercel em produção, o `.env.local` no `npm run dev`. Este
  // script é outro processo: rodado com `npx dotenv -e .env.local` ele vê a
  // variável do dev local; rodado sem, não vê nenhuma. Reprovar aqui acusaria
  // o shell, não o app, e um ✗ que mente é pior do que item nenhum.
  //
  // A guarda consultada é a MESMA função que o componente usa, para que o
  // item nunca divirja da regra que de fato liga a faixa.
  const selo = autossemeaduraHabilitada(process.env)
  informar(
    'Faixa de demonstração',
    selo,
    selo
      ? 'DEMO_AUTOSSEMEADURA=true aqui — confirme a mesma variável no ambiente do app'
      : 'sem DEMO_AUTOSSEMEADURA neste shell — ligue-a no painel da Vercel (e no .env.local) ou o app não avisa que o dado é simulado',
  )

  // Relatório.
  const largura = Math.max(...itens.map((i) => i.tela.length))
  for (const i of itens) {
    console.log(`${i.marca} ${i.tela.padEnd(largura)}  ${i.detalhe}`)
  }
  const falhas = itens.filter((i) => i.marca === '✗')
  const notas = itens.filter((i) => i.marca === '·').length
  const rodape = notas > 0 ? ` (${notas} item(ns) "·" são informativos e não reprovam)` : ''
  if (falhas.length === 0) {
    console.log(`\n✓ Demonstração pronta para apresentar.${rodape}`)
    return
  }
  console.log(`\n✗ ${falhas.length} item(ns) sem dado para mostrar ao cliente.${rodape}`)
  process.exitCode = 1
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
