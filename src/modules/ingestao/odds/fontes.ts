/**
 * QUAIS CASAS ESTÃO LIGADAS — decisão única, por ambiente.
 *
 * Fonte só existe com config COMPLETA: meia-config ligaria uma coleta que
 * falha todo dia às 9h em silêncio. Sem env nenhum, lista vazia e o app
 * inteiro segue como hoje (a tabela estática é o fallback das telas). E
 * meia-config não é silêncio: `fontesIncompletas` diz o que falta.
 *
 * ADR-0004: tudo aqui é credencial de LEITURA de feed público. Não existe env
 * de conta de apostador, e nunca vai existir.
 */
export type ConfigBetmgm = {
  baseUrl: string
  apiKey: string
  /** O PDF não fixa o esquema de credencial — header e prefixo são config. */
  authHeader: string
  /** Esquema SEM o espaço ('Bearer'); vazio manda a chave nua. O adapter junta. */
  authPrefix: string
  brand: string
  location: string
  lang: string
}

export type ConfigAltenar = {
  gatewayBase: string
  origin: string
  integration: string
  sportId: string
  champId: string | null
}

/**
 * O offer server da Superbet é particionado POR MERCADO no host
 * (`production-superbet-offer-br…`, `-ro`, `-pl`…). Por isso não existe env
 * de "país": o país já está na `baseUrl`.
 *
 * Os dois caminhos foram confirmados contra o feed em 22/09/2026 e por isso
 * têm padrão. Continuam configuráveis porque são a superfície que a casa pode
 * mexer sem avisar ninguém — e trocar env é mais barato que soltar deploy.
 */
export type ConfigSuperbet = {
  baseUrl: string
  locale: string
  sportId: string
  champId: string | null
  /** Template da lista (SSE): aceita {locale} {sportId} {champId} {dia} {diaSeguinte}. */
  caminhoEventos: string
  /** Template do evento avulso (JSON): aceita {locale} {id} {sportId}. */
  caminhoEvento: string
  /**
   * Janela de leitura do SSE. A lista é uma ASSINATURA: não fecha sozinha.
   * Lê-se o retrato inicial e para — sem isso a coleta penduraria e o cron
   * estouraria o prazo.
   */
  janelaMs: number
  /** O feed é aberto; se a conta vier com credencial, ela entra aqui. */
  apiKey: string | null
  authHeader: string
  authPrefix: string
}

/** `process.env` visto como o que ele é aqui: um mapa de strings opcionais. */
export type AmbienteDeOdds = Record<string, string | undefined>

export type FonteOdds =
  | { nome: 'betmgm'; config: ConfigBetmgm }
  | { nome: 'altenar'; config: ConfigAltenar }
  | { nome: 'superbet'; config: ConfigSuperbet }

export type NomeDeFonte = FonteOdds['nome']

const OBRIGATORIAS: Record<NomeDeFonte, string[]> = {
  betmgm: ['ODDS_BETMGM_BASE_URL', 'ODDS_BETMGM_API_KEY', 'ODDS_BETMGM_BRAND', 'ODDS_BETMGM_LOCATION'],
  altenar: [
    'ODDS_ALTENAR_GATEWAY_BASE',
    'ODDS_ALTENAR_ORIGIN',
    'ODDS_ALTENAR_INTEGRATION',
    'ODDS_ALTENAR_SPORT_ID',
  ],
  superbet: ['ODDS_SUPERBET_BASE_URL', 'ODDS_SUPERBET_LOCALE', 'ODDS_SUPERBET_SPORT_ID'],
}

