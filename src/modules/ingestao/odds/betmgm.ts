import { z } from 'zod'

import type { Atributo } from '../../motor/tipos'
import { linhaDoLadoOver } from './conversao'
import type { ConfigBetmgm } from './fontes'
import type { CasaDeAposta, CensoDaCasa, CotacaoExterna } from './porta'

/**
 * Adapter BetMGM Afiliados V2 (migração de 2026).
 *
 * O que o PDF fixa e este adapter honra:
 *  - prefixo `/program/v1/api` + caminhos `/aff/v2/*`;
 *  - `lang`, `brand`, `location` em 100% das chamadas;
 *  - paginação por cursor: envelope { limit, nextCursor, data } e loop até
 *    `nextCursor` nulo (máx. 100/página) — média sobre página truncada é o
 *    pior defeito silencioso possível deste produto;
 *  - `matchState` rico: SÓ `PREMATCH` vira cotação (o card é pré-live);
 *    qualquer outro estado é ignorado sem erro;
 *  - `eventName` pode ser nulo: o confronto sai de `participants`;
 *  - odds decimais NUMÉRICAS em `formatDecimal` (sem conversão americana);
 *  - `probability` existe e é IGNORADA: o % do produto é score de confiança,
 *    e a palavra "probabilidade" não existe em nenhuma superfície do app.
 *
 * O que o PDF NÃO fixa (e por isso é config ou censo): o host, o esquema de
 * credencial e a grafia exata dos props de NBA. Ver a spec, seção 8.
 */

/** Teto do loop de cursor: 5.000 eventos bastam para qualquer noite de NBA. */
const LIMITE_PAGINAS = 50

function url(config: ConfigBetmgm, caminho: string, extras: string): string {
  return (
    `${config.baseUrl}/program/v1/api/aff/v2/${caminho}?lang=${config.lang}` +
    `&brand=${config.brand}&location=${config.location}${extras}`
  )
}

function cabecalhos(config: ConfigBetmgm): Record<string, string> {
  return {
    [config.authHeader]: `${config.authPrefix}${config.apiKey}`,
    accept: 'application/json',
  }
}

const envelope = z.object({
  nextCursor: z.string().nullish(),
  data: z.array(z.unknown()).default([]),
})

/** Loop de cursor do PDF: primeira chamada sem cursor; segue até null. */
async function paginar(
  config: ConfigBetmgm,
  caminho: string,
  extras: string,
  buscar: typeof fetch,
): Promise<unknown[]> {
  const dados: unknown[] = []
  let cursor: string | null | undefined
  for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina++) {
    const comCursor = cursor ? `${extras}&cursor=${encodeURIComponent(cursor)}` : extras
    const resposta = await buscar(url(config, caminho, `${comCursor}&limit=100`), {
      headers: cabecalhos(config),
    })
    if (!resposta.ok) throw new Error(`betmgm ${caminho}: HTTP ${resposta.status}`)
    const corpo = envelope.parse(await resposta.json())
    dados.push(...corpo.data)
    cursor = corpo.nextCursor
    if (!cursor) break
  }
  return dados
}

const eventoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  matchState: z.string().nullish(),
  eventName: z.string().nullish(),
  participants: z.array(z.object({ name: z.string().nullish() })).default([]),
  startTime: z.string().nullish(),
})

export type EventoBetmgm = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
}

export async function eventosDoDiaBetmgm(
  config: ConfigBetmgm,
  _dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoBetmgm[]> {
  // O recorte fino de DIA é do vínculo (data de referência do jogo canônico);
  // aqui basta o recorte de esporte e estado — o filtro que a V2 declara.
  const brutos = await paginar(
    config,
    'events',
    '&sportType=BASKETBALL&matchState=PREMATCH',
    buscar,
  )
  const eventos: EventoBetmgm[] = []
  for (const bruto of brutos) {
    const e = eventoSchema.safeParse(bruto)
    if (!e.success) continue
    if (e.data.matchState !== 'PREMATCH') continue // só pré-live vira coleta
    const [casa, visitante] = e.data.participants
    eventos.push({
      idExterno: e.data.id,
      nomeCasa: casa?.name ?? null,
      nomeVisitante: visitante?.name ?? null,
      inicioIso: e.data.startTime ?? null,
    })
  }
  return eventos
}

const mercadoSchema = z.object({
  name: z.string().nullish(),
  betMarketStatus: z.string().nullish(),
  specifiers: z
    .array(
      z.object({
        name: z.string().nullish(),
        value: z.union([z.string(), z.number()]).transform(String).nullish(),
      }),
    )
    .default([]),
  outcomes: z
    .array(z.object({ name: z.string().nullish(), formatDecimal: z.number().nullish() }))
    .default([]),
})

const eventoComMercados = eventoSchema.extend({ betMarkets: z.array(z.unknown()).default([]) })

/** Chaves de specifier onde a linha costuma viver — o censo confirma o real. */
const CHAVES_DE_LINHA = ['line', 'total', 'points', 'handicap']
const CHAVES_DE_JOGADOR = ['player', 'participant', 'playername']

function doSpecifier(
  specifiers: { name?: string | null; value?: string | null }[],
  chaves: string[],
): string | null {
  for (const s of specifiers) {
    if (s.name && chaves.includes(s.name.toLowerCase()) && s.value) return s.value
  }
  return null
}

class CasaBetmgm implements CasaDeAposta {
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
        `betmgm: casa fatiada para o evento ${this.eventoIdExterno}, pedido ${jogoIdExterno}`,
      )
    }
    return this.itens.map((c) => ({ ...c }))
  }
  descartadas(): number {
    return this.#descartadas
  }
}

