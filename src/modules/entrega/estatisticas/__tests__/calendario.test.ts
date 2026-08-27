import { describe, expect, it } from 'vitest'

import { dataValidaOuHoje, navegacaoDeDatas } from '../calendario'

describe('data da aba de estatísticas', () => {
  it('sem parâmetro é hoje', () => {
    expect(dataValidaOuHoje(undefined, '2026-08-26')).toBe('2026-08-26')
  })

  it('aceita uma data bem formada', () => {
    expect(dataValidaOuHoje('2026-08-20', '2026-08-26')).toBe('2026-08-20')
  })

  it('lixo na URL vira HOJE, não erro nem tela vazia', () => {
    // A URL é digitável por qualquer um. Um 500 aqui seria um 500 por
    // curiosidade do usuário.
    for (const lixo of ['ontem', '26-08-2026', '2026-13-45', '', 'null', '2026-08']) {
      expect(dataValidaOuHoje(lixo, '2026-08-26'), lixo).toBe('2026-08-26')
    }
  })

  it('data impossível no calendário cai para hoje', () => {
    // 31 de fevereiro casa com a regex mas não existe.
    expect(dataValidaOuHoje('2026-02-31', '2026-08-26')).toBe('2026-08-26')
  })

  it('a navegação anda um dia para cada lado', () => {
    const n = navegacaoDeDatas('2026-08-26')
    expect(n.anterior).toBe('2026-08-25')
    expect(n.seguinte).toBe('2026-08-27')
  })

  it('atravessa a virada do mês sem tropeçar', () => {
    expect(navegacaoDeDatas('2026-08-31').seguinte).toBe('2026-09-01')
    expect(navegacaoDeDatas('2026-09-01').anterior).toBe('2026-08-31')
  })
})
