import { describe, expect, it } from 'vitest'
import { ehTemporadaAnterior, temporadaDaTela, temporadaDaUrl } from '../temporada'

const opcoes = { exibida: '2025-26', disponiveis: ['2025-26', '2026-27'] }
describe('temporadaDaUrl', () => {
  it('aceita uma temporada disponível', () => expect(temporadaDaUrl('2026-27', opcoes)).toBe('2026-27'))
  it('lixo cai na exibida', () => expect(temporadaDaUrl('abc', opcoes)).toBe('2025-26'))
  it('temporada sem dado cai na exibida', () => expect(temporadaDaUrl('2019-20', opcoes)).toBe('2025-26'))
  it('array (param repetido) cai na exibida', () => expect(temporadaDaUrl(['2026-27', 'x'], opcoes)).toBe('2025-26'))
  it('ausente cai na exibida', () => expect(temporadaDaUrl(undefined, opcoes)).toBe('2025-26'))
})
describe('ehTemporadaAnterior', () => {
  it('a do calendário não é anterior', () => expect(ehTemporadaAnterior('2026-27', '2026-27')).toBe(false))
  it('uma que já passou é', () => expect(ehTemporadaAnterior('2025-26', '2026-27')).toBe(true))
  // Uma temporada FUTURA (jogo gravado com rótulo adiantado, pré-temporada)
  // não é anterior: não abre profundidade para o grátis nem vira retroativo.
  it('uma futura não é', () => expect(ehTemporadaAnterior('2027-28', '2026-27')).toBe(false))
  it('no formato ano_inicial também', () => {
    expect(ehTemporadaAnterior('2025', '2026')).toBe(true)
    expect(ehTemporadaAnterior('2027', '2026')).toBe(false)
  })
})

describe('temporadaDaTela — o padrão sem escolha', () => {
  const base = { doCalendario: '2026-27', exibida: '2025-26', disponiveis: ['2025-26', '2026-27'] }
  it('no hiato, sem parâmetro, abre a exibida (a anterior)', () =>
    expect(temporadaDaTela(undefined, { ...base, emHiato: true })).toEqual({ temporada: '2025-26', escolhida: false }))
  it('fora do hiato, sem parâmetro, abre a do calendário — mesmo com a exibida atrasada', () =>
    expect(temporadaDaTela(undefined, { ...base, emHiato: false })).toEqual({ temporada: '2026-27', escolhida: false }))
  it('lixo e parâmetro repetido são o mesmo que nenhum', () => {
    for (const emHiato of [true, false]) {
      const nenhum = temporadaDaTela(undefined, { ...base, emHiato })
      for (const v of ['lixo', '2019-20', ['2026-27', '2025-26'], '']) {
        expect(temporadaDaTela(v, { ...base, emHiato })).toEqual(nenhum)
      }
    }
  })
  it('a escolha explícita vale, inclusive a do calendário no hiato', () => {
    expect(temporadaDaTela('2026-27', { ...base, emHiato: true })).toEqual({ temporada: '2026-27', escolhida: true })
    expect(temporadaDaTela('2025-26', { ...base, emHiato: false })).toEqual({ temporada: '2025-26', escolhida: true })
  })
})
