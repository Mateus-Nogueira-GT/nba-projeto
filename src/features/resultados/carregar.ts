import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { greens as tabelaGreens, jogos as tabelaJogos } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { estadoDoCiclo, type EstadoDoCiclo } from '@/modules/entrega/lista-por-jogo'
import {
  conferirFireLive,
  diasDaTemporada,
  filtrarRecapDaNoite,
  filtrosResultadosDaUrl,
  greensDoDia,
  recapDaNoite,
  recapDosCards,
  rotaResultados,
  ultimaRodadaConferida,
  type FiltrosResultados,
  type GreenDoDia,
  type JogadorConferido,
  type JogoEncerradoResumo,
  type RecapDaNoite,
  type ResultadoFireLive,
  type TaxaDaTemporada,
} from '@/modules/entrega/resultados'
import {
  fireLiveRetroativo,
  greensRetroativosDoDia,
  recapRetroativo,
} from '@/modules/entrega/retroativo/leitura'
import { temporadaDaTela } from '@/modules/entrega/retroativo/temporada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { Ruleset } from '@/modules/motor/ruleset/schema'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { placarCacheado } from '@/app/_cache/placar'
import { feedRetroativoCacheado, temporadaAnteriorComDados } from '@/app/_cache/retroativo'
import {
  taxaDaTemporadaCacheada,
  taxaRetroativaCacheada,
  temporadasDaTelaCacheadas,
  type TemporadasDaTela,
} from '@/app/_cache/temporada'

type Params = Record<string, string | string[] | undefined>

/** Rótulo de calendário que existe de verdade: 2026-02-31 não é uma rodada. */
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const instante = new Date(`${data}T12:00:00.000Z`)
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === data
}

/** Os filtros sem a temporada: no caminho de hoje ela não existe, e nenhum link a carrega. */
const semTemporada = (f: FiltrosResultados): FiltrosResultados => ({ ...f, temporada: undefined })

/**
 * `/resultados` é um ATALHO para a última rodada com conferência. O destino é
 * a noite que TERMINOU; sem nenhuma, a rodada de hoje. O dia é o da RODADA, no
 * fuso do ruleset — nunca o UTC do servidor.
 */
export async function destinoDosResultados(params: Params): Promise<string> {
  const filtrosDaUrl = semTemporada(filtrosResultadosDaUrl(params))
  const ruleset = await rulesetAtivo()
  const agora = new Date()
  const hoje = dataDeReferencia(agora, ruleset.rodada.fuso)
  if (!process.env.DATABASE_URL) return rotaResultados(hoje, filtrosDaUrl)
  // Temporada anterior (a escolhida no seletor, ou o padrão no HIATO): a
  // última rodada DELA. Sem dado retroativo, o atalho é o de sempre.
  const temporadas = await temporadasDaTelaCacheadas(ruleset, agora)
  const escolha = temporadaDaTela(params.temporada, temporadas)
  const anterior = await temporadaAnteriorComDados(escolha.temporada, temporadas.doCalendario)
  if (anterior) return rotaResultados(anterior.datas.at(-1)!, { ...filtrosDaUrl, temporada: anterior.temporada })
  const ultima = await ultimaRodadaConferida(getDb(), hoje)
  return rotaResultados(ultima ?? hoje, filtrosDoCalendario(filtrosDaUrl, escolha, temporadas.doCalendario))
}

/**
 * No caminho de hoje a temporada só fica nos links quando a pessoa ESCOLHEU a
 * do calendário no seletor: sem isso, no hiato, o primeiro filtro devolveria
 * a tela para a temporada anterior. Sem escolha (ou com lixo), ela some.
 */
function filtrosDoCalendario(
  filtros: FiltrosResultados,
  escolha: { temporada: string; escolhida: boolean },
  doCalendario: string,
): FiltrosResultados {
  return escolha.escolhida && escolha.temporada === doCalendario
    ? { ...filtros, temporada: doCalendario }
    : semTemporada(filtros)
}

