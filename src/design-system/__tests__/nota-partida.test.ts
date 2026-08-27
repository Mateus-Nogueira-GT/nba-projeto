import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NotaPartida } from '../componentes'
import { CONFIANCA_GRAU } from '../tokens/css'

describe('badge da nota da partida', () => {
  it('imprime com vírgula e uma casa — é português', () => {
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: 8.4 }))
    expect(html).toContain('8,4')
    expect(html).not.toContain('8.4')
  })

  it('nota ausente vira travessão, não zero', () => {
    // Zero é um número; ausência não é. Regra do projeto inteiro.
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: null }))
    expect(html).toContain('—')
    expect(html).not.toContain('0')
  })

  it('a cor muda com a faixa — não é decoração, é leitura de relance', () => {
    const fraca = renderToStaticMarkup(createElement(NotaPartida, { nota: 4.5 }))
    const excepcional = renderToStaticMarkup(createElement(NotaPartida, { nota: 9.4 }))
    expect(fraca).not.toBe(excepcional)
  })

  it('NÃO reusa a paleta do grau de confiança do apito', () => {
    // As duas escalas aparecem no mesmo app. Se dividissem cores, o assinante
    // leria "verde" como a mesma coisa nas duas — e uma é desempenho passado,
    // a outra é força de um sinal de estratégia.
    const cores = Object.values(CONFIANCA_GRAU)
    for (const nota of [3, 5.5, 6.5, 7.5, 8.5, 9.5, 10]) {
      const html = renderToStaticMarkup(createElement(NotaPartida, { nota }))
      for (const cor of cores) {
        expect(html.toLowerCase()).not.toContain(String(cor).toLowerCase())
      }
    }
  })

  it('nunca escreve "probabilidade" nem "nível"', () => {
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: 7 })).toLowerCase()
    expect(html).not.toContain('probabilidade')
    expect(html).not.toContain('nível')
  })
})
