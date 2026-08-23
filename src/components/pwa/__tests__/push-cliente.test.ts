import { describe, expect, it } from 'vitest'

import { converterChaveVapid, lerAmbientePush } from '../push-cliente'
import { lerAmbienteInstalacaoPwa } from '../pwa-cliente'

describe('cliente Web Push', () => {
  it('converte a chave VAPID base64url sem depender de padding', () => {
    expect(Array.from(converterChaveVapid('AQL_'))).toEqual([1, 2, 255])
  })

  it('rejeita chave VAPID vazia ou inválida', () => {
    expect(() => converterChaveVapid('')).toThrow(/não configurada/)
    expect(() => converterChaveVapid('%%%')).toThrow(/inválida/)
  })

  it('no servidor informa indisponibilidade sem tocar APIs do navegador', () => {
    expect(lerAmbientePush()).toEqual({
      contextoSeguro: false,
      suportado: false,
      iosInstalavel: false,
      instalado: false,
      permissao: 'indisponivel',
    })
    expect(lerAmbienteInstalacaoPwa()).toEqual({
      contextoSeguro: false,
      serviceWorker: false,
      instalado: false,
      iosComInstalacaoManual: false,
    })
  })
})