export type CardConferido = {
  card: JogadorConferido
  /** A metade PRÉ-LIVE do card: posição, média, odd e a fileira dos últimos jogos. */
  item: ItemFeed | null
  adversario: { sigla: string; emCasa: boolean } | null
  /** Fileira antigo → recente; conferido e jogou, termina no jogo desta rodada. */
  ultimos: { valor: number; bateu: boolean }[]
  destacarUltimo: boolean
}

export type JogoDaNoite = {
  jogo: JogoEncerradoResumo
  estado: EstadoDoCiclo
  conferido: boolean
  cards: CardConferido[]
}

import { DIAS_DO_PLACAR, montarPlacar, type PlacarDoNip } from './placar'

/**
 * A janela do placar termina na rodada em tela. Numa rodada do começo do
 * calendário (`/resultados/0001-01-01`, que é data válida) o início dela cai
 * no ano 0, que o Postgres recusa — e a tela inteira virava 500. Sem janela
 * possível, o placar é vazio (a seção não aparece), como numa rodada sem
 * conferência.
 */
const janelaDoPlacarExiste = (data: string) => somarDias(data, -DIAS_DO_PLACAR) >= '0001-01-01'
export type { LinhaDoPlacar, PlacarDoNip } from './placar'

export type DadosDosResultados = {
  placar: PlacarDoNip
  data: string
  hoje: string
  fuso: string
  filtros: FiltrosResultados
  filtrado: boolean
  /** null só na temporada anterior, antes da primeira data dela. */
  anterior: string | null
  proxima: string | null
  vazio: boolean
  mostrarLista: boolean
  mostrarFire: boolean
  recap: RecapDaNoite
  emCurso: boolean
  /**
   * Plano grátis: há apito da rodada em jogo que ainda não TERMINOU, e ele
   * ficou fora da tela (decisão de 24/09). A tela usa isto para explicar um
   * vazio sem dizer que não há lista — porque há.
   */
  jogosPorEncerrar: boolean
  temporada: TaxaDaTemporada
  apitoDaNoite: { card: JogadorConferido; jogo: JogoEncerradoResumo | null } | null
  jogos: JogoDaNoite[]
  fire: ResultadoFireLive[]
  greens: GreenDoDia[]
  times: { id: string; sigla: string }[]
  /** O seletor "2025-26 | 2026-27": a temporada em tela e as que existem. */
  seletor: { temporada: string; temporadas: string[] }
  /**
   * A tela é da TEMPORADA ANTERIOR (spec 25/09): a metodologia aplicada a
   * posteriori, sem odd e sem Placar do NIP, e a tela diz isso.
   */
  retroativo: boolean
  /** A Lista do mesmo dia: a de hoje, ou a daquela data na temporada anterior. */
  listaDoDia: string
}

/**
 * Contra quem o apitado jogou E de que lado. O time é o da LISTA DO CJ
 * (`JogadorConferido.timeId`), comparado por ID com os dois lados do jogo —
 * nunca o time real do provedor: com elenco projetado, ele não casa com lado
 * nenhum, e quando é justamente o adversário daquela noite o mando inverte.
 */
function adversarioDe(jogo: JogoEncerradoResumo, timeId: string | null) {
  if (timeId === null) return null
  if (timeId === jogo.casaId) return { sigla: jogo.visitanteSigla, emCasa: true }
  if (timeId === jogo.visitanteId) return { sigla: jogo.casaSigla, emCasa: false }
  return null
}

/**
 * Dentro do jogo: quem bateu primeiro, quem não bateu depois, quem não jogou
 * por último. Antes do fim não há veredito, e a ordem é a do sinal.
 */
function ordenarCards(cards: JogadorConferido[], conferido: boolean): JogadorConferido[] {
  const veredito = (c: JogadorConferido) =>
    !conferido ? 0 : c.bateuLinhaMaisBaixa === true ? 0 : c.bateuLinhaMaisBaixa === false ? 1 : 2
  return [...cards].sort(
    (a, b) => veredito(a) - veredito(b) || b.nivelApito - a.nivelApito || a.nome.localeCompare(b.nome),
  )
}

