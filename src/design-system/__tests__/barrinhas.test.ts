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

/**
 * A BARRINHA NOVA — identidade 04, tela de Resultados.
 *
 * O card conferido acrescenta o jogo que acabou ao fim da fileira. Sem marcá-lo,
 * a fileira parece a mesma de ontem e o assinante não sabe qual quadrado é o
 * resultado da rodada que ele veio conferir.
 */
describe('Barrinhas · a última partida em destaque', () => {
  const cinco = [
    { valor: 19, bateu: true },
    { valor: 22, bateu: true },
    { valor: 17, bateu: true },
    { valor: 13, bateu: false },
    { valor: 25, bateu: true },
  ]

  it('contorna a ÚLTIMA barrinha, e só ela', () => {
    const html = renderToStaticMarkup(
      createElement(Barrinhas, { jogos: cinco, destacarUltima: true }),
    )
    expect(html).toContain(`outline:2px solid ${semantico.texto100}`)
    expect(html.match(/outline:2px/g)).toHaveLength(1)
    // o contorno está no quadrado do último jogo, não no primeiro
    expect(html.indexOf('outline:2px')).toBeGreaterThan(html.indexOf('>19<'))
    expect(html.indexOf('outline:2px')).toBeLessThan(html.indexOf('>25<'))
  })

  it('o contorno não é o único sinal: o leitor de tela ouve qual é a nova', () => {
    const html = renderToStaticMarkup(
      createElement(Barrinhas, { jogos: cinco, destacarUltima: true }),
    )
    expect(html).toContain('a última é a desta rodada')
  })

  it('sem a prop, a fileira é exatamente a de antes', () => {
    const html = renderToStaticMarkup(createElement(Barrinhas, { jogos: cinco }))
    expect(html).not.toContain('outline')
    expect(html).not.toContain('desta rodada')
  })
})
