import { z } from 'zod'

import { somarDias } from '../../dominio/rodada'
import type { Atributo } from '../../motor/tipos'
import { CasaFatiada } from './casa-fatiada'
import { linhaDoLadoOver } from './conversao'
import type { ConfigSuperbet } from './fontes'
import type { CasaDeAposta, CensoDaCasa, CotacaoExterna, EventoDaCasa } from './porta'

/**
 * Adapter Superbet — o "offer server", o mesmo feed que o site e o app da
 * casa consomem. Servido por Fastly e PARTICIONADO POR MERCADO no host
 * (`production-superbet-offer-br…` é o Brasil; `-ro`, `-pl`, `-be`… os
 * outros), então o país mora na `baseUrl` e trocar de praça é trocar uma env.
 *
 * DUAS FORMAS DIFERENTES na mesma casa — a razão de este arquivo não ser
 * cópia de `betmgm.ts` nem de `altenar.ts`:
 *
 *  1. A LISTA de eventos é um SSE (`text/event-stream`), não JSON: linhas
 *     `data:[…]`. E é uma ASSINATURA — o fluxo não fecha sozinho, fica aberto
 *     esperando atualização. Por isso a leitura tem JANELA: lê o retrato
 *     inicial, para, e devolve. Sem janela, a coleta penduraria no primeiro
 *     evento e o cron estouraria o prazo.
 *  2. O DETALHE do evento é JSON normal, com envelope `events`, e é lá que
 *     vivem os props de jogador — a lista só traz o mercado principal
 *     (marcado `tags: "preselected"`).
 *
 * E DOIS FORMATOS DE PROP DE PONTOS, que a casa publica lado a lado:
 *
 *  - `specifiers.total` → o clássico Mais de/Menos de 9.5. Os dois lados
 *    compartilham `market_line_uuid`: é essa a chave que remonta o par, e ela
 *    é mais confiável do que casar por nome.
 *  - `specifiers.milestone` → "Marcará 5 ou mais pontos". Isso É a linha "5+"
 *    do CJ, já no formato dele. Não passa por `linhaDoLadoOver` de propósito:
 *    aquela função recusa inteiro porque "over 25" não equivale a "25+" — mas
 *    milestone 5 equivale a "5+" por definição da própria casa ("5 ou mais").
 *    Mercado nenhum vira cotação sem estar confirmado em `mapa_mercados`,
 *    então quem decide se este formato entra é a curadoria, não este arquivo.
 *
 * ADR-0004: leitura de cotação pública. Nada aqui envia aposta, autentica
 * apostador ou movimenta dinheiro.
 */

/** Teto de leitura do fluxo — retrato de basquete não passa disso. */
const LIMITE_BYTES = 8 * 1024 * 1024

function aplicar(template: string, valores: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
    const valor = valores[chave]
    return valor === undefined ? inteiro : encodeURIComponent(valor)
  })
}

function cabecalhos(config: ConfigSuperbet): Record<string, string> {
  const base: Record<string, string> = { accept: 'application/json' }
  // O feed é aberto. Se a conta vier com credencial, ela entra sem mudar
  // código — mesma escapatória da BetMGM, pela mesma razão.
  if (config.apiKey) {
    base[config.authHeader] = config.authPrefix
      ? `${config.authPrefix} ${config.apiKey}`
      : config.apiKey
  }
  return base
}

/**
 * Lê um corpo que pode NÃO FECHAR (a assinatura SSE) por uma janela de tempo
 * e devolve o que chegou. Parar no relógio é o ponto: o retrato inicial vem
 * de uma vez, e o resto do fluxo são atualizações que a coleta diária não usa.
 */
async function lerPorJanela(resposta: Response, janelaMs: number): Promise<string> {
  if (!resposta.body) return resposta.text()
  const leitor = resposta.body.getReader()
  const decodificador = new TextDecoder()
  const limite = Date.now() + janelaMs
  let texto = ''
  try {
    for (;;) {
      const restante = limite - Date.now()
      if (restante <= 0) break
      let temporizador: ReturnType<typeof setTimeout> | undefined
      const passo = await Promise.race([
        leitor.read(),
        new Promise<'janela'>((ok) => {
          temporizador = setTimeout(() => ok('janela'), restante)
        }),
      ])
      if (temporizador !== undefined) clearTimeout(temporizador)
      if (passo === 'janela' || passo.done) break
      texto += decodificador.decode(passo.value, { stream: true })
      if (texto.length > LIMITE_BYTES) break
    }
  } finally {
    await leitor.cancel().catch(() => undefined)
  }
  return texto
}

