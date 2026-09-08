import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FotoJogador } from '../componentes/FotoJogador'

describe('FotoJogador · apresentação inicial e ausência de foto', () => {
  it.each([null, ''])('foto ausente (%s) usa o monograma, sem imagem quebrada', (fotoUrl) => {
    const html = renderToStaticMarkup(
      createElement(FotoJogador, { fotoUrl, tamanho: 52, iniciais: 'DM' }),
    )
    expect(html).toContain('>DM</span>')
    expect(html).not.toContain('<img')
  })

  it('a imagem com URL é decorativa e reserva as dimensões do avatar', () => {
    const html = renderToStaticMarkup(
      createElement(FotoJogador, {
        fotoUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png',
        tamanho: 72,
        iniciais: 'LJ',
      }),
    )
    expect(html).toContain('<img')
    expect(html).toContain('alt=""')
    expect(html).toContain('width="72"')
    expect(html).toContain('height="72"')
    expect(html).toContain('sizes="72px"')
    expect(html).not.toContain('>LJ</span>')
  })
})
