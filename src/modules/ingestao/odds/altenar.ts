import { z } from 'zod'

import type { Atributo } from '../../motor/tipos'
import { linhaDoLadoOver } from './conversao'
import type { ConfigAltenar } from './fontes'
import type { CasaDeAposta, CensoDaCasa, CotacaoExterna } from './porta'

/**
 * Adapter Altenar — o fluxo do guia: authenticate → X-ApiToken → eventos do
 * dia → odds por evento. O token NÃO é persistido (o guia autentica a cada
 * request; nossa coleta é 1×/dia, então o custo é zero).
 *
 * ADR-0004: o token é de LEITURA do feed da integração, nunca conta de
 * apostador. Nada aqui envia aposta ou movimenta dinheiro.
 */

const QUERY_COMUM = 'culture=pt-BR&timezoneOffset=180&deviceType=2&numFormat=en-GB&countryCode=BR'

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

export type EventoAltenar = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
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
    .default([]),
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

export async function eventosDoDiaAltenar(
  config: ConfigAltenar,
  token: string,
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoAltenar[]> {
  const champ = config.champId ? `&champId=${config.champId}` : ''
  const url =
    `${config.gatewayBase}/api/v1/events?${QUERY_COMUM}&integration=${config.integration}` +
    `&sportId=${config.sportId}${champ}&dateFrom=${dia}&dateTo=${dia}&page=1&pageSize=100`
  const resposta = await buscar(url, { headers: cabecalhos(config, token) })
  if (!resposta.ok) throw new Error(`altenar events: HTTP ${resposta.status}`)
  const corpo = eventosSchema.parse(await resposta.json())
  return corpo.data
    .map((e) => {
      const id = e.eventId ?? e.id
      if (!id) return null
      const { casa, visitante } = participantesDoNome(e.name)
      return {
        idExterno: id,
        nomeCasa: casa,
        nomeVisitante: visitante,
        inicioIso: e.startDate ?? null,
      }
    })
    .filter((e): e is EventoAltenar => e !== null)
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
          .default([]),
      }),
    )
    .default([]),
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

/** "Total de Pontos - Stephen Curry" → o nome depois do último " - ". */
function jogadorDoNomeDeMercado(nome: string): string | null {
  const partes = nome.split(' - ')
  return partes.length >= 2 ? partes[partes.length - 1]!.trim() : null
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

class CasaAltenar implements CasaDeAposta {
  readonly #descartadas: number
  constructor(
    readonly nome: string,
    private readonly eventoIdExterno: string,
    private readonly itens: CotacaoExterna[],
    descartadas: number,
  ) {
    this.#descartadas = descartadas
  }
  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    if (jogoIdExterno !== this.eventoIdExterno) {
      throw new Error(
        `altenar: casa fatiada para o evento ${this.eventoIdExterno}, pedido ${jogoIdExterno}`,
      )
    }
    return this.itens.map((c) => ({ ...c }))
  }
  descartadas(): number {
    return this.#descartadas
  }
}

/**
 * Busca `GET /api/v1/events/{id}` e traduz. `atributoDoMercado` é o mapa de
 * mercados CONFIRMADO, injetado pelo chamador — mercado fora do mapa descarta
 * contado (a curadoria decide depois; o adapter nunca adivinha).
 */
export async function casasAltenar(
  config: ConfigAltenar,
  token: string,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
  eventoIdExterno = '',
): Promise<CasaDeAposta[]> {
  const corpo = await buscarEvento(config, token, eventoIdExterno, buscar)

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const mercado of corpo.markets) {
    const nomeMercado = mercado.name ?? ''
    const atributo = atributoDoMercado(nomeMercado)
    const jogador = jogadorDoNomeDeMercado(nomeMercado)

    // Agrupa over/under pela MESMA linha dentro do mercado.
    const porLinha = new Map<string, { over: number | null; under: number | null }>()
    let ativasNoMercado = 0
    for (const odd of mercado.odds) {
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
      ativasNoMercado += 1
      const atual = porLinha.get(lv.valor) ?? { over: null, under: null }
      atual[lv.lado] = odd.price
      porLinha.set(lv.valor, atual)
    }

    if (atributo === undefined || jogador === null) {
      // Mercado fora do mapa (ou sem jogador no nome): o que sobrou vira
      // descarte contado — é o que o censo e a curadoria vão revelar.
      descartadas += ativasNoMercado
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
        nomeMercadoNaCasa: nomeMercado,
        linha,
        oddOver: lados.over,
        oddUnder: lados.under,
        atributo,
      })
    }
  }

  return [new CasaAltenar('altenar', eventoIdExterno, itens, descartadas)]
}

/**
 * Censo de um evento: TODO nome de mercado, com quantas cotações ativas tem,
 * mais os nomes de jogador que dá para ler dos mercados. Sem mapa, sem
 * tradução, sem descarte — é o inverso do adapter, e é o que a curadoria lê
 * antes de existir mapa nenhum.
 */
export async function censoAltenar(
  config: ConfigAltenar,
  token: string,
  eventoIdExterno: string,
  buscar: typeof fetch = fetch,
): Promise<CensoDaCasa> {
  const corpo = await buscarEvento(config, token, eventoIdExterno, buscar)
  const mercados: CensoDaCasa['mercados'] = []
  const jogadores = new Set<string>()
  for (const mercado of corpo.markets) {
    const nome = mercado.name ?? '(sem nome)'
    mercados.push({
      nome,
      cotacoesAtivas: mercado.odds.filter((o) => o.oddStatus === 0).length,
    })
    const jogador = jogadorDoNomeDeMercado(nome)
    if (jogador) jogadores.add(jogador)
  }
  return { mercados, jogadores: [...jogadores] }
}
