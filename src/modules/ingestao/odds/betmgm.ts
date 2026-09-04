import { z } from 'zod'

import type { Atributo } from '../../motor/tipos'
import { CasaFatiada } from './casa-fatiada'
import { linhaDoLadoOver } from './conversao'
import type { ConfigBetmgm } from './fontes'
import type { CasaDeAposta, CensoDaCasa, CotacaoExterna, EventoDaCasa } from './porta'

/**
 * Adapter BetMGM Afiliados V2 (migração de 2026).
 *
 * O que o PDF fixa e este adapter honra:
 *  - prefixo `/program/v1/api` + caminhos `/aff/v2/*`;
 *  - `lang`, `brand`, `location` em 100% das chamadas;
 *  - paginação por cursor: envelope { limit, nextCursor, data } e loop até
 *    `nextCursor` nulo (máx. 100/página) — média sobre página truncada é o
 *    pior defeito silencioso possível deste produto;
 *  - `matchState` rico: SÓ `PREMATCH` vira cotação (o card é pré-live), e
 *    isso é conferido de novo na hora de ler os mercados — um retry às 21h
 *    de um evento vinculado de manhã encontraria odds ao vivo;
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

/** `Bearer <chave>` por padrão; prefixo vazio manda a chave nua. */
function cabecalhos(config: ConfigBetmgm): Record<string, string> {
  const valor = config.authPrefix ? `${config.authPrefix} ${config.apiKey}` : config.apiKey
  return { [config.authHeader]: valor, accept: 'application/json' }
}

const envelope = z.object({
  nextCursor: z.string().nullish(),
  data: z.array(z.unknown()).nullish(),
})

/**
 * Loop de cursor do PDF: primeira chamada sem cursor; segue até null. Cursor
 * repetido é defeito da API e vira erro — sem isso, o loop devolveria a mesma
 * página 50 vezes e a média sairia de linhas duplicadas.
 */
async function paginar(
  config: ConfigBetmgm,
  caminho: string,
  extras: string,
  buscar: typeof fetch,
): Promise<unknown[]> {
  const dados: unknown[] = []
  const vistos = new Set<string>()
  let cursor: string | null | undefined
  for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina++) {
    const comCursor = cursor ? `${extras}&cursor=${encodeURIComponent(cursor)}` : extras
    const resposta = await buscar(url(config, caminho, `${comCursor}&limit=100`), {
      headers: cabecalhos(config),
    })
    if (!resposta.ok) throw new Error(`betmgm ${caminho}: HTTP ${resposta.status}`)
    const corpo = envelope.parse(await resposta.json())
    dados.push(...(corpo.data ?? []))
    cursor = corpo.nextCursor
    if (!cursor) break
    if (vistos.has(cursor)) throw new Error(`betmgm ${caminho}: cursor repetido (${cursor})`)
    vistos.add(cursor)
  }
  return dados
}

const eventoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  matchState: z.string().nullish(),
  eventName: z.string().nullish(),
  participants: z.array(z.object({ name: z.string().nullish() })).nullish(),
  startTime: z.string().nullish(),
})

/**
 * Eventos PREMATCH de basquete. A V2 não documenta filtro por data — o
 * recorte de DIA é do vínculo (data de referência do jogo canônico, no fuso
 * do ruleset); aqui basta o recorte de esporte e estado.
 */
export async function eventosDoDiaBetmgm(
  config: ConfigBetmgm,
  buscar: typeof fetch = fetch,
): Promise<EventoDaCasa[]> {
  const brutos = await paginar(
    config,
    'events',
    '&sportType=BASKETBALL&matchState=PREMATCH',
    buscar,
  )
  const eventos: EventoDaCasa[] = []
  for (const bruto of brutos) {
    const e = eventoSchema.safeParse(bruto)
    if (!e.success) continue
    if (e.data.matchState !== 'PREMATCH') continue // só pré-live vira coleta
    const [casa, visitante] = e.data.participants ?? []
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
    .nullish(),
  outcomes: z
    .array(z.object({ name: z.string().nullish(), formatDecimal: z.number().nullish() }))
    .nullish(),
})

const eventoComMercados = eventoSchema.extend({ betMarkets: z.array(z.unknown()).nullish() })

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

