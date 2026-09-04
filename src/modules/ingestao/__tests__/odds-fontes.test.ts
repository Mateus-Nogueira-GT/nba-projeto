import { describe, expect, it } from 'vitest'

import { fontesDeOdds, fontesIncompletas, type AmbienteDeOdds } from '../odds/fontes'

const vazio = {} as AmbienteDeOdds
const betmgmOk: AmbienteDeOdds = {
  ODDS_BETMGM_BASE_URL: 'https://afiliados.betmgm.example/',
  ODDS_BETMGM_API_KEY: 'k',
  ODDS_BETMGM_BRAND: 'marca',
  ODDS_BETMGM_LOCATION: 'BR',
}
const altenarOk: AmbienteDeOdds = {
  ODDS_ALTENAR_GATEWAY_BASE: 'https://gw.altenar.example',
  ODDS_ALTENAR_ORIGIN: 'https://nosso.app',
  ODDS_ALTENAR_INTEGRATION: 'nossa',
  ODDS_ALTENAR_SPORT_ID: '67',
}

describe('fontes de odds por ambiente', () => {
  it('sem env nenhum, nenhuma fonte — o app segue intacto', () => {
    expect(fontesDeOdds(vazio)).toEqual([])
    expect(fontesIncompletas(vazio)).toEqual([])
  })

  it('config completa liga a fonte; padrões preenchidos; barra final da URL removida', () => {
    const [f] = fontesDeOdds(betmgmOk)
    expect(f?.nome).toBe('betmgm')
    if (f?.nome === 'betmgm') {
      expect(f.config.baseUrl).toBe('https://afiliados.betmgm.example')
      expect(f.config.authHeader).toBe('Authorization')
      expect(f.config.authPrefix).toBe('Bearer')
      expect(f.config.lang).toBe('en')
    }
  })

  it('o prefixo NÃO depende de espaço sobreviver ao painel: "Bearer " e "Bearer" são iguais; vazio é escolha', () => {
    const le = (prefixo: string | undefined) => {
      const [f] = fontesDeOdds({ ...betmgmOk, ODDS_BETMGM_AUTH_PREFIX: prefixo })
      return f?.nome === 'betmgm' ? f.config.authPrefix : null
    }
    expect(le('Bearer ')).toBe('Bearer')
    expect(le(' Token')).toBe('Token')
    expect(le('')).toBe('')
    expect(le(undefined)).toBe('Bearer')
  })

  it('config INCOMPLETA não liga meia-fonte — e diz o que falta', () => {
    const semBrand = { ...betmgmOk, ODDS_BETMGM_BRAND: undefined }
    expect(fontesDeOdds(semBrand)).toEqual([])
    expect(fontesIncompletas(semBrand)).toEqual([{ nome: 'betmgm', faltam: ['ODDS_BETMGM_BRAND'] }])
  })

  it('env em branco não conta como preenchido', () => {
    const brancos = { ...altenarOk, ODDS_ALTENAR_SPORT_ID: '   ' }
    expect(fontesDeOdds(brancos)).toEqual([])
    expect(fontesIncompletas(brancos)).toEqual([{ nome: 'altenar', faltam: ['ODDS_ALTENAR_SPORT_ID'] }])
  })

  it('champId da Altenar é opcional — ausente vira null, a fonte liga igual', () => {
    const [f] = fontesDeOdds(altenarOk)
    expect(f?.nome).toBe('altenar')
    if (f?.nome === 'altenar') expect(f.config.champId).toBeNull()
  })

  it('as duas juntas quando as duas estão completas', () => {
    const ambos = { ...betmgmOk, ...altenarOk }
    expect(fontesDeOdds(ambos).map((f) => f.nome).sort()).toEqual(['altenar', 'betmgm'])
    expect(fontesIncompletas(ambos)).toEqual([])
  })
})
