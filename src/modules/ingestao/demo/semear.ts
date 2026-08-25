import { readFile } from 'node:fs/promises'
import { eq, inArray } from 'drizzle-orm'

import {
  casas,
  estatisticasJogo,
  estatisticasQuarto,
  fireLiveExecucoes,
  jogadores,
  jogos,
  lesoesEscalacao,
  mapaJogadores,
  mediasJogador,
  niveis,
  oddsAgregada,
  oddsSnapshot,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { dataDeReferencia, intervaloDoDia, somarDias } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { lerFeed, publicarListaSecreta } from '../../entrega/lista-secreta'
import { deltaOscilacao, faixaEstatica, marcosDoNivel } from '../../motor/atributos'
import { agregar } from '../../motor/odds/agregar'
import type { Ruleset } from '../../motor/ruleset/schema'
import { ATRIBUTOS } from '../../motor/tipos'
import type { Atributo } from '../../motor/tipos'
import { lerListaDeNiveis } from '../niveis/parser'
import { importarListaDeNiveis } from '../niveis/importar'
import { historicoOscilacao, mediaDe, niveisDoJogador, posicaoDe } from './dados'

export const ARQUIVO_LISTA = 'data/fontes/introducao-ia-nba.md'
const PROVEDOR_DEMO = 'demo'

export type ResumoDemo = {
  times: number
  jogadores: number
  versaoNiveis: string
  jogosHoje: number
  itensListaSecreta: number
  apitosFireLive: number
  linhasComOdd: number
  /** Rodadas passadas com lista publicada — o que a aba de Resultados lê. */
  rodadasPublicadas: number
}

/**
 * SEMEIA A DEMONSTRAÇÃO — fatos, nunca resultados.
 *
 * Escreve matéria-prima (elencos do CJ, médias, box scores, escalação, quarto
 * ao vivo) e depois chama o pipeline REAL: publicarListaSecreta e
 * executarCiclo. Os apitos que aparecem na tela foram calculados pelo motor
 * com o ruleset homologado — a demo é prova do motor, não maquete.
 *
 * Os cenários são os exemplos numéricos do próprio documento: Luka fora
 * abrindo OPD para Reaves/Grimes/Kessler, a oscilação do LeBron, o turbo do
 * MVP em nível 3, e um MVP cruzando o alvo do 1º quarto até o modo fire.
 *
 * Idempotente: reexecutar não duplica nada.
 */
export async function semearDemo(db: Db, ruleset: Ruleset, agora: Date): Promise<ResumoDemo> {
  const conteudo = await readFile(ARQUIVO_LISTA, 'utf8')
  const analise = lerListaDeNiveis(conteudo)

  // 1 · Times e jogadores canônicos. Na demo, a lista do CJ é a autoridade
  //     sobre quem existe — e o vínculo é confirmado aqui, no lugar da
  //     curadoria humana que a produção exige.
  const siglas = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null))]
  for (const sigla of siglas) {
    const nome = analise.jogadores.find((j) => j.timeSigla === sigla)?.timeNaLista ?? sigla
    await db.insert(times).values({ sigla, nome }).onConflictDoNothing({ target: times.sigla })
  }
  const timePorSigla = new Map((await db.select().from(times)).map((t) => [t.sigla, t.id] as const))

  const jaExistentes = new Map(
    (await db.select().from(jogadores)).map((j) => [j.nomeCompleto, j.id] as const),
  )
  for (const j of analise.jogadores) {
    if (jaExistentes.has(j.nomeNaLista)) continue
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    const [novo] = await db
      .insert(jogadores)
      .values({
        nomeCompleto: j.nomeNaLista,
        // ATENÇÃO: jogadores.time_id é o time REAL do provedor e alimenta a aba
        // de estatísticas. Na demo não há provedor, então espelha a lista.
        timeId: timeId ?? null,
        posicao: posicaoDe(j.nomeNaLista),
      })
      .returning()
    if (novo) jaExistentes.set(j.nomeNaLista, novo.id)
  }

  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(j.nomeNaLista)
    if (!jogadorId) continue
    await db
      .insert(mapaJogadores)
      .values({
        nomeNaLista: j.nomeNaLista,
        provedor: PROVEDOR_DEMO,
        jogadorId,
        confirmadoPor: 'demo-seed',
        confirmadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
        set: { jogadorId, confirmadoPor: 'demo-seed', confirmadoEm: agora },
      })
  }

  const relatorio = await importarListaDeNiveis(db, conteudo, {
    provedor: PROVEDOR_DEMO,
    origemArquivo: ARQUIVO_LISTA,
    importadoPor: 'demo-seed',
  })
  await ativarVersaoNiveis(db, relatorio.versaoId)

  // 1b · REBOTES e ASSISTÊNCIAS. O importador só sabe classificar PONTOS,
  //      porque é o único atributo que o CJ enviou. Estas linhas são
  //      INVENTADAS e entram na MESMA versão de níveis — o motor as trata
  //      exatamente como trataria a lista real, sem saber a diferença.
  //      Quando as listas verdadeiras chegarem, elas vêm pelo importador e
  //      este bloco desaparece.
  const niveisDerivados: (typeof niveis.$inferInsert)[] = []
  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(j.nomeNaLista)
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    if (!jogadorId || !timeId) continue

    const derivados = niveisDoJogador(j.nomeNaLista, j.nivel)
    for (const atributo of ATRIBUTOS) {
      if (atributo === 'PONTOS') continue
      niveisDerivados.push({
        niveisVersaoId: relatorio.versaoId,
        jogadorId,
        timeId,
        atributo,
        nivel: derivados[atributo],
        posicaoHierarquia: j.posicaoHierarquia,
      })
    }
  }
  if (niveisDerivados.length > 0) {
    await db.insert(niveis).values(niveisDerivados).onConflictDoNothing()
  }

  // 2 · Médias da temporada — a MESMA que montarFatos vai consultar.
  const temporada = temporadaDe(agora, calendarioDoRuleset(ruleset))
  const nivelPorNome = new Map(analise.jogadores.map((j) => [j.nomeNaLista, j.nivel] as const))
  for (const [nome, jogadorId] of jaExistentes) {
    const nivel = nivelPorNome.get(nome)
    if (!nivel) continue
    const m = mediaDe(nome, nivel)
    await db
      .insert(mediasJogador)
      .values({
        jogadorId,
        temporada,
        janela: 'TEMPORADA',
        jogos: 40,
        ppg: m.ppg.toFixed(2),
        rpg: m.rpg.toFixed(2),
        apg: m.apg.toFixed(2),
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [mediasJogador.jogadorId, mediasJogador.temporada, mediasJogador.janela],
        set: { ppg: m.ppg.toFixed(2), rpg: m.rpg.toFixed(2), apg: m.apg.toFixed(2), atualizadoEm: agora },
      })
  }

  const { fuso } = ruleset.rodada
  const dataReferencia = dataDeReferencia(agora, fuso)
  const idDoTime = (sigla: string) => timePorSigla.get(sigla)

  async function criarJogo(
    casa: string,
    visitante: string,
    quandoUtc: Date,
    dia: string,
    extra: { status?: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'; quartoAtual?: number | null } = {},
  ): Promise<string | null> {
    const timeCasaId = idDoTime(casa)
    const timeVisitanteId = idDoTime(visitante)
    if (!timeCasaId || !timeVisitanteId) return null
    const [linha] = await db
      .insert(jogos)
      .values({
        dataHoraUtc: quandoUtc,
        dataReferencia: dia,
        timeCasaId,
        timeVisitanteId,
        status: extra.status ?? 'AGENDADO',
        quartoAtual: extra.quartoAtual ?? null,
      })
      .onConflictDoUpdate({
        target: [jogos.dataReferencia, jogos.timeCasaId, jogos.timeVisitanteId],
        set: { status: extra.status ?? 'AGENDADO', quartoAtual: extra.quartoAtual ?? null },
      })
      .returning()
    return linha?.id ?? null
  }

  // 3 · Histórico — box scores moldados para os exemplos do documento.
  //     ATENÇÃO à regra do CJ: "randola e suporte não apitam o nível 1 de
  //     oscilação". LeBron, na lista projetada, é SUPORTE no Philadelphia —
  //     então ele precisa de DOIS jogos abaixo para aparecer. Quem demonstra o
  //     nível 1 (amarelo) tem que ser MVP ou All Star.
  //     Cada atributo tem seus próprios protagonistas, e todos jogam HOJE —
  //     apito de quem não entra em quadra não aparece na lista.
  //
  //     `desde: 1` marca quem PAROU de oscilar ontem: apitou na rodada passada
  //     e voltou à média no jogo seguinte. Sem esse segundo grupo, a aba de
  //     Resultados só teria quem continua abaixo — e o jogo conferido seria
  //     mais um jogo ruim, fazendo a estratégia parecer errar sempre.
  type Cenario = { nome: string; jogosAbaixo: number; desde?: number }
  const CENARIOS: Record<Atributo, Cenario[]> = {
    PONTOS: [
      { nome: 'Brunson', jogosAbaixo: 1 }, // MVP · 1 jogo abaixo → amarelo
      { nome: 'LeBron James', jogosAbaixo: 2 }, // Suporte · 2 jogos → laranja
      { nome: 'stephen Curry', jogosAbaixo: 3 }, // MVP · 3 jogos → verde + turbo
      { nome: 'Shai', jogosAbaixo: 3, desde: 1 }, // apitou ontem, bateu ontem
      { nome: 'Tatum', jogosAbaixo: 2, desde: 1 },
    ],
    REBOTES: [
      { nome: 'Tatum', jogosAbaixo: 2 }, // BOS
      { nome: 'Jokic', jogosAbaixo: 3 }, // DEN — os 12,9 rpg do documento
      { nome: 'Giannis', jogosAbaixo: 3, desde: 1 }, // MIA
    ],
    ASSISTENCIAS: [
      { nome: 'Giannis', jogosAbaixo: 2 }, // MIA
      { nome: 'Jamal Murray', jogosAbaixo: 3 }, // DEN — os 7 apg do documento
      { nome: 'Brunson', jogosAbaixo: 2, desde: 1 }, // NYK
    ],
  }
  const cenarioDe = (nome: string, atributo: Atributo): Cenario | undefined =>
    CENARIOS[atributo].find((c) => c.nome === nome)

  // A rodada é a MESMA todos os dias: os oito times do documento se enfrentando.
  // Antes, o histórico inteiro cabia num único LAL x GSW e todo jogador da liga
  // ganhava uma linha nele — o que bastava para a oscilação de hoje, mas
  // produzia uma rodada passada que não dá para conferir: o jogador aparecia
  // num jogo que o time dele não disputou.
  const CONFRONTOS: [string, string][] = [
    ['OKC', 'DEN'],
    ['LAL', 'PHI'],
    ['GSW', 'BOS'],
    ['MIA', 'NYK'],
  ]

  const DIAS = 6
  for (let i = 1; i <= DIAS; i++) {
    const dia = new Date(agora.getTime() - i * 24 * 60 * 60_000)
    const diaRef = somarDias(dataReferencia, -i)

    const jogoDoTime = new Map<string, string>()
    for (const [casa, visitante] of CONFRONTOS) {
      const jogoId = await criarJogo(casa, visitante, dia, diaRef, { status: 'ENCERRADO' })
      if (jogoId === null) continue
      jogoDoTime.set(casa, jogoId)
      jogoDoTime.set(visitante, jogoId)
    }

    for (const j of analise.jogadores) {
      const nome = j.nomeNaLista
      const jogadorId = jaExistentes.get(nome)
      const jogoId = j.timeSigla === null ? undefined : jogoDoTime.get(j.timeSigla)
      if (jogadorId === undefined || jogoId === undefined) continue

      const nivelPontos = nivelPorNome.get(nome)
      if (!nivelPontos) continue

      const derivados = niveisDoJogador(nome, nivelPontos)
      const m = mediaDe(nome, nivelPontos)
      const mediaDoAtributo: Record<Atributo, number> = {
        PONTOS: m.ppg,
        REBOTES: m.rpg,
        ASSISTENCIAS: m.apg,
      }

      // O delta sai do ruleset, por atributo. Sem tabela para o atributo, o
      // jogador só joga na média — nenhuma sequência de oscilação se forma.
      const valorNoJogo = (atributo: Atributo): number => {
        const media = mediaDoAtributo[atributo]
        const delta = deltaOscilacao(derivados[atributo], atributo, jogadorId, ruleset)
        if (delta === undefined) return Math.round(media)
        const cenario = cenarioDe(nome, atributo)
        const sequencia = historicoOscilacao(media, delta, cenario?.jogosAbaixo ?? 0, {
          deslocamento: cenario?.desde ?? 0,
          variacao: `${nome}|${atributo}`,
        })
        return sequencia[i - 1] ?? Math.round(media)
      }

      await db
        .insert(estatisticasJogo)
        .values({
          jogoId,
          jogadorId,
          pontos: valorNoJogo('PONTOS'),
          rebotesTotal: valorNoJogo('REBOTES'),
          assistencias: valorNoJogo('ASSISTENCIAS'),
          minutos: '30.00',
        })
        .onConflictDoNothing()
    }
  }

  // 4 · Rodada de hoje.
  //     Os horários são ancorados no INÍCIO do dia de referência, nunca em
  //     `agora + N horas`: com o seed rodando às 22h UTC, "+3h" cairia no dia
  //     seguinte e o time inteiro sumiria da rodada sem aviso. É a mesma
  //     armadilha de fuso que o runbook de ingestão descreve.
  const inicioDoDia = intervaloDoDia(dataReferencia, fuso).inicio.getTime()
  const hora = (h: number) => new Date(inicioDoDia + h * 60 * 60_000)

  const jogosDeHoje = new Map<string, string>()
  for (const [indice, [casa, visitante]] of CONFRONTOS.entries()) {
    // O primeiro confronto é o que está AO VIVO no 1º quarto; os outros ainda
    // não começaram. É o que dá à demo um Fire Live e uma Lista Secreta ao
    // mesmo tempo.
    const aoVivo = indice === 0
    const jogoId = await criarJogo(casa, visitante, hora(20 + indice), dataReferencia, {
      status: aoVivo ? 'AO_VIVO' : 'AGENDADO',
      quartoAtual: aoVivo ? ruleset.fire_live.quarto : null,
    })
    if (jogoId !== null) jogosDeHoje.set(`${casa}|${visitante}`, jogoId)
  }

  const jogoAoVivo = jogosDeHoje.get('OKC|DEN') ?? null
  const jogoOpd = jogosDeHoje.get('LAL|PHI') ?? null

  // Luka FORA — o exemplo literal da OPD no documento do CJ.
  const lukaId = jaExistentes.get('Luka Doncic')
  if (jogoOpd && lukaId) {
    await db
      .insert(lesoesEscalacao)
      .values({ jogoId: jogoOpd, jogadorId: lukaId, status: 'FORA', motivo: 'demonstração', confirmado: true })
      .onConflictDoUpdate({
        target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
        set: { status: 'FORA' },
      })
  }

  // 1º quarto ao vivo — o elenco INTEIRO dos dois times, não só o protagonista.
  // Com uma linha só, a tela do Fire Live abria com um card solitário e a
  // trava de alvo mínimo do ruleset nunca aparecia em ação.
  if (jogoAoVivo !== null) {
    const quarto = ruleset.fire_live.quarto
    const quartos = ruleset.fire_live.quartos_por_jogo
    // Placar do jogo ao vivo: nada digitado — é a SOMA dos pontos do 1º
    // quarto que o laço abaixo já está gravando. OKC é a casa do confronto
    // (CONFRONTOS[0] = ['OKC', 'DEN']).
    let pontosOkc = 0
    let pontosDen = 0

    for (const j of analise.jogadores) {
      if (j.timeSigla !== 'OKC' && j.timeSigla !== 'DEN') continue
      const jogadorId = jaExistentes.get(j.nomeNaLista)
      if (jogadorId === undefined) continue

      const m = mediaDe(j.nomeNaLista, j.nivel)
      const derivados = niveisDoJogador(j.nomeNaLista, j.nivel)
      // Um quarto é um quarto do jogo: a média dividida pelos quartos é o
      // desempenho neutro. A variação vem do mesmo gerador do histórico.
      const noQuarto = (media: number, atributo: Atributo): number => {
        const sequencia = historicoOscilacao(media / quartos, 1, 0, {
          variacao: `1Q|${j.nomeNaLista}|${atributo}`,
        })
        return Math.max(0, sequencia[0] ?? Math.round(media / quartos))
      }

      // O protagonista cruza os 75% da média (modo fire) E o primeiro marco de
      // green — os dois números saem do ruleset, nenhum é digitado aqui.
      const primeiroMarco = marcosDoNivel(derivados.PONTOS, 'PONTOS', ruleset)[0]
      const pontos =
        j.nomeNaLista === 'Shai'
          ? Math.max(
              Math.ceil(m.ppg * ruleset.fire_live.modo_fire.percentual_media),
              primeiroMarco ?? 0,
            )
          : noQuarto(m.ppg, 'PONTOS')

      const valores = {
        pontos,
        rebotes: noQuarto(m.rpg, 'REBOTES'),
        assistencias: noQuarto(m.apg, 'ASSISTENCIAS'),
      }

      await db
        .insert(estatisticasQuarto)
        .values({ jogoId: jogoAoVivo, jogadorId, quarto, ...valores })
        .onConflictDoUpdate({
          target: [estatisticasQuarto.jogoId, estatisticasQuarto.jogadorId, estatisticasQuarto.quarto],
          set: valores,
        })

      if (j.timeSigla === 'OKC') pontosOkc += valores.pontos
      else pontosDen += valores.pontos
    }

    await db
      .update(jogos)
      .set({ placarCasa: pontosOkc, placarVisitante: pontosDen })
      .where(eq(jogos.id, jogoAoVivo))

    await db
      .insert(fireLiveExecucoes)
      .values({ jogoId: jogoAoVivo, iniciadoEm: agora })
      .onConflictDoNothing()
  }

  // 5 · O MOTOR calcula. Nada abaixo desta linha escreve apito à mão.
  const publicacao = await publicarListaSecreta(db, ruleset, {
    dataReferencia,
    agora,
    ignorarAntecedencia: true,
  })

  let apitosFireLive = 0
  if (jogoAoVivo) {
    const ciclo = await executarCiclo(db, ruleset, new FilaEmMemoria(), {
      jogoId: jogoAoVivo,
      estadoAnterior: null,
      iniciadoEm: agora,
      agora,
    })
    if (!ciclo.encerrar) apitosFireLive = ciclo.apitosNovos
  }

  // 5b · Rodadas ENCERRADAS. A aba de Resultados confere apito contra box
  //      score, e só existe apito onde a lista foi publicada. Publicar um dia
  //      que já passou usa exatamente o mesmo caminho do dia de hoje: o motor
  //      recebe a data como fato e não sabe que ela é passado.
  //
  //      Três dias, não seis: publicar D-4 em diante daria sequências de
  //      oscilação truncadas pelo fim do histórico, e a tela mostraria níveis
  //      que caem por falta de dado em vez de por comportamento do jogador.
  const DIAS_CONFERIVEIS = 3
  let rodadasPublicadas = 0
  for (let i = 1; i <= DIAS_CONFERIVEIS; i++) {
    const dia = new Date(agora.getTime() - i * 24 * 60 * 60_000)
    const publicacaoPassada = await publicarListaSecreta(db, ruleset, {
      dataReferencia: somarDias(dataReferencia, -i),
      agora: dia,
      ignorarAntecedencia: true,
    })
    if (publicacaoPassada.publicou) rodadasPublicadas += 1
  }

  // 6 · Odds. Só depois da lista publicada — a cotação é POR LINHA, e quem
  //     decide quais linhas existem é o motor.
  const linhasComOdd = await semearOdds(db, ruleset, dataReferencia, agora)

  const contarJogosHoje = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(eq(jogos.dataReferencia, dataReferencia))

  return {
    times: timePorSigla.size,
    jogadores: jaExistentes.size,
    versaoNiveis: relatorio.versao,
    jogosHoje: contarJogosHoje.length,
    itensListaSecreta: publicacao.publicou ? publicacao.itens : 0,
    apitosFireLive,
    linhasComOdd,
    rodadasPublicadas,
  }
}

