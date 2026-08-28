import { describe, expect, it } from 'vitest'

import { fontesDeOdds, type AmbienteDeOdds } from '../odds/fontes'

const vazio = {} as AmbienteDeOdds
const betmgmOk = {
  ODDS_BETMGM_BASE_URL: 'https://afiliados.betmgm.example',
  ODDS_BETMGM_API_KEY: 'k',
  ODDS_BETMGM_BRAND: 'marca',
  ODDS_BETMGM_LOCATION: 'BR',
} as AmbienteDeOdds
const altenarOk = {
  ODDS_ALTENAR_GATEWAY_BASE: 'https://gw.altenar.example',
  ODDS_ALTENAR_ORIGIN: 'https://nosso.app',
  ODDS_ALTENAR_INTEGRATION: 'nossa',
  ODDS_ALTENAR_SPORT_ID: '67',
} as AmbienteDeOdds

describe('fontes de odds por ambiente', () => {
  it('sem env nenhum, nenhuma fonte — o app segue intacto', () => {
    expect(fontesDeOdds(vazio)).toEqual([])
  })

  it('config completa liga a fonte; padrões de auth preenchidos', () => {
    const [f] = fontesDeOdds(betmgmOk)
    expect(f).toMatchObject({ nome: 'betmgm' })
    if (f?.nome === 'betmgm') {
      expect(f.config.authHeader).toBe('Authorization')
      expect(f.config.authPrefix).toBe('Bearer ')
      expect(f.config.lang).toBe('en')
    }
  })

  it('config INCOMPLETA não liga meia-fonte — falta brand, fica fora', () => {
    const semBrand = { ...betmgmOk, ODDS_BETMGM_BRAND: undefined } as AmbienteDeOdds
    expect(fontesDeOdds(semBrand)).toEqual([])
  })

  it('env em branco não conta como preenchido', () => {
    const brancos = { ...altenarOk, ODDS_ALTENAR_SPORT_ID: '   ' } as AmbienteDeOdds
    expect(fontesDeOdds(brancos)).toEqual([])
  })

  it('champId da Altenar é opcional — ausente vira null, a fonte liga igual', () => {
    const [f] = fontesDeOdds(altenarOk)
    expect(f?.nome).toBe('altenar')
    if (f?.nome === 'altenar') expect(f.config.champId).toBeNull()
  })

  it('as duas juntas quando as duas estão completas', () => {
    const ambos = { ...betmgmOk, ...altenarOk } as AmbienteDeOdds
    expect(
      fontesDeOdds(ambos)
        .map((f) => f.nome)
        .sort(),
    ).toEqual(['altenar', 'betmgm'])
  })
})
