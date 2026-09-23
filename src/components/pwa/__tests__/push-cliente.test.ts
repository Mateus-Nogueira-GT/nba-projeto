import { describe, expect, it } from 'vitest'

import { converterChaveVapid, deveEnviarInscricao, lerAmbientePush } from '../push-cliente'
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

describe('deveEnviarInscricao', () => {
  const atual = { usuarioId: 'u1', endpoint: 'https://push/1', p256dh: 'P', auth: 'A' }
  const AGORA = Date.parse('2026-11-03T12:00:00Z')
  const guardar = (o: object) => JSON.stringify({ ...atual, enviadoEm: AGORA - 60_000, ...o })

  it('nada guardado → envia', () => expect(deveEnviarInscricao(null, atual, AGORA)).toBe(true))
  it('igual e recente → não envia', () =>
    expect(deveEnviarInscricao(guardar({}), atual, AGORA)).toBe(false))
  it('endpoint mudou → envia', () =>
    expect(deveEnviarInscricao(guardar({ endpoint: 'https://push/2' }), atual, AGORA)).toBe(true))
  it('outra conta no mesmo aparelho → envia (reassociação)', () =>
    expect(deveEnviarInscricao(guardar({ usuarioId: 'u2' }), atual, AGORA)).toBe(true))
  it('mais de 24 h → envia (reativa inscrição invalidada no servidor)', () =>
    expect(
      deveEnviarInscricao(guardar({ enviadoEm: AGORA - 24 * 3600_000 - 1 }), atual, AGORA),
    ).toBe(true))
  it('guardado corrompido → envia', () =>
    expect(deveEnviarInscricao('{x', atual, AGORA)).toBe(true))
})