/**
 * `data:[…]` vira lista de eventos. Bloco cortado pela janela é IGNORADO, não
 * é erro: o retrato já veio, e um JSON truncado não pode virar cotação.
 */
function eventosDoFluxo(texto: string): unknown[] {
  const fora: unknown[] = []
  for (const linha of texto.split('\n')) {
    if (!linha.startsWith('data:')) continue
    const corpo = linha.slice('data:'.length).trim()
    if (corpo === '') continue
    let valor: unknown
    try {
      valor = JSON.parse(corpo)
    } catch {
      continue
    }
    if (Array.isArray(valor)) fora.push(...valor)
    else fora.push(valor)
  }
  return fora
}

const fixtureSchema = z.object({
  event_name: z.string().nullish(),
  utc_date: z.string().nullish(),
  event_date: z.string().nullish(),
  tournament_id: z.union([z.string(), z.number()]).transform(String).nullish(),
})

const eventoSchema = z.object({
  event_id: z.union([z.string(), z.number()]).transform(String),
  fixture: fixtureSchema.nullish(),
})

/**
 * "Fenerbahce·Besiktas" — o separador da casa é o ponto médio (·), não " vs ".
 * Os outros ficam porque o mesmo campo aparece grafado de outras formas em
 * praças diferentes, e aceitá-los não custa nada.
 */
function participantesDoNome(nome: string | null | undefined): {
  casa: string | null
  visitante: string | null
} {
  if (!nome) return { casa: null, visitante: null }
  const lados = nome.split(/\s*·\s*|\s+(?:vs\.?|x|[-–])\s+/i)
  if (lados.length !== 2) return { casa: null, visitante: null }
  return { casa: lados[0]!.trim(), visitante: lados[1]!.trim() }
}

/**
 * Eventos do dia. O feed de assinatura NÃO filtra por data — devolve a agenda
 * pré-jogo inteira do esporte, como a BetMGM. O corte de DIA é do vínculo,
 * que conhece o fuso do ruleset; aqui só o recorte de esporte e, quando
 * configurado, de campeonato.
 */
export async function eventosDoDiaSuperbet(
  config: ConfigSuperbet,
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoDaCasa[]> {
  const url =
    config.baseUrl +
    aplicar(config.caminhoEventos, {
      locale: config.locale,
      sportId: config.sportId,
      champId: config.champId ?? '',
      dia,
      diaSeguinte: somarDias(dia, 1),
    })
  const resposta = await buscar(url, { headers: cabecalhos(config) })
  if (!resposta.ok) throw new Error(`superbet events: HTTP ${resposta.status}`)

  const texto = await lerPorJanela(resposta, config.janelaMs)
  const eventos: EventoDaCasa[] = []
  const vistos = new Set<string>()
  for (const bruto of eventosDoFluxo(texto)) {
    const e = eventoSchema.safeParse(bruto)
    if (!e.success) continue
    // A assinatura repete o mesmo evento a cada atualização: o primeiro vale.
    if (vistos.has(e.data.event_id)) continue
    const f = e.data.fixture
    if (config.champId && f?.tournament_id !== config.champId) continue
    vistos.add(e.data.event_id)
    const { casa, visitante } = participantesDoNome(f?.event_name)
    eventos.push({
      idExterno: e.data.event_id,
      nomeCasa: casa,
      nomeVisitante: visitante,
      inicioIso: f?.utc_date ?? f?.event_date ?? null,
    })
  }
  return eventos
}

const oddSchema = z.object({
  price: z.union([z.string(), z.number()]).transform(Number).nullish(),
  status: z.union([z.string(), z.number()]).nullish(),
  display: z.boolean().nullish(),
  metadata: z
    .object({
      info: z.string().nullish(),
      name: z.string().nullish(),
      market_line_uuid: z.string().nullish(),
      specifiers: z
        .object({
          player: z.string().nullish(),
          total: z.union([z.string(), z.number()]).transform(String).nullish(),
          milestone: z.union([z.string(), z.number()]).transform(String).nullish(),
        })
        .nullish(),
    })
    .nullish(),
})

const marketSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).nullish(),
  name: z.string().nullish(),
  odds: z.array(z.unknown()).nullish(),
})