/**
 * O CORTE DO PLANO GRÁTIS (decisão do parceiro, 24/09): em Resultados, o
 * grátis só vê jogo que TERMINOU.
 *
 * A decisão 9 (15/09) deixou a tela inteira para todo nível porque "vaza o
 * sinal com um dia de atraso" — mas `/resultados/<hoje>` existe, e nela o
 * card pré-jogo É o sinal, com nome, linha e odd, horas antes da bola subir
 * (spec 23/09, I1: nenhum item do feed no HTML do grátis). O corte refina a
 * decisão, não a revoga: a rodada que terminou continua inteira para o grátis.
 *
 * "Terminou" é `jogos.status = 'ENCERRADO'` — a mesma guarda de
 * `resumoDosCards`, `taxaDaTemporada` e `ultimaRodadaConferida`. O jogo em
 * andamento NÃO terminou, mesmo depois do 1º quarto; o encerrado que ainda
 * espera o box ("aguardando dado oficial") terminou, e o card dele já não
 * serve para apostar. O recap traz o status no próprio jogo, mas o Fire Live
 * e os greens não trazem nem o jogo — daí UMA consulta pelo mesmo recorte
 * deles (`data_referencia`), só para quem não assina.
 */
type JogosEncerrados = { jogos: Set<string>; greens: Set<string> }

async function jogosEncerradosDaRodada(data: string): Promise<JogosEncerrados> {
  const linhas = await getDb()
    .select({ jogoId: tabelaJogos.id, greenId: tabelaGreens.id })
    .from(tabelaJogos)
    .leftJoin(tabelaGreens, eq(tabelaGreens.jogoId, tabelaJogos.id))
    .where(and(eq(tabelaJogos.dataReferencia, data), eq(tabelaJogos.status, 'ENCERRADO')))
  return {
    jogos: new Set(linhas.map((l) => l.jogoId)),
    greens: new Set(linhas.flatMap((l) => (l.greenId === null ? [] : [l.greenId]))),
  }
}

/**
 * O recap como o grátis o vê: só os jogos que terminaram. Os três números da
 * noite (conferidos, bateram, taxa) e o apito da noite já contavam só jogo
 * ENCERRADO em `resumoDosCards` e ficam como estão; `publicados` era o único
 * que contava todos os jogos e passa a contar só o que está em tela.
 * `noiteEncerrada` continua a da rodada inteira: é ela que segura a taxa e o
 * apito da noite até o ÚLTIMO jogo acabar — recalculá-la sobre os encerrados
 * diria que a noite terminou quando o que terminou foi o recorte.
 */
function soJogosEncerrados(recap: RecapDaNoite, encerrado: (jogoId: string) => boolean): RecapDaNoite {
  const porJogo = recap.porJogo.filter((g) => encerrado(g.jogo.jogoId))
  return { ...recap, porJogo, publicados: porJogo.reduce((n, g) => n + g.cards.length, 0) }
}

