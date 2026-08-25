import { describe, expect, it } from 'vitest'

import { autossemeaduraHabilitada } from '../demo/autossemeadura'

describe('autossemeaduraHabilitada', () => {
  it('só liga com a variável EXPLÍCITA', () => {
    expect(autossemeaduraHabilitada({ DEMO_AUTOSSEMEADURA: 'true' })).toBe(true)
  })

  it('desligada por padrão — o cron não sobrescreve banco de produção', () => {
    // A guarda que importa: no dia em que o provedor real for conectado,
    // basta a variável não existir para o re-seed nunca rodar.
    expect(autossemeaduraHabilitada({})).toBe(false)
    expect(autossemeaduraHabilitada({ DEMO_AUTOSSEMEADURA: 'false' })).toBe(false)
    expect(autossemeaduraHabilitada({ DEMO_AUTOSSEMEADURA: '1' })).toBe(false)
    expect(autossemeaduraHabilitada({ DEMO_AUTOSSEMEADURA: 'TRUE' })).toBe(false)
  })
})
