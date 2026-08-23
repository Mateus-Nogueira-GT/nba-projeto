import { describe, expect, it } from 'vitest'

import { CasaFake } from '../odds/fake'
import type { CotacaoExterna } from '../odds/porta'

describe('porta de casa de aposta (spec 06, fatia 3)', () => {
  it('o fake devolve as cotações da fixture, no contrato da porta', async () => {
    const casa = new CasaFake('casa-alfa')
    const cotacoes = await casa.cotacoes('jogo-externo-1')

    expect(cotacoes.length).toBeGreaterThan(0)
    for (const c of cotacoes) {
      expect(typeof c.jogadorNomeNaCasa).toBe('string')
      expect(typeof c.nomeMercadoNaCasa).toBe('string')
      expect(typeof c.linha).toBe('number')
      expect(c.oddOver === null || typeof c.oddOver === 'number').toBe(true)
      expect(c.oddUnder === null || typeof c.oddUnder === 'number').toBe(true)
    }
  })

  it('duas casas fake trazem grafias divergentes do mesmo jogador', async () => {
    const alfa = await new CasaFake('casa-alfa').cotacoes('jogo-externo-1')
    const beta = await new CasaFake('casa-beta').cotacoes('jogo-externo-1')

    const nomesAlfa = alfa.map((c) => c.jogadorNomeNaCasa)
    const nomesBeta = beta.map((c) => c.jogadorNomeNaCasa)
    // A matéria-prima da reconciliação (fatia 4): mesmo jogador, grafias diferentes.
    expect(nomesAlfa).toContain('L. Doncic')
    expect(nomesBeta).toContain('Luka Doncic')
  })

  it('nenhum campo além do contrato atravessa a porta', async () => {
    const cotacoes = await new CasaFake('casa-alfa').cotacoes('jogo-externo-1')
    const chaves: (keyof CotacaoExterna)[] = [
      'jogadorNomeNaCasa',
      'nomeMercadoNaCasa',
      'linha',
      'oddOver',
      'oddUnder',
    ]
    for (const c of cotacoes) {
      expect(Object.keys(c).sort()).toEqual([...chaves].sort())
    }
  })

  it('jogo sem cotação devolve lista vazia, não erro', async () => {
    expect(await new CasaFake('casa-alfa').cotacoes('jogo-inexistente')).toEqual([])
  })
})
