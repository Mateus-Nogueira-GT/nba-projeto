import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'

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
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { lerFeed, publicarListaSecreta } from '../../entrega/lista-secreta'
import { deltaOscilacao, faixaEstatica, marcosDoNivel } from '../../motor/atributos'
import { agregar } from '../../motor/odds/agregar'
import type { Ruleset } from '../../motor/ruleset/schema'
import { ATRIBUTOS } from '../../motor/tipos'
import type { Atributo } from '../../motor/tipos'
import type { PortaLLM } from '../llm'
import { lerListaDeNiveis } from '../niveis/parser'
import { importarListaDeNiveis } from '../niveis/importar'
import { boxComplementar, decomporPontos, historicoOscilacao, mediaDe, naFaixa, niveisDoJogador, posicaoDe } from './dados'

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
  /** Jogos encerrados que ganharam placar derivado. */
  placares: number
  /** Times com campanha na tabela de classificação. */
  classificados: number
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
        // `criarJogo`). Sem sobrescrever, um jogo que foi o AO VIVO parcial
        // de ontem ficaria preso no box PARCIAL de ontem depois de virar
        // ENCERRADO hoje (achado da revisão, motivado pelo box parcial que o
        // bloco "1º quarto ao vivo", abaixo, passou a gravar).
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

      // BOX PARCIAL DA TELA DE PARTIDA — mesma fonte que acabou de gravar em
      // `estatisticas_quarto` (`valores`, acima), nunca recalculado: se os
      // dois discordassem, a tela de partida contradiria a própria tela que
      // motivou o refresh de 30s. Antes desta linha a tela lia
      // `estatisticas_jogo`, que o jogo AO VIVO nunca escrevia, e o jogo em
      // destaque da demo caía sempre em "Box score em atualização" (achado
      // da revisão). `minutos` é fração de quarto — os outros jogos do seed
      // usam `'30.00'` (jogo inteiro, mais abaixo); dar isso aqui diria que
      // a partida já acabou.
      const minutosParciais = naFaixa(j.nomeNaLista, '1q-min', [4, 11])
      const valoresBox = {
        pontos: valores.pontos,
        rebotesTotal: valores.rebotes,
        assistencias: valores.assistencias,
        minutos: minutosParciais.toFixed(2),
        ...decomporPontos(valores.pontos),
        ...boxComplementar(`${j.nomeNaLista}|1Q`, valores.rebotes),
      }
      await db
        .insert(estatisticasJogo)
        .values({ jogoId: jogoAoVivo, jogadorId, ...valoresBox })
        .onConflictDoUpdate({
          target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
          set: valoresBox,
        })

      if (j.timeSigla === 'OKC') pontosOkc += valores.pontos
      else pontosDen += valores.pontos
    }

    await db
      .update(jogos)
      .set({ placarCasa: pontosOkc, placarVisitante: pontosDen })
      .where(eq(jogos.id, jogoAoVivo))

    // BOX DO TIME, só o 1º quarto — o único que já aconteceu. Espalhar o
    // placar pelos quatro quartos (como `quartosDoTotal` faz para jogos
    // ENCERRADOS, mais abaixo) inventaria pontos em quartos que ainda não
    // existem. Sem isto a Tela de Partida não tinha "Pontos por quarto" nem
    // TOT para o jogo ao vivo em destaque da demo (achado da revisão).
    for (const [sigla, pontosTime] of [
      ['OKC', pontosOkc],
      ['DEN', pontosDen],
    ] as const) {
      const timeId = idDoTime(sigla)
      if (!timeId) continue
      // A coluna sai do MESMO `quarto` que `estatisticas_quarto` acabou de
      // receber — hoje o ruleset diz 1 e sempre dirá (Fire Live é só o 1º
      // quarto), mas escrever `pontosQ1` à mão faria as duas tabelas
      // discordarem em silêncio se esse número um dia mudasse.
      const valoresTime = {
        pontos: pontosTime,
        pontosQ1: quarto === 1 ? pontosTime : 0,
        pontosQ2: quarto === 2 ? pontosTime : 0,
        pontosQ3: quarto === 3 ? pontosTime : 0,
        pontosQ4: quarto === 4 ? pontosTime : 0,
        pontosProrrogacao: 0,
      }
      await db
        .insert(estatisticasTimeJogo)
        .values({ jogoId: jogoAoVivo, timeId, ...valoresTime })
        .onConflictDoUpdate({
          target: [estatisticasTimeJogo.jogoId, estatisticasTimeJogo.timeId],
          set: valoresTime,
        })
    }

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

  // 6d · BOX SCORE DO TIME, quarto a quarto, dos jogos ENCERRADOS — sem ele a
  //      Tela de Partida (estilo Sofascore) não tem "Pontos por quarto" para
  //      nenhum jogo passado. Depende do placar acima já estar gravado.
  await semearBoxScorePorQuarto(db)

  // 7 · Classificação da temporada — a campanha que a tela do TIME mostra
  //     (posição, vitórias, derrotas, sequência). Sem ela o cliente abre o
  //     time e encontra um cabeçalho sem campanha. Derivada dos jogos
  //     encerrados que a demo já criou; nada digitado.
  const classificados = await semearClassificacao(db, ruleset, dataReferencia)

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
    placares,
    classificados,
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
        // Na demo a média acompanha a mediana — o suficiente para o rodapé
        // ODD MÉDIA do card existir na apresentação.
        oddMedia: faixa.mediana.toFixed(3),
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
 * PLACAR DOS JOGOS ENCERRADOS — derivado, nunca digitado.
 *
 * Soma os pontos que cada elenco fez no jogo (o vínculo jogador↔time é o da
 * LISTA do CJ, versão ativa — nunca `jogadores.time_id`, que é o time real do
 * provedor). Placar baixo é esperado: a lista do CJ tem ~8 jogadores por time,
 * não os 15 do elenco inteiro.
 */