const detalheSchema = z.object({
  events: z
    .array(
      z.object({
        event_id: z.union([z.string(), z.number()]).transform(String),
        markets: z.array(z.unknown()).nullish(),
      }),
    )
    .nullish(),
})

/**
 * Cotação ATIVA: `status` 1 e `display` diferente de false. Status 2 é
 * suspenso — e a casa devolve preço 1.00 junto, então incluí-lo viraria odd
 * morta no card. Vocabulário desconhecido é DESCARTE, nunca inclusão: se a
 * casa mudar a numeração, `odds_superbet_descartadas` estoura no resultado do
 * job. Falha visível, não silenciosa.
 */
function estaAtiva(odd: z.infer<typeof oddSchema>): boolean {
  if (odd.display === false) return false
  const s = odd.status
  if (s === null || s === undefined) return true
  if (typeof s === 'number') return s === 1
  return /^(1|active|open|available)$/i.test(s.trim())
}

const OVER = /\b(mais de|acima de|over)\b/i
const UNDER = /\b(menos de|abaixo de|under)\b/i

/** O lado sai do nome do resultado ou do texto longo — "Terá mais de 9.5…". */
function ladoDoTexto(...textos: (string | null | undefined)[]): 'over' | 'under' | null {
  for (const texto of textos) {
    if (!texto) continue
    if (UNDER.test(texto)) return 'under'
    if (OVER.test(texto)) return 'over'
  }
  return null
}

type Grupo = {
  modelo: string
  jogador: string
  /** 'total' passa por linhaDoLadoOver; 'milestone' JÁ é a linha do CJ. */
  tipo: 'total' | 'milestone'
  valor: string
  over: number | null
  under: number | null
  ativas: number
}

/**
 * Traduz `markets[].odds[]` em grupos por LINHA. A chave é o
 * `market_line_uuid`: a própria casa diz quais resultados são os dois lados
 * da mesma linha, e isso é mais confiável do que remontar por nome.
 */
function agrupar(mercados: unknown[]): { grupos: Grupo[]; descartadas: number } {
  const porChave = new Map<string, Grupo>()
  let descartadas = 0

  for (const mercadoBruto of mercados) {
    const m = marketSchema.safeParse(mercadoBruto)
    if (!m.success) {
      descartadas += 1
      continue
    }
    const modelo = (m.data.name ?? '').trim()

    for (const oddBruta of m.data.odds ?? []) {
      const o = oddSchema.safeParse(oddBruta)
      if (!o.success || !estaAtiva(o.data)) {
        descartadas += 1
        continue
      }
      const md = o.data.metadata
      const spec = md?.specifiers
      const jogador = spec?.player?.trim()
      if (!jogador) {
        // Mercado de time ou de partida — não é prop de jogador.
        descartadas += 1
        continue
      }

      const tipo: 'total' | 'milestone' | null =
        spec?.total != null ? 'total' : spec?.milestone != null ? 'milestone' : null
      if (tipo === null) {
        descartadas += 1
        continue
      }
      const valor = (tipo === 'total' ? spec!.total! : spec!.milestone!).trim()
      const chave = md?.market_line_uuid ?? `${m.data.id ?? modelo}|${jogador}|${tipo}|${valor}`

      if (!porChave.has(chave)) {
        porChave.set(chave, { modelo, jogador, tipo, valor, over: null, under: null, ativas: 0 })
      }
      const grupo = porChave.get(chave)!
      grupo.ativas += 1

      const preco = o.data.price
      if (preco == null || !Number.isFinite(preco)) {
        descartadas += 1
        continue
      }
      // O milestone tem um lado só ("marcará N ou mais"), e esse lado É o over.
      const lado = tipo === 'milestone' ? 'over' : ladoDoTexto(md?.name, md?.info)
      if (lado === 'over') grupo.over = preco
      else if (lado === 'under') grupo.under = preco
      else descartadas += 1
    }
  }

  return { grupos: [...porChave.values()], descartadas }
}