export async function casasBetmgm(
  config: ConfigBetmgm,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
  eventoIdExterno = '',
): Promise<CasaDeAposta[]> {
  const brutos = await paginar(
    config,
    'events',
    `&ids=${encodeURIComponent(eventoIdExterno)}&fields=BETMARKETS`,
    buscar,
  )

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const bruto of brutos) {
    const e = eventoComMercados.safeParse(bruto)
    if (!e.success || e.data.id !== eventoIdExterno) continue

    for (const mercadoBruto of e.data.betMarkets) {
      const m = mercadoSchema.safeParse(mercadoBruto)
      if (!m.success) {
        descartadas += 1
        continue
      }
      if (m.data.betMarketStatus !== 'OPEN') {
        descartadas += 1
        continue
      }

      const nomeMercado = m.data.name ?? ''
      const atributo = atributoDoMercado(nomeMercado)
      const jogador = doSpecifier(m.data.specifiers, CHAVES_DE_JOGADOR)
      const valorLinha = doSpecifier(m.data.specifiers, CHAVES_DE_LINHA)

      if (atributo === undefined || jogador === null || valorLinha === null) {
        descartadas += 1
        continue
      }
      const linha = linhaDoLadoOver(valorLinha.replace(',', '.'))
      if (linha === null) {
        descartadas += 1
        continue
      }

      const over = m.data.outcomes.find((o) => /^over/i.test(o.name ?? ''))
      const under = m.data.outcomes.find((o) => /^under/i.test(o.name ?? ''))
      if (!over || over.formatDecimal == null || !Number.isFinite(over.formatDecimal)) {
        descartadas += 1
        continue
      }
      itens.push({
        jogadorNomeNaCasa: jogador,
        nomeMercadoNaCasa: nomeMercado,
        linha,
        oddOver: over.formatDecimal,
        oddUnder:
          under?.formatDecimal != null && Number.isFinite(under.formatDecimal)
            ? under.formatDecimal
            : null,
        atributo,
      })
    }
  }

  return [new CasaBetmgm('betmgm', eventoIdExterno, itens, descartadas)]
}

/**
 * Censo de um evento: TODO nome de mercado com a contagem de resultados, mais
 * os nomes de jogador dos specifiers. Sem mapa e sem descarte — é o que a
 * curadoria lê no dia da conta, antes de existir mapa nenhum.
 */
export async function censoBetmgm(
  config: ConfigBetmgm,
  eventoIdExterno: string,
  buscar: typeof fetch = fetch,
): Promise<CensoDaCasa> {
  const brutos = await paginar(
    config,
    'events',
    `&ids=${encodeURIComponent(eventoIdExterno)}&fields=BETMARKETS`,
    buscar,
  )
  const mercados: CensoDaCasa['mercados'] = []
  const jogadores = new Set<string>()
  for (const bruto of brutos) {
    const e = eventoComMercados.safeParse(bruto)
    if (!e.success || e.data.id !== eventoIdExterno) continue
    for (const mercadoBruto of e.data.betMarkets) {
      const m = mercadoSchema.safeParse(mercadoBruto)
      if (!m.success) continue
      mercados.push({ nome: m.data.name ?? '(sem nome)', cotacoesAtivas: m.data.outcomes.length })
      const jogador = doSpecifier(m.data.specifiers, CHAVES_DE_JOGADOR)
      if (jogador) jogadores.add(jogador)
    }
  }
  return { mercados, jogadores: [...jogadores] }
}