const limpo = (v: string | undefined): string | null => {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

function faltando(ambiente: AmbienteDeOdds, nome: NomeDeFonte): string[] {
  return OBRIGATORIAS[nome].filter((chave) => limpo(ambiente[chave]) === null)
}

export function fontesDeOdds(ambiente: AmbienteDeOdds = process.env): FonteOdds[] {
  const fontes: FonteOdds[] = []

  if (faltando(ambiente, 'betmgm').length === 0) {
    fontes.push({
      nome: 'betmgm',
      config: {
        baseUrl: limpo(ambiente.ODDS_BETMGM_BASE_URL)!.replace(/\/+$/, ''),
        apiKey: limpo(ambiente.ODDS_BETMGM_API_KEY)!,
        authHeader: limpo(ambiente.ODDS_BETMGM_AUTH_HEADER) ?? 'Authorization',
        // Definida-e-vazia é uma escolha ('sem prefixo'); ausente é o padrão.
        authPrefix:
          ambiente.ODDS_BETMGM_AUTH_PREFIX === undefined
            ? 'Bearer'
            : ambiente.ODDS_BETMGM_AUTH_PREFIX.trim(),
        brand: limpo(ambiente.ODDS_BETMGM_BRAND)!,
        location: limpo(ambiente.ODDS_BETMGM_LOCATION)!,
        lang: limpo(ambiente.ODDS_BETMGM_LANG) ?? 'en',
      },
    })
  }

  if (faltando(ambiente, 'altenar').length === 0) {
    fontes.push({
      nome: 'altenar',
      config: {
        gatewayBase: limpo(ambiente.ODDS_ALTENAR_GATEWAY_BASE)!.replace(/\/+$/, ''),
        origin: limpo(ambiente.ODDS_ALTENAR_ORIGIN)!,
        integration: limpo(ambiente.ODDS_ALTENAR_INTEGRATION)!,
        sportId: limpo(ambiente.ODDS_ALTENAR_SPORT_ID)!,
        champId: limpo(ambiente.ODDS_ALTENAR_CHAMP_ID),
      },
    })
  }

  if (faltando(ambiente, 'superbet').length === 0) {
    fontes.push({
      nome: 'superbet',
      config: {
        baseUrl: limpo(ambiente.ODDS_SUPERBET_BASE_URL)!.replace(/\/+$/, ''),
        locale: limpo(ambiente.ODDS_SUPERBET_LOCALE)!,
        sportId: limpo(ambiente.ODDS_SUPERBET_SPORT_ID)!,
        champId: limpo(ambiente.ODDS_SUPERBET_CHAMP_ID),
        caminhoEventos:
          limpo(ambiente.ODDS_SUPERBET_EVENTOS_PATH) ??
          '/v3/subscription/{locale}/prematch?sports={sportId}',
        caminhoEvento:
          limpo(ambiente.ODDS_SUPERBET_EVENTO_PATH) ??
          '/v3/{locale}/events?events={id}&includeOnly=fixture,markets',
        janelaMs: Number(limpo(ambiente.ODDS_SUPERBET_JANELA_MS) ?? '5000') || 5000,
        apiKey: limpo(ambiente.ODDS_SUPERBET_API_KEY),
        authHeader: limpo(ambiente.ODDS_SUPERBET_AUTH_HEADER) ?? 'Authorization',
        authPrefix:
          ambiente.ODDS_SUPERBET_AUTH_PREFIX === undefined
            ? 'Bearer'
            : ambiente.ODDS_SUPERBET_AUTH_PREFIX.trim(),
      },
    })
  }

  return fontes
}

/**
 * Fontes que alguém COMEÇOU a configurar e não terminou — pelo menos uma env
 * obrigatória preenchida, pelo menos uma faltando. É a diferença entre
 * "desligada de propósito" e "esqueci o brand": a segunda merece um aviso.
 */
export function fontesIncompletas(
  ambiente: AmbienteDeOdds = process.env,
): { nome: NomeDeFonte; faltam: string[] }[] {
  const incompletas: { nome: NomeDeFonte; faltam: string[] }[] = []
  for (const nome of Object.keys(OBRIGATORIAS) as NomeDeFonte[]) {
    const faltam = faltando(ambiente, nome)
    if (faltam.length > 0 && faltam.length < OBRIGATORIAS[nome].length) {
      incompletas.push({ nome, faltam })
    }
  }
  return incompletas
}
