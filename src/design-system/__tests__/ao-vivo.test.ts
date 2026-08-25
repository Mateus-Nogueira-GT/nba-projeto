import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BarraAlvo } from '../componentes/BarraAlvo'
import { ChipFiltro } from '../componentes/ChipFiltro'
import { PlacarMini } from '../componentes/PlacarMini'
import { semantico } from '../tokens/semantico'

describe('PlacarMini', () => {
  const placar = {
    jogoId: 'j1',
    casaSigla: 'LAL',
    casaPlacar: 23,
    visitanteSigla: 'DEN',
    visitantePlacar: 19,
  }

  it('mostra siglas, pontos e o selo do 1Q — sem cronômetro (decisão da spec 02)', () => {
    const html = renderToStaticMarkup(createElement(PlacarMini, { placar }))
    expect(html).toContain('LAL')
    expect(html).toContain('23')
    expect(html).toContain('DEN')
    expect(html).toContain('19')
    expect(html).toContain('1º Q')
    expect(html).toContain(semantico.vivoSelo)
    // O CJ decidiu: sem cronômetro. Nenhum m:ss aparece.
    expect(html).not.toMatch(/\d+:\d{2}/)
  })
})

describe('BarraAlvo', () => {
  it('proporção correta e contagem observado / alvo', () => {
    const html = renderToStaticMarkup(createElement(BarraAlvo, { observado: 9, alvo: 10 }))
    expect(html).toContain('width:90%')
    expect(html).toContain('9 / 10')
  })

  it('trava em 100% quando o alvo já foi cruzado', () => {
    const html = renderToStaticMarkup(createElement(BarraAlvo, { observado: 12, alvo: 10 }))
    expect(html).toContain('width:100%')
  })

  it('alvo zero não divide por zero', () => {
    const html = renderToStaticMarkup(createElement(BarraAlvo, { observado: 3, alvo: 0 }))
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })
})

describe('ChipFiltro', () => {
  it('ativo preenche com o acento; inativo é contorno discreto', () => {
    const ativo = renderToStaticMarkup(
      createElement(ChipFiltro, { ativo: true, href: '/x' }, 'TURBO'),
    )
    const inativo = renderToStaticMarkup(
      createElement(ChipFiltro, { ativo: false, href: '/x' }, 'OPD'),
    )
    expect(ativo).toContain(semantico.acento)
    expect(ativo).toContain('TURBO')
    expect(inativo).toContain(semantico.divisor)
    expect(inativo).not.toContain(`background:${semantico.acento}`)
  })

  it('é um link para o href', () => {
    const html = renderToStaticMarkup(
      createElement(ChipFiltro, { ativo: false, href: '/?metodo=OPD' }, 'OPD'),
    )
    expect(html).toContain('href="/?metodo=OPD"')
  })
})