async function semearPlacares(db: Db): Promise<number> {
  const resultado = await db.execute(sql`
    with pontos_por_time as (
      select ej.jogo_id, n.time_id, sum(ej.pontos)::int as pontos
      from estatisticas_jogo ej
      join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
      join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
      group by 1, 2
    )
    update jogos j
       set placar_casa = casa.pontos,
           placar_visitante = fora.pontos
      from pontos_por_time casa, pontos_por_time fora
     where j.status = 'ENCERRADO'
       and casa.jogo_id = j.id and casa.time_id = j.time_casa_id
       and fora.jogo_id = j.id and fora.time_id = j.time_visitante_id
    returning j.id
  `)
  const linhas = Array.isArray(resultado)
    ? (resultado as unknown[])
    : ((resultado as { rows?: unknown[] }).rows ?? [])
  return linhas.length
}

/** Divide um total de pontos em 4 quartos que somam exatamente esse total. */
function quartosDoTotal(total: number): { q1: number; q2: number; q3: number; q4: number } {
  const base = Math.floor(total / 4)
  const resto = total % 4
  // Sem sorteio: reexecutar o seed precisa dar sempre a mesma divisão.
  return {
    q1: base + (resto > 0 ? 1 : 0),
    q2: base + (resto > 1 ? 1 : 0),
    q3: base + (resto > 2 ? 1 : 0),
    q4: base,
  }
}

/**
 * BOX SCORE DO TIME, QUARTO A QUARTO, DOS JOGOS ENCERRADOS — derivado do
 * placar (acima), nunca digitado.
 *
 * `estatisticas_time_jogo` é a tabela que a Tela de Partida (estilo
 * Sofascore) lê para "Pontos por quarto" — sem uma linha por lado aqui, o
 * placar do jogo aparece mas a quebra por quarto não. A divisão entre os
 * quartos é só de demonstração (o número real vem do provedor em produção,
 * `ingestao/sincronizar/partida.ts`); o que importa é que a SOMA fecha com o
 * placar — um box score que não fecha é pior que nenhum, porque parece dado
 * errado em vez de ausência de dado.
 *
 * Só cobre jogos ENCERRADOS: um jogo AO VIVO só tem o 1º quarto disputado, e
 * espalhar o placar parcial pelos quatro quartos inventaria pontos em
 * quartos que ainda não aconteceram.
 *
 * PROVENIÊNCIA (achado da revisão da Task 3/4): os totais que esta função
 * divide em quartos vêm de `jogos.placar*`, que `semearPlacares` (acima)
 * calcula agrupando `estatisticas_jogo` por `niveis.time_id` — a lista
 * CURADA do CJ, não `jogadores.time_id`. O resto deste arquivo é explícito
 * sobre nunca tratar a lista curada como o time real (CLAUDE.md, "armadilhas
 * conhecidas"); aqui isso fica invisível só porque a demo mantém as duas em
 * espelho. Mesma limitação documentada em `telaDoJogo`
 * (`entrega/estatisticas/jogo.ts`, `montarLado`), que tem o problema
 * equivalente em produção e não pode ser corrigida sem uma coluna `time_id`
 * em `estatisticas_jogo` (ver docs/specs/README.md, tabela "Perguntas que
 * bloqueiam", Spec 01).
 *
 * DUPLICATA ENTRE BRANCHES (achado da revisão): o PR #7, ainda aberto, já
 * tem uma função equivalente, `semearBoxScoreDoTime`, com implementação
 * diferente desta. O merge entre as duas branches precisa escolher uma —
 * não são a mesma função por acaso, são a mesma necessidade resolvida duas
 * vezes em paralelo.
 */