/**
 * CASAS DE APOSTA DA DEMONSTRAÇÃO — nomes fictícios de propósito.
 *
 * Usar "Bet365" ou "Betano" numa tela de apresentação insinua um contrato que
 * não existe (G4 continua aberto). Nomes neutros deixam claro que a integração
 * é a arquitetura, não o parceiro.
 */
const CASAS_DEMO = ['Casa Alfa', 'Casa Beta', 'Casa Gama'] as const

/**
 * Escreve cotações e deixa a agregação REAL do motor produzir a faixa.
 *
 * O documento do CJ é explícito: a plataforma não tem acesso à odd exata da
 * casa do usuário e trabalha com uma aproximação. Por isso as três casas
 * discordam entre si dentro da faixa de referência do ruleset — é a discordância
 * que dá sentido à mediana, e é a mediana que a tela mostra.
 */
async function semearOdds(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  agora: Date,
): Promise<number> {
  const feed = await lerFeed(db, dataReferencia)
  if (feed === null) return 0

  for (const nome of CASAS_DEMO) {
    await db
      .insert(casas)
      .values({ nome, tipoApi: 'demo', ativa: true })
      .onConflictDoNothing({ target: casas.nome })
  }
  const idPorCasa = new Map((await db.select().from(casas)).map((c) => [c.nome, c.id] as const))

  // `odds_snapshot` é série temporal e não tem UNIQUE — reexecutar o seed
  // empilharia cotação em cima de cotação. Limpar o dia antes de escrever é o
  // que mantém a promessa de idempotência do seed.
  const idsDeHoje = [...new Set(feed.conteudo.itens.map((i) => i.jogoId))]
  if (idsDeHoje.length > 0) {
    await db.delete(oddsSnapshot).where(inArray(oddsSnapshot.jogoId, idsDeHoje))
  }

  let linhas = 0
  for (const item of feed.conteudo.itens) {
    if (item.linha === null) continue

    const referencia = faixaEstatica(item.nivelJogador, item.atributo, item.linha, ruleset)
    if (referencia === undefined) continue

    // Espalha as casas DENTRO da faixa de referência, em passos iguais. Sem
    // sorteio: reexecutar o seed precisa dar a mesma odd.
    const [min, max] = referencia
    const passo = (max - min) / (CASAS_DEMO.length + 1)
    const cotacoes = CASAS_DEMO.map((casa, k) => ({
      casa,
      oddOver: Math.round((min + passo * (k + 1)) * 100) / 100,
    }))

    for (const c of cotacoes) {
      const casaId = idPorCasa.get(c.casa)
      if (!casaId) continue
      await db.insert(oddsSnapshot).values({
        casaId,
        jogoId: item.jogoId,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha.toFixed(1),
        oddOver: c.oddOver.toFixed(3),
        oddUnder: null,
        capturadoEm: agora,
      })
    }

    const faixa = agregar(cotacoes, item.nivelJogador, item.atributo, item.linha, ruleset)
    if (faixa === null) continue

    await db
      .insert(oddsAgregada)
      .values({
        jogoId: item.jogoId,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha.toFixed(1),
        oddMin: faixa.min.toFixed(3),
        oddMax: faixa.max.toFixed(3),
        oddMediana: faixa.mediana.toFixed(3),
        qtdCasas: faixa.qtdCasas,
        origem: faixa.origem,
        calculadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [oddsAgregada.jogoId, oddsAgregada.jogadorId, oddsAgregada.atributo, oddsAgregada.linha],
        set: {
          oddMin: faixa.min.toFixed(3),
          oddMax: faixa.max.toFixed(3),
          oddMediana: faixa.mediana.toFixed(3),
          qtdCasas: faixa.qtdCasas,
          origem: faixa.origem,
          calculadoEm: agora,
        },
      })
    linhas += 1
  }

  return linhas
}

