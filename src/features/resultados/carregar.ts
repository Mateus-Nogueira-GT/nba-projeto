import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { greens as tabelaGreens, jogos as tabelaJogos } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import { estadoDoCiclo, type EstadoDoCiclo } from '@/modules/entrega/lista-por-jogo'
import {
  conferirFireLive,
  diasDaTemporada,
  filtrarRecapDaNoite,
  filtrosResultadosDaUrl,
  greensDoDia,
  recapDaNoite,
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
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { placarCacheado } from '@/app/_cache/placar'
import { taxaDaTemporadaCacheada } from '@/app/_cache/temporada'

type Params = Record<string, string | string[] | undefined>

/** Rótulo de calendário que existe de verdade: 2026-02-31 não é uma rodada. */
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const instante = new Date(`${data}T12:00:00.000Z`)
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === data
}

/**
 * `/resultados` é um ATALHO para a última rodada com conferência. O destino é
 * a noite que TERMINOU; sem nenhuma, a rodada de hoje. O dia é o da RODADA, no
 * fuso do ruleset — nunca o UTC do servidor.
 */
export async function destinoDosResultados(params: Params): Promise<string> {
  const filtros = filtrosResultadosDaUrl(params)
  const { fuso } = (await rulesetAtivo()).rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  const ultima = process.env.DATABASE_URL ? await ultimaRodadaConferida(getDb(), hoje) : null
  return rotaResultados(ultima ?? hoje, filtros)
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
  anterior: string
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
  const filtros = filtrosResultadosDaUrl(params)
  // Resultados é a prova social que convence quem ainda não assina (decisão
  // 9): a guarda aqui é de LOGIN. O plano entra logo abaixo como CORTE, não
  // como portão — o grátis vê a tela, mas só o que já terminou (24/09).
  const { acesso } = await exigirNivel('GRATIS', rotaResultados(data, filtros))
  const assinante = atende(acesso.nivel, 'MVP')

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  // Rota inventada não vira erro nem tela vazia: volta para a rodada de hoje.
  if (!dataValida(data)) redirect(rotaResultados(hoje, filtros))

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

  // O item do feed pela chave (jogo, jogador, atributo); entre as linhas do
  // mesmo apito vale a MAIS BAIXA, que é a que o card confere.
  const itemPorCard = new Map<string, ItemFeed>()
  for (const item of feed?.conteudo.itens ?? []) {
    const chave = `${item.jogoId}|${item.jogadorId}|${item.atributo}`
    const atual = itemPorCard.get(chave)
    if (!atual || (item.linha ?? Infinity) < (atual.linha ?? Infinity)) itemPorCard.set(chave, item)
  }

  const jogos: JogoDaNoite[] = recap.porJogo.map(({ jogo, cards }) => {
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
    jogos,
    fire,
    greens,
    times: [...times].map(([id, sigla]) => ({ id, sigla })),
  }
}
