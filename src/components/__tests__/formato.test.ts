import { describe, expect, it } from 'vitest'

import { formatarAproveitamento } from '../formato'

/**
 * UM aproveitamento, UMA forma (correções de lógica 19/09, §4.2). A lateral
 * escrevia "89" e a tabela cheia "89,0" a 300 px de distância. A forma
 * vencedora é a da tabela: uma casa, vírgula — distingue 66,7 de 66,3 na
 * briga por play-in.
 */
describe('formatarAproveitamento', () => {
  it('uma casa decimal, vírgula, sem o símbolo (a unidade fica no cabeçalho)', () => {
    expect(formatarAproveitamento(0.8889)).toBe('88,9')
    expect(formatarAproveitamento(0.6667)).toBe('66,7')
    expect(formatarAproveitamento(1)).toBe('100,0')
    expect(formatarAproveitamento(0)).toBe('0,0')
  })

  it('null é travessão: temporada sem jogo não é zero por cento', () => {
    expect(formatarAproveitamento(null)).toBe('—')
  })
})