/** `lang` é configurável: o lado precisa ser lido em inglês E em português. */
const OVER = /^(over|mais de)\b/i
const UNDER = /^(under|menos de)\b/i

async function eventoDetalhado(
  config: ConfigBetmgm,
  eventoIdExterno: string,
  buscar: typeof fetch,
): Promise<z.infer<typeof eventoComMercados> | null> {
  const brutos = await paginar(
    config,
    'events',
    `&ids=${encodeURIComponent(eventoIdExterno)}&fields=BETMARKETS`,
    buscar,
  )
  for (const bruto of brutos) {
    const e = eventoComMercados.safeParse(bruto)
    if (e.success && e.data.id === eventoIdExterno) return e.data
  }
  return null
}

/**
 * Prop de jogador fora do mapa sai SEM atributo — é a coleta que a conta como
 * `aguardandoCuradoria`, o número que o runbook manda olhar. `descartadas`
 * fica para o que não é cotação de prop de forma nenhuma (moneyline, mercado
 * suspenso, linha inteira, sem lado over).
 */
export async function casasBetmgm(
  config: ConfigBetmgm,
  eventoIdExterno: string,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
): Promise<CasaDeAposta[]> {
  const evento = await eventoDetalhado(config, eventoIdExterno, buscar)
  if (!evento) return [new CasaFatiada('betmgm', eventoIdExterno, [], 0)]

  const mercados = evento.betMarkets ?? []
  // O vínculo pode ter sido feito de manhã e a coleta rodar de novo à noite:
  // fora de PREMATCH, nada deste evento é odd pré-live. Tudo vira descarte.
  if (evento.matchState !== 'PREMATCH') {
    return [new CasaFatiada('betmgm', eventoIdExterno, [], mercados.length)]
  }

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const mercadoBruto of mercados) {
    const m = mercadoSchema.safeParse(mercadoBruto)
    if (!m.success || m.data.betMarketStatus !== 'OPEN') {
      descartadas += 1
      continue
    }

    const nomeMercado = m.data.name ?? ''
    const specifiers = m.data.specifiers ?? []
    const jogador = doSpecifier(specifiers, CHAVES_DE_JOGADOR)
    const valorLinha = doSpecifier(specifiers, CHAVES_DE_LINHA)
    if (jogador === null || valorLinha === null) {
      descartadas += 1
      continue
    }
    const linha = linhaDoLadoOver(valorLinha.replace(',', '.'))
    if (linha === null) {
      descartadas += 1
      continue
    }

    const outcomes = m.data.outcomes ?? []
    const over = outcomes.find((o) => OVER.test(o.name ?? ''))
    const under = outcomes.find((o) => UNDER.test(o.name ?? ''))
    if (!over || over.formatDecimal == null || !Number.isFinite(over.formatDecimal)) {
      descartadas += 1
      continue
    }

    const atributo = atributoDoMercado(nomeMercado)
    itens.push({
      jogadorNomeNaCasa: jogador,
      nomeMercadoNaCasa: nomeMercado,
      linha,
      oddOver: over.formatDecimal,
      oddUnder:
        under?.formatDecimal != null && Number.isFinite(under.formatDecimal)
          ? under.formatDecimal
          : null,
      ...(atributo === undefined ? {} : { atributo }),
    })
  }

  return [new CasaFatiada('betmgm', eventoIdExterno, itens, descartadas)]
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
  const evento = await eventoDetalhado(config, eventoIdExterno, buscar)
  const porNome = new Map<string, number>()
  const jogadores = new Set<string>()
  for (const mercadoBruto of evento?.betMarkets ?? []) {
    const m = mercadoSchema.safeParse(mercadoBruto)
    if (!m.success) continue
    const nome = m.data.name ?? '(sem nome)'
    porNome.set(nome, (porNome.get(nome) ?? 0) + (m.data.outcomes ?? []).length)
    const jogador = doSpecifier(m.data.specifiers ?? [], CHAVES_DE_JOGADOR)
    if (jogador) jogadores.add(jogador)
  }
  return {
    mercados: [...porNome].map(([nome, cotacoesAtivas]) => ({ nome, cotacoesAtivas })),
    jogadores: [...jogadores],
  }
}
