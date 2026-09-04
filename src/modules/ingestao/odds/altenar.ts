import { z } from 'zod'

import { somarDias } from '../../dominio/rodada'
import type { Atributo } from '../../motor/tipos'
import { CasaFatiada } from './casa-fatiada'
import { linhaDoLadoOver } from './conversao'
import type { ConfigAltenar } from './fontes'
import type { CasaDeAposta, CensoDaCasa, CotacaoExterna, EventoDaCasa } from './porta'

/**
 * Adapter Altenar — o fluxo do guia: authenticate → X-ApiToken → eventos do
 * dia → odds por evento. O token NÃO é persistido (o guia autentica a cada
 * request; nossa coleta é 1×/dia, então o custo é zero).
 *
 * ADR-0004: o token é de LEITURA do feed da integração, nunca conta de
 * apostador. Nada aqui envia aposta ou movimenta dinheiro.
 */

const QUERY_COMUM = 'culture=pt-BR&timezoneOffset=180&deviceType=2&numFormat=en-GB&countryCode=BR'
const TAMANHO_PAGINA = 100
/** 2.000 eventos de basquete num dia é teto folgado para qualquer feed. */
const LIMITE_PAGINAS = 20

/**
 * O guia mostra o token em `token`; contas diferentes devolvem o mesmo dado em
 * `apiToken`/`access_token`/`data.token`. Aceitar os quatro é o que evita um
 * deploy travado por um nome de campo no dia da conta — sem inventar formato:
 * nenhum campo conhecido presente é ERRO, não string vazia.
 */
const tokenSchema = z.object({
  token: z.string().optional(),
  apiToken: z.string().optional(),
  access_token: z.string().optional(),
  data: z.object({ token: z.string().optional() }).optional(),
})

export async function autenticarAltenar(
  config: ConfigAltenar,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const resposta = await buscar(`${config.gatewayBase}/api/authenticate`, {
    headers: {
      Origin: config.origin,
      'x-Integration': config.integration,
      accept: 'application/json',
    },
  })
  if (!resposta.ok) throw new Error(`altenar authenticate: HTTP ${resposta.status}`)
  const corpo = tokenSchema.parse(await resposta.json())
  const token = corpo.token ?? corpo.apiToken ?? corpo.access_token ?? corpo.data?.token
  if (!token) throw new Error('altenar authenticate: resposta sem token em nenhum campo conhecido')
  return token
}

function cabecalhos(config: ConfigAltenar, token: string): Record<string, string> {
  return {
    Origin: config.origin,
    'x-Integration': config.integration,
    accept: 'application/json',
    'X-ApiToken': token,
  }
}

const eventosSchema = z.object({
  data: z
    .array(
      z.object({
        eventId: z.union([z.string(), z.number()]).transform(String).optional(),
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        name: z.string().nullish(),
        startDate: z.string().nullish(),
      }),
    )
    .nullish(),
})

/** "Lakers vs Celtics" / "Lakers x Celtics" / "Lakers - Celtics" → os dois lados. */
function participantesDoNome(nome: string | null | undefined): {
  casa: string | null
  visitante: string | null
} {
  if (!nome) return { casa: null, visitante: null }
  const lados = nome.split(/\s+(?:vs\.?|x|[-–])\s+/i)
  if (lados.length !== 2) return { casa: null, visitante: null }
  return { casa: lados[0]!.trim(), visitante: lados[1]!.trim() }
}

/**
 * Eventos do dia de referência. A janela pedida é de DOIS dias (dia e dia+1)
 * de propósito: a Altenar corta o dia no fuso da query (UTC-3) e um jogo das
 * 23h de Nova York já é madrugada do dia seguinte em Brasília — o corte
 * exato de dia é do vínculo, que conhece o fuso do ruleset. Paginado até o
 * fim: sem `champId`, a lista traz TODO o basquete da casa e a NBA pode cair
 * da página 100 para a 101.
 */
export async function eventosDoDiaAltenar(
  config: ConfigAltenar,
  token: string,
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoDaCasa[]> {
  const champ = config.champId ? `&champId=${config.champId}` : ''
  const eventos: EventoDaCasa[] = []
  for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
    const url =
      `${config.gatewayBase}/api/v1/events?${QUERY_COMUM}&integration=${config.integration}` +
      `&sportId=${config.sportId}${champ}&dateFrom=${dia}&dateTo=${somarDias(dia, 1)}` +
      `&page=${pagina}&pageSize=${TAMANHO_PAGINA}`
    const resposta = await buscar(url, { headers: cabecalhos(config, token) })
    if (!resposta.ok) throw new Error(`altenar events: HTTP ${resposta.status}`)
    const lote = eventosSchema.parse(await resposta.json()).data ?? []
    for (const e of lote) {
      const id = e.eventId ?? e.id
      if (!id) continue
      const { casa, visitante } = participantesDoNome(e.name)
      eventos.push({
        idExterno: id,
        nomeCasa: casa,
        nomeVisitante: visitante,
        inicioIso: e.startDate ?? null,
      })
    }
    if (lote.length < TAMANHO_PAGINA) break
  }
  return eventos
}

