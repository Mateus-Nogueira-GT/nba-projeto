import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Barrinhas } from '../componentes/Barrinhas'
import { semantico } from '../tokens/semantico'

describe('Barrinhas', () => {
  const jogos = [
    { valor: 30, bateu: true },
    { valor: 20, bateu: false },
  ]

  it('mostra o valor de cada jogo com a cor de bateu/falhou', () => {
    const html = renderToStaticMarkup(createElement(Barrinhas, { jogos }))
    expect(html).toContain('>30<')
    expect(html).toContain('>20<')
    expect(html).toContain(semantico.barrinhaBateu)
    expect(html).toContain(semantico.barrinhaFalhou)
  })

  it('conta os acertos no aria-label e aceita rótulo', () => {
    const html = renderToStaticMarkup(
      createElement(Barrinhas, { jogos, rotulo: 'ÚLT. 5 NA LINHA' }),
    )
    expect(html).toContain('bateu a linha em 1')
    expect(html).toContain('ÚLT. 5 NA LINHA')
  })

  it('lista vazia rende vazio, não erro', () => {
    const html = renderToStaticMarkup(createElement(Barrinhas, { jogos: [] }))
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
  })
})
