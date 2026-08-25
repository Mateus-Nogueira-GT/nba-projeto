import { describe, expect, it } from 'vitest'

import { comFiltro, comQuantidade, type Recorte } from '../lista-secreta-rotas'

const RECORTE_CHEIO: Recorte = {
  quantidade: 5,
  metodo: 'OPD',
  nivel: 'MVP',
  time: 'LAL',
  posicao: 'G',
  atributo: 'PONTOS',
}

describe('rotas dos filtros da Lista Secreta', () => {
  it('trocar a QUANTIDADE preserva os outros cinco recortes', () => {
    // A regressão: os chips de quantidade montavam `/?quantidade=N` seco e
    // varriam método, nível, time, posição e atributo do usuário.
    const url = comQuantidade(RECORTE_CHEIO, 2)
    const p = new URLSearchParams(url.split('?')[1])
    expect(p.get('quantidade')).toBe('2')
    expect(p.get('metodo')).toBe('OPD')
    expect(p.get('nivel')).toBe('MVP')
    expect(p.get('time')).toBe('LAL')
    expect(p.get('posicao')).toBe('G')
    expect(p.get('atributo')).toBe('PONTOS')
  })

  it('"Lista inteira" apaga só a quantidade, não o recorte', () => {
    const p = new URLSearchParams(comQuantidade(RECORTE_CHEIO, 0).split('?')[1])
    expect(p.has('quantidade')).toBe(false)
    expect(p.get('metodo')).toBe('OPD')
    expect(p.get('atributo')).toBe('PONTOS')
  })

  it('o chip "Todos" de um campo não derruba a quantidade escolhida', () => {
    const p = new URLSearchParams(comFiltro(RECORTE_CHEIO, 'nivel', undefined).split('?')[1])
    expect(p.has('nivel')).toBe(false)
    expect(p.get('quantidade')).toBe('5')
    expect(p.get('metodo')).toBe('OPD')
  })

  it('sem nenhum recorte a URL é a raiz limpa', () => {
    expect(comQuantidade({ quantidade: 0 }, 0)).toBe('/')
  })
})
