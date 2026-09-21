import { eq, sql } from 'drizzle-orm'

import {
  casas,
  classificacao,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
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
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { publicarListaSecreta } from '../../entrega/lista-secreta'
import { deltaOscilacao } from '../../motor/atributos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import type { PortaLLM } from '../llm'
import { semearJogoAoVivo } from './ao-vivo'
import type { JogadorAoVivo } from './ao-vivo'
import { chaveDeNome, semearCadastro } from './cadastro'
import {
  boxComplementar,
  decomporPontos,
  historicoOscilacao,
  mediaDe,
  niveisDoJogador,
  rodadaDoDia,
} from './dados'
import {
  semearBoxScoreDoTime,
  semearClassificacao,
  semearPlacares,
  upsertJogoDemo,
} from './jogos'
import { semearOdds } from './odds'

// Reexportado porque `semear.ts` foi o endereço original da constante — quem
// importa daqui continua funcionando depois da extração para `./cadastro`.
export { ARQUIVO_LISTA } from './cadastro'

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
  /** Jogos encerrados que ganharam placar derivado. */
  placares: number
  /** Linhas de box score de TIME derivadas dos jogadores (2 por jogo). */
  boxScoresDeTime: number
  /** Times com campanha na tabela de classificação. */
  classificados: number
  /** Jogos encerrados empatados fora da conta — ver `semearClassificacao`. */
  empates: number
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
 *
 * `llm` é opcional e repassado tal-qual a `publicarListaSecreta` nas três
 * publicações abaixo: sem ele, quem grava o snapshot primeiro decide se
 * aquele dia terá narrativa — e como a geração só roda na TRANSIÇÃO de hash
 * (`mudou`), a demo publicando sem `llm` fixaria o hash sem narrativa, e o
 * cron de lista-secreta que rodasse depois encontraria o mesmo hash e nunca
 * chamaria a LLM. No ambiente de demonstração — sem `OPENROUTER_API_KEY` —
 * `portaLLMDoAmbiente()` devolve `LLMFake`, determinístico, exatamente o que
 * se quer numa demo.
 */
export async function semearDemo(
  db: Db,
  ruleset: Ruleset,
  agora: Date,
  llm?: PortaLLM,
): Promise<ResumoDemo> {
  // 1 · Times, jogadores, vínculo e níveis — o cadastro que os dois seeders
  //     compartilham (ver `./cadastro`).
  const {
    analise,
    timePorSigla,
    jogadorPorChave: jaExistentes,
    versaoNiveis,
  } = await semearCadastro(db, agora)

  // 2 · Médias da temporada — a MESMA que montarFatos vai consultar.
  const temporada = temporadaDe(agora, calendarioDoRuleset(ruleset))
  // Chaveado como `jaExistentes` — o laço abaixo itera as CHAVES dele.
  // FILTRO POR ATRIBUTO: o documento agora traz, além da lista de PONTOS,
  // listas de REBOTES e ASSISTÊNCIAS com o MESMO jogador em nível DIFERENTE
  // (ex.: Shai é MVP em pontos e "All star" na lista de assistências; LeBron
  // é Suporte em pontos e "All star" na de assistências). Sem este filtro, o
  // `Map` (last-write-wins) pega o nível da ÚLTIMA lista em que o nome
  // aparece no arquivo — não o de pontos — e todo o resto desta função (que
  // já se chama `nivelPontos`) passa a calcular média/delta/oscilação com o
  // nível errado. Foi o que apagava o apito do LeBron (cascata em
  // detalhe-apito.test.ts) e o modo fire do Shai.
  const nivelPorNome = new Map(
    analise.jogadores
      .filter((j) => j.atributo === 'PONTOS')
      .map((j) => [chaveDeNome(j.nomeNaLista), j.nivel] as const),
  )
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

  // O upsert pelas DUAS chaves naturais mora em `./jogos` (com o comentário
  // que explica o 23505). Aqui sobra só a tradução SIGLA → id: a fixture fala
  // em siglas, e sigla desconhecida continua significando "não criei jogo".
  const criarJogo = async (
    casa: string,
    visitante: string,
    quandoUtc: Date,
    dia: string,
    extra: { status?: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'; quartoAtual?: number | null } = {},
  ): Promise<string | null> => {
    const timeCasaId = idDoTime(casa)
    const timeVisitanteId = idDoTime(visitante)
    if (!timeCasaId || !timeVisitanteId) return null
    return upsertJogoDemo(db, {
      timeCasaId,
      timeVisitanteId,
      quandoUtc,
      dataReferencia: dia,
      ...extra,
    })
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
  //
  //     REVISADO em 21/09/2026 contra a versão do documento que trocou
  //     CLE|Strus e DEN|Watson (Randola) por CLE|Peyton Watson (Randola),
  //     DEN|Derozan, MIN|Kuminga, MIA|klay thompson, NOP|mathurin (Suporte) e
  //     LAC|Max strus (Randola): nenhum desses seis é usado abaixo, e a troca
  //     só mexeu no degrau Suporte/Randola dos seis times — não em MVP/All
  //     Star, que é de onde TODOS os protagonistas daqui vêm (Brunson, LeBron
  //     [Suporte, mas a exceção documentada acima], Curry, Shai, Tatum, Jokic,
  //     Giannis, Jamal Murray). Recasting não foi necessário; o que quebrava
  //     os testes era outro bug (ver comentário do filtro `atributo ===
  //     'PONTOS'` logo abaixo, e em `nivelPorNome`) — a próxima troca de
  //     elenco só exige revisar esta lista se mexer em MVP/All Star de OKC,
  //     DEN, LAL, PHI, GSW, BOS, NYK ou MIA (os times de hoje) ou tirar algum
  //     destes oito jogadores de quadra.
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

  // O HISTÓRICO gira os adversários (round-robin). Antes eram os mesmos quatro
  // confrontos todo dia: o GSW enfrentava o BOS sete vezes seguidas, duas com
  // placar idêntico. A rodada de HOJE segue em CONFRONTOS — ela está ancorada
  // nos exemplos do documento (OKC × DEN ao vivo, Luka fora em LAL × PHI).
  const TIMES_DA_DEMO = CONFRONTOS.flat()

  const DIAS = 6
  for (let i = 1; i <= DIAS; i++) {
    const dia = new Date(agora.getTime() - i * 24 * 60 * 60_000)
    const diaRef = somarDias(dataReferencia, -i)

    const jogoDoTime = new Map<string, string>()
    for (const [casa, visitante] of rodadaDoDia(TIMES_DA_DEMO, i)) {
      const jogoId = await criarJogo(casa, visitante, dia, diaRef, { status: 'ENCERRADO' })
      if (jogoId === null) continue
      jogoDoTime.set(casa, jogoId)
      jogoDoTime.set(visitante, jogoId)
    }

    // Mesmo motivo do filtro em `nivelPorNome`: sem ele, este laço processa o
    // MESMO jogador até três vezes (uma por lista) e a passagem da lista de
    // ASSISTÊNCIAS/REBOTES é a que grava por último (onConflictDoUpdate) —
    // com a grafia daquela lista, que pode não bater com `CENARIOS` (ex.:
    // "Lebron James" na lista de assistências vs. "LeBron James" em
    // `CENARIOS`), apagando a oscilação roteirizada com um jogo na média.
    for (const j of analise.jogadores) {
      if (j.atributo !== 'PONTOS') continue
      const nome = j.nomeNaLista
      const jogadorId = jaExistentes.get(chaveDeNome(nome))
      const jogoId = j.timeSigla === null ? undefined : jogoDoTime.get(j.timeSigla)
      if (jogadorId === undefined || jogoId === undefined) continue

      const nivelPontos = nivelPorNome.get(chaveDeNome(nome))
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

      const pontosValor = valorNoJogo('PONTOS')
      const rebotesValor = valorNoJogo('REBOTES')
      const assistenciasValor = valorNoJogo('ASSISTENCIAS')
      const valoresBox = {
        pontos: pontosValor,
        rebotesTotal: rebotesValor,
        assistencias: assistenciasValor,
        minutos: '30.00',
        // Arremessos coerentes com os pontos — sem eles, FG%/2P%/3P%/LL%
        // das telas de estatística ficariam eternamente em "—" na demo.
        ...decomporPontos(pontosValor),
        // ROU/TOC/TO/FALTAS e a divisão ofensivo/defensivo do rebote — sem
        // isto, essas colunas ficavam no default 0 da tabela para TODO
        // jogador, e a nota (que lê rebotesOf/rebotesDef, nunca
        // rebotesTotal — ver nota.ts) contradizia o REB visível na mesma
        // linha (achado da revisão). Chave por dia (`i`): mesma pessoa, jogo
        // diferente, sem repetir sempre os mesmos ROU/TOC/TO.
        ...boxComplementar(`${nome}|dia${i}`, rebotesValor),
      }

      await db
        .insert(estatisticasJogo)
        .values({ jogoId, jogadorId, ...valoresBox })
        // DoUpdate, não DoNothing: o MESMO jogoId reaparece em runs futuros
        // quando a rodada de hoje de um dia vira "i dias atrás" do dia
        // seguinte (a chave natural do jogo é `dataReferencia` — ver
        // `upsertJogoDemo`). Sem sobrescrever, um jogo que foi o AO VIVO
        // parcial de ontem ficaria preso no box PARCIAL de ontem depois de
        // virar ENCERRADO hoje (achado da revisão, motivado pelo box parcial
        // que `semearJogoAoVivo`, abaixo, passou a gravar).
        .onConflictDoUpdate({
          target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
          set: valoresBox,
        })
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
  const lukaId = jaExistentes.get(chaveDeNome('Luka Doncic'))
  if (jogoOpd && lukaId) {
    await db
      .insert(lesoesEscalacao)
      .values({ jogoId: jogoOpd, jogadorId: lukaId, status: 'FORA', motivo: 'demonstração', confirmado: true })
      .onConflictDoUpdate({
        target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
        set: { status: 'FORA' },
      })
  }

  // 1º quarto ao vivo — o bloco vive em `./ao-vivo`, parametrizado. Aqui a
  // fixture escolhe o jogo do documento (OKC × DEN) e seus protagonistas.
  // `chave: '1Q'` reproduz, caractere a caractere, a variação de sempre.
  if (jogoAoVivo !== null) {
    const timeCasaId = idDoTime('OKC')
    const timeVisitanteId = idDoTime('DEN')
    if (timeCasaId && timeVisitanteId) {
      const elenco: JogadorAoVivo[] = []
      // Mesmo filtro do laço de histórico: sem ele, um jogador do OKC/DEN que
      // também aparece na lista de rebotes ou assistências entraria duas ou
      // três vezes no elenco, com o nível daquela lista (ex.: Shai é MVP em
      // pontos e "All star" na lista de assistências) — e quem decide o
      // modo fire não pode depender de qual entrada o array processou por
      // último.
      for (const j of analise.jogadores) {
        if (j.atributo !== 'PONTOS') continue
        if (j.timeSigla !== 'OKC' && j.timeSigla !== 'DEN') continue
        const jogadorId = jaExistentes.get(chaveDeNome(j.nomeNaLista))
        if (jogadorId === undefined) continue
        elenco.push({
          nome: j.nomeNaLista,
          jogadorId,
          nivel: j.nivel,
          timeId: j.timeSigla === 'OKC' ? timeCasaId : timeVisitanteId,
        })
      }
      await semearJogoAoVivo(db, ruleset, {
        jogoId: jogoAoVivo,
        timeCasaId,
        timeVisitanteId,
        elenco,
        protagonistas: { PONTOS: 'Shai', REBOTES: 'Jokic', ASSISTENCIAS: 'Jamal Murray' },
        chave: '1Q',
        agora,
      })
    }
  }

  // 5 · O MOTOR calcula. Nada abaixo desta linha escreve apito à mão.
  const publicacao = await publicarListaSecreta(db, ruleset, {
    dataReferencia,
    agora,
    ignorarAntecedencia: true,
    llm,
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
      llm,
    })
    if (publicacaoPassada.publicou) rodadasPublicadas += 1
  }

  // 6 · Odds. Só depois da lista publicada — a cotação é POR LINHA, e quem
  //     decide quais linhas existem é o motor.
  const linhasComOdd = await semearOdds(db, ruleset, dataReferencia, agora)

  // 6b · REPUBLICA. A ordem acima é obrigatória (odd depende da linha, linha
  //      depende do motor), e o efeito colateral era o card sem odd no rodapé:
  //      o snapshot tinha sido materializado quando `odds_agregada` ainda
  //      estava vazia. Republicar traz a faixa/média para o item — o hash
  //      cobre o item inteiro, então só regrava se algo mudou de verdade.
  if (linhasComOdd > 0) {
    await publicarListaSecreta(db, ruleset, {
      dataReferencia,
      agora,
      ignorarAntecedencia: true,
      llm,
    })
  }

  // 6c · PLACAR dos jogos encerrados — derivado da soma dos pontos que o laço
  //      do histórico já gravou, por time. Sem ele, `jogos.placar_casa` fica
  //      NULL: a coluna "Resultado" do histórico do jogador mostra vazio e a
  //      classificação não tem de onde nascer.
  const placares = await semearPlacares(db)

  // 6d · BOX SCORE DO TIME — a tela de time lê `estatisticas_time_jogo`, que
  //      a demo nunca escrevia: toda partida encerrada aparecia com quartos,
  //      REB, AST e percentuais em "—". Derivado da soma dos jogadores.
  const boxScoresDeTime = await semearBoxScoreDoTime(db, agora)

  // 6e · A média da temporada nascia com `jogos: 40` fixo e o perfil anunciava
  //      "40 jogos" sobre um histórico de uma semana. Contado, não digitado.
  await corrigirJogosDisputados(db)

  // 7 · Classificação da temporada — a campanha que a tela do TIME mostra
  //     (posição, vitórias, derrotas, sequência). Sem ela o cliente abre o
  //     time e encontra um cabeçalho sem campanha. Derivada dos jogos
  //     encerrados que a demo já criou; nada digitado.
  const classificacaoSemeada = await semearClassificacao(db, ruleset, dataReferencia)

  const contarJogosHoje = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(eq(jogos.dataReferencia, dataReferencia))

  return {
    times: timePorSigla.size,
    jogadores: jaExistentes.size,
    versaoNiveis,
    jogosHoje: contarJogosHoje.length,
    itensListaSecreta: publicacao.publicou ? publicacao.itens : 0,
    apitosFireLive,
    linhasComOdd,
    rodadasPublicadas,
    placares,
    boxScoresDeTime,
    classificados: classificacaoSemeada.linhas,
    empates: classificacaoSemeada.empates,
  }
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
  // O box do TIME sempre foi apagado — a FK para `jogos` é ON DELETE CASCADE —
  // mas em silêncio: `demo:limpar` imprime as contagens desta função, e quem
  // lia a saída não via as duas linhas por jogo que sumiram. Apagar aqui não
  // muda o efeito; muda o que o operador consegue conferir.
  await apagar('estatisticas_time_jogo', () =>
    db.delete(estatisticasTimeJogo).returning({ id: estatisticasTimeJogo.id }),
  )
  await apagar('lesoes_escalacao', () =>
    db.delete(lesoesEscalacao).returning({ id: lesoesEscalacao.id }),
  )
  // A classificação referencia `times`: sem apagá-la aqui, o DELETE de times
  // abaixo quebra por chave estrangeira (o teste da demo pegou).
  await apagar('classificacao', () => db.delete(classificacao).returning({ id: classificacao.id }))
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

/**
 * JOGOS DISPUTADOS na média da temporada — derivado, nunca digitado.
 *
 * A média nascia com `jogos: 40` fixo enquanto o histórico semeado tem uma
 * semana. O perfil do jogador anunciava "Perfil da temporada · 40 jogos" e
 * logo abaixo listava 7 partidas: dois números da MESMA tela se contradizendo.
 *
 * Conta o que a demo realmente gravou. Se `DIAS` mudar, o número acompanha.
 */
async function corrigirJogosDisputados(db: Db): Promise<number> {
  const resultado = await db.execute(sql`
    update medias_jogador m
       set jogos = c.n
      from (
        select ej.jogador_id, count(*)::int as n
          from estatisticas_jogo ej
          join jogos j on j.id = ej.jogo_id and j.status = 'ENCERRADO'
         group by 1
      ) c
     where c.jogador_id = m.jogador_id
       and m.janela = 'TEMPORADA'
       and m.jogos is distinct from c.n
    returning m.id
  `)
  const linhas = Array.isArray(resultado)
    ? (resultado as unknown[])
    : ((resultado as { rows?: unknown[] }).rows ?? [])
  return linhas.length
}