const eventoDetalheSchema = z.object({
  markets: z
    .array(
      z.object({
        name: z.string().nullish(),
        odds: z
          .array(
            z.object({
              price: z.union([z.string(), z.number()]).transform(Number).nullish(),
              oddStatus: z.number().nullish(),
              name: z.string().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
})

async function buscarEvento(
  config: ConfigAltenar,
  token: string,
  eventoIdExterno: string,
  buscar: typeof fetch,
): Promise<z.infer<typeof eventoDetalheSchema>> {
  const url =
    `${config.gatewayBase}/api/v1/events/${eventoIdExterno}?${QUERY_COMUM}` +
    `&integration=${config.integration}&sportId=${config.sportId}`
  const resposta = await buscar(url, { headers: cabecalhos(config, token) })
  if (!resposta.ok) throw new Error(`altenar event ${eventoIdExterno}: HTTP ${resposta.status}`)
  return eventoDetalheSchema.parse(await resposta.json())
}

/**
 * "Total de Pontos - Stephen Curry" → modelo "Total de Pontos" + jogador.
 *
 * O MODELO é o que a curadoria confirma em `mapa_mercados` — uma linha por
 * tipo de mercado, não uma por jogador por noite. Sem " - ", o mercado não é
 * prop de jogador (ex.: "Vencedor da Partida") e o jogador é nulo.
 */
export function separarMercado(nome: string): { modelo: string; jogador: string | null } {
  const partes = nome.split(' - ')
  if (partes.length < 2) return { modelo: nome.trim(), jogador: null }
  return {
    modelo: partes.slice(0, -1).join(' - ').trim(),
    jogador: partes[partes.length - 1]!.trim(),
  }
}

/** "Mais de 24.5" / "Menos de 24.5" — o lado e o valor. */
function ladoEValor(
  nome: string | null | undefined,
): { lado: 'over' | 'under'; valor: string } | null {
  if (!nome) return null
  const m = nome.match(/^(Mais de|Menos de|Over|Under)\s+(\d+(?:[.,]\d+)?)/i)
  if (!m) return null
  const lado = /^(mais|over)/i.test(m[1]!) ? 'over' : 'under'
  return { lado, valor: m[2]!.replace(',', '.') }
}

/**
 * Busca `GET /api/v1/events/{id}` e traduz. `atributoDoMercado` é o mapa de
 * mercados CONFIRMADO, injetado pelo chamador, consultado pelo MODELO do
 * mercado. Prop de jogador fora do mapa sai SEM atributo — é a coleta que a
 * conta como `aguardandoCuradoria`, o número que o runbook manda olhar.
 * `descartadas` fica só para o que não é cotação de prop de forma nenhuma.
 */
export async function casasAltenar(
  config: ConfigAltenar,
  token: string,
  eventoIdExterno: string,
  atributoDoMercado: (modeloDeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
): Promise<CasaDeAposta[]> {
  const corpo = await buscarEvento(config, token, eventoIdExterno, buscar)

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const mercado of corpo.markets ?? []) {
    const { modelo, jogador } = separarMercado(mercado.name ?? '')
    const atributo = atributoDoMercado(modelo)

    // Agrupa over/under pela MESMA linha dentro do mercado.
    const porLinha = new Map<string, { over: number | null; under: number | null }>()
    for (const odd of mercado.odds ?? []) {
      // oddStatus 0 é a única cotação ativa do guia; preço não-numérico não é odd.
      if (odd.oddStatus !== 0 || odd.price == null || !Number.isFinite(odd.price)) {
        descartadas += 1
        continue
      }
      const lv = ladoEValor(odd.name)
      if (!lv) {
        descartadas += 1
        continue
      }
      const atual = porLinha.get(lv.valor) ?? { over: null, under: null }
      atual[lv.lado] = odd.price
      porLinha.set(lv.valor, atual)
    }

    if (jogador === null) {
      // Não é prop de jogador: nada aqui vira cotação, tudo é descarte contado.
      descartadas += porLinha.size
      continue
    }

    for (const [valor, lados] of porLinha) {
      const linha = linhaDoLadoOver(valor)
      if (linha === null || lados.over === null) {
        descartadas += 1
        continue
      }
      itens.push({
        jogadorNomeNaCasa: jogador,
        nomeMercadoNaCasa: modelo,
        linha,
        oddOver: lados.over,
        oddUnder: lados.under,
        ...(atributo === undefined ? {} : { atributo }),
      })
    }
  }

  return [new CasaFatiada('altenar', eventoIdExterno, itens, descartadas)]
}

/**
 * Censo de um evento: todo MODELO de mercado com a contagem de cotações
 * ativas, mais os nomes de jogador que dá para ler. Sem mapa, sem descarte —
 * é o que a curadoria lê antes de existir mapa nenhum, e o modelo é o que ela
 * vai gravar em `mapa_mercados`.
 */
export async function censoAltenar(
  config: ConfigAltenar,
  token: string,
  eventoIdExterno: string,
  buscar: typeof fetch = fetch,
): Promise<CensoDaCasa> {
  const corpo = await buscarEvento(config, token, eventoIdExterno, buscar)
  const porModelo = new Map<string, number>()
  const jogadores = new Set<string>()
  for (const mercado of corpo.markets ?? []) {
    const { modelo, jogador } = separarMercado(mercado.name ?? '(sem nome)')
    const ativas = (mercado.odds ?? []).filter((o) => o.oddStatus === 0).length
    porModelo.set(modelo, (porModelo.get(modelo) ?? 0) + ativas)
    if (jogador) jogadores.add(jogador)
  }
  return {
    mercados: [...porModelo].map(([nome, cotacoesAtivas]) => ({ nome, cotacoesAtivas })),
    jogadores: [...jogadores],
  }
}