/**
 * Desfaz a demonstração. Apaga SOMENTE domínio: contas, sessões, assinaturas e
 * inscrições de push ficam intactas — quem testou o login não perde o acesso.
 */
export async function limparDemo(db: Db): Promise<Record<string, number>> {
  const { apitos, greens, feedSnapshot, niveisVersao, identidadesJogador, identidadesJogo } =
    await import('../../dominio/db/schema')

  const contagens: Record<string, number> = {}
  const apagar = async (nome: string, fn: () => Promise<unknown>) => {
    const antes = await fn()
    contagens[nome] = Array.isArray(antes) ? antes.length : 0
  }

  await apagar('odds_agregada', () => db.delete(oddsAgregada).returning({ id: oddsAgregada.id }))
  await apagar('odds_snapshot', () => db.delete(oddsSnapshot).returning({ id: oddsSnapshot.id }))
  await apagar('feed_snapshot', () => db.delete(feedSnapshot).returning({ id: feedSnapshot.id }))
  await apagar('greens', () => db.delete(greens).returning({ id: greens.id }))
  await apagar('apitos', () => db.delete(apitos).returning({ id: apitos.id }))
  await apagar('fire_live_execucoes', () =>
    db.delete(fireLiveExecucoes).returning({ id: fireLiveExecucoes.id }),
  )
  await apagar('estatisticas_quarto', () =>
    db.delete(estatisticasQuarto).returning({ id: estatisticasQuarto.id }),
  )
  await apagar('estatisticas_jogo', () =>
    db.delete(estatisticasJogo).returning({ id: estatisticasJogo.id }),
  )
  await apagar('lesoes_escalacao', () =>
    db.delete(lesoesEscalacao).returning({ id: lesoesEscalacao.id }),
  )
  await apagar('medias_jogador', () => db.delete(mediasJogador).returning({ id: mediasJogador.id }))
  await apagar('niveis', () => db.delete(niveis).returning({ id: niveis.id }))
  await apagar('niveis_versao', () => db.delete(niveisVersao).returning({ id: niveisVersao.id }))
  await apagar('identidades_jogo', () =>
    db.delete(identidadesJogo).returning({ id: identidadesJogo.id }),
  )
  await apagar('identidades_jogador', () =>
    db.delete(identidadesJogador).returning({ id: identidadesJogador.id }),
  )
  await apagar('mapa_jogadores', () => db.delete(mapaJogadores).returning({ id: mapaJogadores.id }))
  await apagar('jogos', () => db.delete(jogos).returning({ id: jogos.id }))
  await apagar('jogadores', () => db.delete(jogadores).returning({ id: jogadores.id }))
  await apagar('times', () => db.delete(times).returning({ id: times.id }))
  await apagar('casas', () => db.delete(casas).returning({ id: casas.id }))

  return contagens
}