export async function carregarResultados(data: string, params: Params): Promise<DadosDosResultados> {
  const filtrosDaUrl = filtrosResultadosDaUrl(params)
  // Resultados é a prova social que convence quem ainda não assina (decisão
  // 9): a guarda aqui é de LOGIN. O plano entra logo abaixo como CORTE, não
  // como portão — o grátis vê a tela, mas só o que já terminou (24/09).
  const { acesso } = await exigirNivel('GRATIS', rotaResultados(data, filtrosDaUrl))
  const assinante = atende(acesso.nivel, 'MVP')

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const agora = new Date()
  const hoje = dataDeReferencia(agora, fuso)
  // Rota inventada não vira erro nem tela vazia: volta para a rodada de hoje.
  if (!dataValida(data)) redirect(rotaResultados(hoje, semTemporada(filtrosDaUrl)))

  // A TEMPORADA ANTERIOR é aberta para todo plano (spec 25/09, decisão 6) e
  // lê só as tabelas retroativas. A escolha válida do seletor manda; sem ela
  // (ou com lixo), a DATA da rota diz a temporada — um link antigo para uma
  // noite de 2025-26 abre 2025-26, e a rodada de hoje é sempre a de hoje.
  // Data de temporada que o banco não tem cai na do calendário.
  const temporadas = await temporadasDaTelaCacheadas(ruleset, agora)
  const temporadaDaData = temporadaDe(new Date(`${data}T12:00:00.000Z`), calendarioDoRuleset(ruleset))
  const escolha = temporadaDaTela(params.temporada, temporadas)
  const temporadaDaRota = escolha.escolhida
    ? escolha.temporada
    : temporadas.disponiveis.includes(temporadaDaData)
      ? temporadaDaData
      : temporadas.doCalendario
  const anterior = await temporadaAnteriorComDados(temporadaDaRota, temporadas.doCalendario)
  const seletor = { temporada: anterior?.temporada ?? temporadas.doCalendario, temporadas: temporadas.disponiveis }
  if (anterior) {
    const filtros = semTemporada(filtrosDaUrl)
    return carregarResultadosRetroativos({ data, hoje, fuso, ruleset, filtros, anterior, seletor, temporadaDaData, temporadas })
  }
  const filtros = filtrosDoCalendario(filtrosDaUrl, escolha, temporadas.doCalendario)

  // Os agregados (temporada, placar) e o feed vêm dos caches de `_cache`: o
  // que é igual para todo visitante da mesma rodada não vai ao banco a cada
  // visita. Recap, greens e Fire Live continuam por visita, como na tela
  // antiga — a noite em curso muda a cada box.
  const [rodadaInteira, temporada, greensLidos, feed, fireLido, placar, encerrados] = await Promise.all([
    recapDaNoite(getDb(), data),
    // `ate` é EXCLUSIVO na entrega: +1 dia para a rodada em tela entrar na conta.
    taxaDaTemporadaCacheada(somarDias(data, 1), diasDaTemporada(data, calendarioDoRuleset(ruleset))),
    greensDoDia(getDb(), data),
    lerFeedCacheado(data),
    conferirFireLive(getDb(), data),
    // O placar usa `rotulo_curto ?? rotulo` das faixas (dentro do cache).
    janelaDoPlacarExiste(data)
      ? placarCacheado(somarDias(data, 1), ruleset.confianca_exibicao.faixas)
      : Promise.resolve(montarPlacar([], [])),
    // Só o grátis precisa saber quem terminou; para o assinante o corte não existe.
    assinante ? Promise.resolve(null) : jogosEncerradosDaRodada(data),
  ])
  const encerrado = (jogoId: string) => encerrados === null || encerrados.jogos.has(jogoId)
  const greenEncerrado = (id: string) => encerrados === null || encerrados.greens.has(id)

  // Primeiro os filtros da URL, depois o corte do plano: `noiteEncerrada` e
  // `emCurso` são os da rodada filtrada INTEIRA, não do que sobrou em tela.
  const recapDaRodada = filtrarRecapDaNoite(rodadaInteira, filtros)
  const recap = encerrados === null ? recapDaRodada : soJogosEncerrados(recapDaRodada, encerrado)
  const mostrarLista = filtros.estrategia !== 'FIRE_LIVE'
  const mostrarFire = filtros.estrategia !== 'LISTA_SECRETA'
  const fireDaRodada = fireLido.filter(
    (c) => (!filtros.atributo || c.atributo === filtros.atributo) && (!filtros.timeId || c.timeId === filtros.timeId),
  )
  const fire = fireDaRodada.filter((c) => encerrado(c.jogoId))
  // Os greens são marcos do 1º quarto: pertencem ao Fire Live.
  const greensDaRodada = greensLidos.filter(
    (g) =>
      mostrarFire &&
      (!filtros.atributo || g.atributo === filtros.atributo) &&
      (!filtros.timeId || g.timeId === filtros.timeId),
  )
  const greens = greensDaRodada.filter((g) => greenEncerrado(g.id))
  // O que o grátis ainda não vê, dentro do que ele pediu ver.
  const jogosPorEncerrar =
    encerrados !== null &&
    (recapDaRodada.porJogo.some((g) => !encerrado(g.jogo.jogoId)) ||
      fireDaRodada.some((c) => !encerrado(c.jogoId)) ||
      greensDaRodada.some((g) => !greenEncerrado(g.id)))
  // O filtro de time só oferece o que está em tela: o time de um apitado
  // escondido diria onde há apito hoje.
  const times = new Map(
    [
      ...rodadaInteira.porJogo.filter((g) => encerrado(g.jogo.jogoId)).flatMap((g) => g.cards),
      ...fireLido.filter((c) => encerrado(c.jogoId)),
    ]
      .filter((c) => c.timeId !== null)
      .map((c) => [c.timeId!, c.timeSigla] as const),
  )

  const emCurso = !recap.noiteEncerrada
  const apito = recap.apitoDaNoite
  return {
    placar,
    data,
    hoje,
    fuso,
    filtros,
    filtrado: Boolean(filtros.atributo || filtros.timeId),
    anterior: rotaResultados(somarDias(data, -1), filtros),
    proxima: data >= hoje ? null : rotaResultados(somarDias(data, 1), filtros),
    vazio: rodadaInteira.porJogo.length === 0 && fireLido.length === 0,
    mostrarLista,
    mostrarFire,
    recap,
    emCurso,
    jogosPorEncerrar,
    temporada,
    // Superlativo da noite inteira: só com a noite encerrada.
    apitoDaNoite:
      !emCurso && apito
        ? { card: apito, jogo: recap.porJogo.find((g) => g.jogo.jogoId === apito.jogoId)?.jogo ?? null }
        : null,
    jogos: montarJogos(recap, feed?.conteudo.itens ?? [], ruleset),
    fire,
    greens,
    times: [...times].map(([id, sigla]) => ({ id, sigla })),
    seletor,
    retroativo: false,
    listaDoDia: '/',
  }
}