async function semearBoxScorePorQuarto(db: Db): Promise<number> {
  const encerrados = await db
    .select()
    .from(jogos)
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        isNotNull(jogos.placarCasa),
        isNotNull(jogos.placarVisitante),
      ),
    )

  let linhas = 0
  for (const jogo of encerrados) {
    const lados = [
      { timeId: jogo.timeCasaId, pontos: jogo.placarCasa! },
      { timeId: jogo.timeVisitanteId, pontos: jogo.placarVisitante! },
    ]
    for (const lado of lados) {
      const q = quartosDoTotal(lado.pontos)
      const valores = {
        pontos: lado.pontos,
        pontosQ1: q.q1,
        pontosQ2: q.q2,
        pontosQ3: q.q3,
        pontosQ4: q.q4,
        pontosProrrogacao: 0,
      }
      await db
        .insert(estatisticasTimeJogo)
        .values({ jogoId: jogo.id, timeId: lado.timeId, ...valores })
        .onConflictDoUpdate({
          target: [estatisticasTimeJogo.jogoId, estatisticasTimeJogo.timeId],
          set: valores,
        })
      linhas += 1
    }
  }
  return linhas
}

/**
 * CLASSIFICAÇÃO DA DEMONSTRAÇÃO — derivada, nunca digitada.
 *
 * Conta vitórias e derrotas a partir dos jogos ENCERRADOS que a própria demo
 * semeou (placar de casa × visitante) e ordena por aproveitamento dentro de
 * cada conferência. Reexecutável: o upsert recalcula.
 */
async function semearClassificacao(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
): Promise<number> {
  const temporada = temporadaDe(
    intervaloDoDia(dataReferencia, ruleset.rodada.fuso).inicio,
    calendarioDoRuleset(ruleset),
  )

  const encerrados = await db
    .select()
    .from(jogos)
    .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))

  const campanha = new Map<string, { v: number; d: number; sequencia: string[] }>()
  const anotar = (timeId: string, venceu: boolean) => {
    const atual = campanha.get(timeId) ?? { v: 0, d: 0, sequencia: [] }
    if (venceu) atual.v += 1
    else atual.d += 1
    atual.sequencia.push(venceu ? 'V' : 'D')
    campanha.set(timeId, atual)
  }
  for (const j of encerrados) {
    if (j.placarCasa === null || j.placarVisitante === null) continue
    const casaVenceu = j.placarCasa > j.placarVisitante
    anotar(j.timeCasaId, casaVenceu)
    anotar(j.timeVisitanteId, !casaVenceu)
  }
  if (campanha.size === 0) return 0

  const listaTimes = await db.select().from(times)
  const conferenciaPorTime = new Map(listaTimes.map((t) => [t.id, t.conferencia] as const))

  const ordenados = [...campanha.entries()]
    .map(([timeId, c]) => ({
      timeId,
      ...c,
      aproveitamento: c.v + c.d === 0 ? 0 : c.v / (c.v + c.d),
      conferencia: conferenciaPorTime.get(timeId) ?? null,
    }))
    .sort((a, b) => b.aproveitamento - a.aproveitamento)

  // Posição é POR CONFERÊNCIA, como a NBA classifica.
  const proximaPosicao = new Map<string, number>()
  for (const time of ordenados) {
    const chave = time.conferencia ?? 'LIGA'
    const posicao = (proximaPosicao.get(chave) ?? 0) + 1
    proximaPosicao.set(chave, posicao)

    // A sequência é o rabo da campanha: "V3" = três vitórias seguidas.
    const ultimos = [...time.sequencia].reverse()
    const marca = ultimos[0] ?? 'V'
    let seguidas = 0
    for (const r of ultimos) {
      if (r !== marca) break
      seguidas += 1
    }

    await db
      .insert(classificacao)
      .values({
        temporada,
        timeId: time.timeId,
        conferencia: time.conferencia,
        vitorias: time.v,
        derrotas: time.d,
        posicao,
        aproveitamento: time.aproveitamento.toFixed(3),
        sequencia: `${marca}${seguidas}`,
        capturadoEm: new Date(0),
      })
      .onConflictDoUpdate({
        target: [classificacao.temporada, classificacao.timeId],
        set: {
          vitorias: time.v,
          derrotas: time.d,
          posicao,
          aproveitamento: time.aproveitamento.toFixed(3),
          sequencia: `${marca}${seguidas}`,
        },
      })
  }
  return ordenados.length
}

