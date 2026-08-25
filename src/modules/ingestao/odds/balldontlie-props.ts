import { z } from 'zod'

import { americanaParaDecimal, atributoDoPropType, linhaDoLadoOver } from './conversao'
import type { CasaDeAposta, CotacaoExterna } from './porta'

/**
 * Casas de aposta servidas pelo BALLDONTLIE (`GET /v2/odds/player_props`).
 *
 * Uma chamada por jogo devolve TODAS as casas (vendors) de uma vez; cada
 * vendor vira um `CasaDeAposta` próprio (`balldontlie:draftkings`, …) — a
 * média "entre casas" do produto é a média entre vendors.
 *
 * Toda a tradução acontece AQUI, na fronteira (spec de 25/08): odd americana
 * vira decimal, meio-ponto do over vira a linha inteira do CJ, prop_type vira
 * atributo. O que não equivale a um mercado do produto (milestone, compostos,
 * linha inteira do provedor) morre na porta — CONTADO, nunca em silêncio.
 *
 * ADR-0004: leitura de cotação pública, e só.
 */

const esquemaProp = z.object({
  player_id: z.number(),
  vendor: z.string(),
  prop_type: z.string(),
  line_value: z.string(),
  market: z.object({
    type: z.string(),
    over_odds: z.number().optional(),
    under_odds: z.number().optional(),
  }),
})

const esquemaResposta = z.object({ data: z.array(z.unknown()) })

class CasaBalldontlie implements CasaDeAposta {
  #descartadas: number

  constructor(
    readonly nome: string,
    private readonly gameIdExterno: string,
    private readonly itens: CotacaoExterna[],
    descartadas: number,
  ) {
    this.#descartadas = descartadas
  }

  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    // As casas nascem já fatiadas para um jogo — pedir outro é bug de quem chama.
    if (jogoIdExterno !== this.gameIdExterno) {
      throw new Error(
        `${this.nome}: casa fatiada para o jogo ${this.gameIdExterno}, pedido ${jogoIdExterno}`,
      )
    }
    return this.itens.map((c) => ({ ...c }))
  }

  descartadas(): number {
    return this.#descartadas
  }
}

/**
 * Busca as props do jogo e fatia por vendor. `buscar` é a única fronteira de
 * I/O — o fake entrega a fixture, o real entrega o HTTP; a tradução é a mesma.
 */
export async function casasBalldontlie(
  buscar: (gameIdExterno: string) => Promise<unknown>,
  gameIdExterno: string,
): Promise<CasaDeAposta[]> {
  const bruta = esquemaResposta.parse(await buscar(gameIdExterno))

  const porVendor = new Map<string, CotacaoExterna[]>()
  const descartesPorVendor = new Map<string, number>()

  const garantirVendor = (vendor: string) => {
    if (!porVendor.has(vendor)) {
      porVendor.set(vendor, [])
      descartesPorVendor.set(vendor, 0)
    }
  }
  const contarDescarte = (vendor: string) =>
    descartesPorVendor.set(vendor, (descartesPorVendor.get(vendor) ?? 0) + 1)

  for (const item of bruta.data) {
    const prop = esquemaProp.safeParse(item)
    if (!prop.success) {
      // Shape quebrado ainda é descarte CONTADO — o vendor sai de uma leitura
      // frouxa; sem nem vendor legível, o item é lixo de verdade e cai fora.
      const vendorFrouxo = z.object({ vendor: z.string() }).safeParse(item)
      if (vendorFrouxo.success) {
        garantirVendor(vendorFrouxo.data.vendor)
        contarDescarte(vendorFrouxo.data.vendor)
      }
      continue
    }
    const { vendor } = prop.data
    garantirVendor(vendor)

    const atributo = atributoDoPropType(prop.data.prop_type)
    const linha = linhaDoLadoOver(prop.data.line_value)
    const overAmericana =
      prop.data.market.type === 'over_under' ? (prop.data.market.over_odds ?? null) : null

    // Zero é mercado suspenso no formato americano; a conversão lança de
    // propósito — aqui, antes dela, vira descarte contado.
    const americanaValida = (n: number | null): n is number =>
      n !== null && Number.isFinite(n) && n !== 0
    if (atributo === null || linha === null || !americanaValida(overAmericana)) {
      contarDescarte(vendor)
      continue
    }

    const underBruta = prop.data.market.under_odds ?? null
    const underAmericana = americanaValida(underBruta) ? underBruta : null
    porVendor.get(vendor)!.push({
      // O nome canônico chega pelo vínculo por id; o campo textual registra o
      // que dá para registrar sem outra chamada.
      jogadorNomeNaCasa: `player:${prop.data.player_id}`,
      nomeMercadoNaCasa: prop.data.prop_type,
      linha,
      oddOver: americanaParaDecimal(overAmericana),
      oddUnder: underAmericana === null ? null : americanaParaDecimal(underAmericana),
      jogadorIdExternoProvedor: String(prop.data.player_id),
      atributo,
    })
  }

  return [...porVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([vendor, itens]) =>
        new CasaBalldontlie(
          `balldontlie:${vendor}`,
          gameIdExterno,
          itens,
          descartesPorVendor.get(vendor) ?? 0,
        ),
    )
}

/**
 * O caminho HTTP real — só credencial e transporte; a tradução é a de cima.
 *
 * O OpenAPI diz que player_props volta inteiro numa resposta ("no pagination
 * cursors"), mas pede-se per_page=100 e segue-se next_cursor SE ele um dia
 * aparecer — média calculada sobre página truncada é o pior defeito silencioso
 * possível deste produto.
 */
export function buscarPropsHttp(
  chave: string,
  baseUrl = 'https://api.balldontlie.io/nba',
  fetchFn: typeof fetch = fetch,
): (gameIdExterno: string) => Promise<unknown> {
  return async (gameIdExterno) => {
    const dados: unknown[] = []
    let cursor: number | undefined
    for (let pagina = 0; pagina < 50; pagina++) {
      const url =
        `${baseUrl}/v2/odds/player_props?game_id=${gameIdExterno}&per_page=100` +
        (cursor === undefined ? '' : `&cursor=${cursor}`)
      const resposta = await fetchFn(url, { headers: { Authorization: chave } })
      if (!resposta.ok) {
        throw new Error(`balldontlie player_props: HTTP ${resposta.status}`)
      }
      const corpo = (await resposta.json()) as {
        data?: unknown[]
        meta?: { next_cursor?: number }
      }
      dados.push(...(corpo.data ?? []))
      cursor = corpo.meta?.next_cursor
      if (cursor === undefined) break
    }
    return { data: dados, meta: { per_page: 100 } }
  }
}