/**
 * Os blocos por jogo: cada card conferido com a metade PRÉ-LIVE do item da
 * Lista (média, odd, fileira dos últimos jogos). O mesmo para a temporada de
 * hoje e para a anterior — muda só de onde vêm o recap e os itens.
 */
function montarJogos(recap: RecapDaNoite, itens: ItemFeed[], ruleset: Ruleset): JogoDaNoite[] {
  // O item do feed pela chave (jogo, jogador, atributo); entre as linhas do
  // mesmo apito vale a MAIS BAIXA, que é a que o card confere.
  const itemPorCard = new Map<string, ItemFeed>()
  for (const item of itens) {
    const chave = `${item.jogoId}|${item.jogadorId}|${item.atributo}`
    const atual = itemPorCard.get(chave)
    if (!atual || (item.linha ?? Infinity) < (atual.linha ?? Infinity)) itemPorCard.set(chave, item)
  }

  return recap.porJogo.map(({ jogo, cards }) => {
    // O estado vem do JOGO e da chegada do box oficial — nunca de o jogador
    // ter estatística: o box PARCIAL diria "não jogou" para quem entra às 22h.
    const estado = estadoDoCiclo(jogo, jogo.temBoxOficial, ruleset.fire_live.quarto)
    const conferido = estado === 'CONFERIDO'
    return {
      jogo,
      estado,
      conferido,
      cards: ordenarCards(cards, conferido).map((card) => {
        const item = itemPorCard.get(`${jogo.jogoId}|${card.jogadorId}|${card.atributo}`) ?? null
        const jogou = card.fez !== null
        // `ultimos5` chega do mais recente ao mais antigo. Conferido e jogou,
        // a fileira ganha o jogo desta rodada à direita; quem não jogou não
        // ganha barra nova. Antes do veredito, a fileira é a da Lista.
        const anteriores = [...(item?.ultimos5 ?? [])].reverse()
        const ultimos =
          conferido && jogou
            ? [...anteriores.slice(-4), { valor: card.fez!, bateu: card.bateuLinhaMaisBaixa === true }]
            : conferido
              ? []
              : anteriores
        return { card, item, adversario: adversarioDe(jogo, card.timeId), ultimos, destacarUltimo: conferido && jogou }
      }),
    }
  })
}

/**
 * RESULTADOS DA TEMPORADA ANTERIOR — a metodologia aplicada a uma temporada
 * que já acabou, lida de `apitos_retroativos`, `greens_retroativos` e
 * `feed_retroativo`. Sem corte nem portão de plano (decisão 6): nada daqui é
 * sinal para apostar hoje. Sem Placar do NIP — ele é o histórico do que foi
 * PUBLICADO, e nada daqui foi.
 */