/** A linha do CJ, por formato de mercado. Inteiro em `total` não atravessa. */
function linhaDoGrupo(grupo: Grupo): number | null {
  if (grupo.tipo === 'milestone') {
    const n = Number(grupo.valor)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return linhaDoLadoOver(grupo.valor.replace(',', '.'))
}

async function eventoDetalhado(
  config: ConfigSuperbet,
  eventoIdExterno: string,
  buscar: typeof fetch,
): Promise<unknown[]> {
  const url =
    config.baseUrl +
    aplicar(config.caminhoEvento, {
      locale: config.locale,
      id: eventoIdExterno,
      sportId: config.sportId,
    })
  const resposta = await buscar(url, { headers: cabecalhos(config) })
  if (!resposta.ok) throw new Error(`superbet event ${eventoIdExterno}: HTTP ${resposta.status}`)
  const corpo = detalheSchema.parse(await resposta.json())
  for (const evento of corpo.events ?? []) {
    if (evento.event_id === eventoIdExterno) return evento.markets ?? []
  }
  return corpo.events?.[0]?.markets ?? []
}

/**
 * Traduz um evento em cotações. `atributoDoMercado` é o mapa de mercados
 * CONFIRMADO, injetado pelo chamador e consultado pelo NOME do mercado — que
 * aqui NÃO traz o jogador: "Jogador - Total de Pontos (Inc. prorrogação)"
 * vale para todos os jogadores de todas as noites, que é exatamente o que a
 * curadoria quer confirmar uma vez só. Prop fora do mapa sai SEM atributo: a
 * coleta a conta como `aguardandoCuradoria`, nunca em silêncio.
 */
export async function casasSuperbet(
  config: ConfigSuperbet,
  eventoIdExterno: string,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
): Promise<CasaDeAposta[]> {
  const mercados = await eventoDetalhado(config, eventoIdExterno, buscar)
  const { grupos, descartadas: naLeitura } = agrupar(mercados)
  let descartadas = naLeitura
  const itens: CotacaoExterna[] = []

  for (const grupo of grupos) {
    const linha = linhaDoGrupo(grupo)
    if (linha === null || grupo.over === null) {
      // Linha inteira em mercado de total (não equivale a "N+"), ou sem lado
      // over: não atravessa a porta.
      descartadas += grupo.ativas
      continue
    }
    const atributo = atributoDoMercado(grupo.modelo)
    itens.push({
      jogadorNomeNaCasa: grupo.jogador,
      nomeMercadoNaCasa: grupo.modelo,
      linha,
      oddOver: grupo.over,
      oddUnder: grupo.under,
      ...(atributo === undefined ? {} : { atributo }),
    })
  }

  return [new CasaFatiada('superbet', eventoIdExterno, itens, descartadas)]
}

/**
 * Censo de um evento: todo nome de mercado com a contagem de cotações ativas,
 * mais os nomes de jogador. Sem mapa e sem descarte — é o que a curadoria lê
 * no dia em que a fonte é ligada, antes de existir mapa nenhum.
 */
export async function censoSuperbet(
  config: ConfigSuperbet,
  eventoIdExterno: string,
  buscar: typeof fetch = fetch,
): Promise<CensoDaCasa> {
  const mercados = await eventoDetalhado(config, eventoIdExterno, buscar)
  const porNome = new Map<string, number>()
  const jogadores = new Set<string>()

  for (const mercadoBruto of mercados) {
    const m = marketSchema.safeParse(mercadoBruto)
    if (!m.success) continue
    const cru = (m.data.name ?? '').trim()
    const nome = cru === '' ? '(sem nome)' : cru
    let ativas = 0
    for (const oddBruta of m.data.odds ?? []) {
      const o = oddSchema.safeParse(oddBruta)
      if (!o.success || !estaAtiva(o.data)) continue
      ativas += 1
      const jogador = o.data.metadata?.specifiers?.player?.trim()
      if (jogador) jogadores.add(jogador)
    }
    porNome.set(nome, (porNome.get(nome) ?? 0) + ativas)
  }

  return {
    mercados: [...porNome].map(([nome, cotacoesAtivas]) => ({ nome, cotacoesAtivas })),
    jogadores: [...jogadores],
  }
}
