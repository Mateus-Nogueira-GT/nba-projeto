/**
 * QUAIS CASAS ESTÃO LIGADAS — decisão única, por ambiente.
 *
 * Fonte só existe com config COMPLETA: meia-config ligaria uma coleta que
 * falha todo dia às 9h em silêncio. Sem env nenhum, lista vazia e o app
 * inteiro segue como hoje (a tabela estática é o fallback das telas).
 *
 * ADR-0004: tudo aqui é credencial de LEITURA de feed público. Não existe env
 * de conta de apostador, e nunca vai existir.
 */
export type ConfigBetmgm = {
  baseUrl: string
  apiKey: string
  /** O PDF não fixa o esquema de credencial — header e prefixo são config. */
  authHeader: string
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

/** `process.env` visto como o que ele é aqui: um mapa de strings opcionais. */
export type AmbienteDeOdds = Record<string, string | undefined>

export type FonteOdds =
  | { nome: 'betmgm'; config: ConfigBetmgm }
  | { nome: 'altenar'; config: ConfigAltenar }

const limpo = (v: string | undefined): string | null => {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

export function fontesDeOdds(ambiente: AmbienteDeOdds = process.env): FonteOdds[] {
  const fontes: FonteOdds[] = []

  const bBase = limpo(ambiente.ODDS_BETMGM_BASE_URL)
  const bKey = limpo(ambiente.ODDS_BETMGM_API_KEY)
  const bBrand = limpo(ambiente.ODDS_BETMGM_BRAND)
  const bLocation = limpo(ambiente.ODDS_BETMGM_LOCATION)
  if (bBase && bKey && bBrand && bLocation) {
    fontes.push({
      nome: 'betmgm',
      config: {
        baseUrl: bBase.replace(/\/+$/, ''),
        apiKey: bKey,
        authHeader: limpo(ambiente.ODDS_BETMGM_AUTH_HEADER) ?? 'Authorization',
        authPrefix: ambiente.ODDS_BETMGM_AUTH_PREFIX ?? 'Bearer ',
        brand: bBrand,
        location: bLocation,
        lang: limpo(ambiente.ODDS_BETMGM_LANG) ?? 'en',
      },
    })
  }

  const aBase = limpo(ambiente.ODDS_ALTENAR_GATEWAY_BASE)
  const aOrigin = limpo(ambiente.ODDS_ALTENAR_ORIGIN)
  const aIntegration = limpo(ambiente.ODDS_ALTENAR_INTEGRATION)
  const aSport = limpo(ambiente.ODDS_ALTENAR_SPORT_ID)
  if (aBase && aOrigin && aIntegration && aSport) {
    fontes.push({
      nome: 'altenar',
      config: {
        gatewayBase: aBase.replace(/\/+$/, ''),
        origin: aOrigin,
        integration: aIntegration,
        sportId: aSport,
        champId: limpo(ambiente.ODDS_ALTENAR_CHAMP_ID),
      },
    })
  }

  return fontes
}