async function carregarResultadosRetroativos({
  data,
  hoje,
  fuso,
  ruleset,
  filtros: filtrosDeHoje,
  anterior: { temporada: temporadaEscolhida, datas },
  seletor,
  temporadaDaData,
  temporadas,
}: {
  data: string
  hoje: string
  fuso: string
  ruleset: Ruleset
  filtros: FiltrosResultados
  anterior: { temporada: string; datas: string[] }
  seletor: DadosDosResultados['seletor']
  temporadaDaData: string
  temporadas: TemporadasDaTela
}): Promise<DadosDosResultados> {
  // A escolha viaja em toda seta, aba e filtro desta tela.
  const filtros = { ...filtrosDeHoje, temporada: temporadaEscolhida }
  // Defesa em profundidade: uma data da temporada do CALENDÁRIO nunca é lida
  // das tabelas retroativas por este caminho sem portão — mesmo que alguém
  // tenha rodado o script sobre ela. Ela é da temporada paga.
  const legivel = temporadaDaData !== temporadas.doCalendario
  const db = getDb()
  const [rodadaInteira, temporada, greensLidos, feed, fireLido] = await Promise.all([
    // Pela temporada E pela data: o índice das tabelas retroativas. Recap,
    // greens e Fire Live trazem `Date` e seguem por visita; a Lista, JSON
    // puro, vem do cache (`app/_cache/retroativo.ts`).
    legivel ? recapRetroativo(db, temporadaEscolhida, data) : recapDosCards(db, data, []),
    taxaRetroativaCacheada(somarDias(data, 1), diasDaTemporada(data, calendarioDoRuleset(ruleset))),
    legivel ? greensRetroativosDoDia(db, temporadaEscolhida, data) : Promise.resolve([]),
    legivel ? feedRetroativoCacheado(temporadaEscolhida, data) : Promise.resolve(null),
    legivel ? fireLiveRetroativo(db, temporadaEscolhida, data) : Promise.resolve([]),
  ])

  const recap = filtrarRecapDaNoite(rodadaInteira, filtros)
  const mostrarLista = filtros.estrategia !== 'FIRE_LIVE'
  const mostrarFire = filtros.estrategia !== 'LISTA_SECRETA'
  const fire = fireLido.filter(
    (c) => (!filtros.atributo || c.atributo === filtros.atributo) && (!filtros.timeId || c.timeId === filtros.timeId),
  )
  const greens = greensLidos.filter(
    (g) =>
      mostrarFire &&
      (!filtros.atributo || g.atributo === filtros.atributo) &&
      (!filtros.timeId || g.timeId === filtros.timeId),
  )
  const times = new Map(
    [...rodadaInteira.porJogo.flatMap((g) => g.cards), ...fireLido]
      .filter((c) => c.timeId !== null)
      .map((c) => [c.timeId!, c.timeSigla] as const),
  )
  // As setas andam pelas datas DA TEMPORADA — não pelo calendário, que tem
  // meses sem jogo no meio (o intervalo entre temporadas).
  const antes = datas.filter((d) => d < data).at(-1)
  const depois = datas.find((d) => d > data)

  const emCurso = !recap.noiteEncerrada
  const apito = recap.apitoDaNoite
  return {
    placar: montarPlacar([], []),
    data,
    hoje,
    fuso,
    filtros,
    filtrado: Boolean(filtros.atributo || filtros.timeId),
    anterior: antes === undefined ? null : rotaResultados(antes, filtros),
    proxima: depois === undefined ? null : rotaResultados(depois, filtros),
    vazio: rodadaInteira.porJogo.length === 0 && fireLido.length === 0,
    mostrarLista,
    mostrarFire,
    recap,
    emCurso,
    jogosPorEncerrar: false,
    temporada,
    apitoDaNoite:
      !emCurso && apito
        ? { card: apito, jogo: recap.porJogo.find((g) => g.jogo.jogoId === apito.jogoId)?.jogo ?? null }
        : null,
    jogos: montarJogos(recap, feed?.itens ?? [], ruleset),
    fire,
    greens,
    times: [...times].map(([id, sigla]) => ({ id, sigla })),
    seletor,
    retroativo: true,
    listaDoDia: `/?${new URLSearchParams({ temporada: temporadaEscolhida, data })}`,
  }
}
