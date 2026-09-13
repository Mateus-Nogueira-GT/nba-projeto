import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AvatarUsuario, AVATARES_PRONTOS } from '../componentes/AvatarUsuario'

describe('AvatarUsuario', () => {
  it('com foto, mostra a imagem com o nome como texto alternativo', () => {
    const html = renderToStaticMarkup(
      createElement(AvatarUsuario, {
        nome: 'Ana Souza',
        email: 'ana@x.com',
        fotoUrl: AVATARES_PRONTOS[0]!,
      }),
    )
    expect(html).toContain(`src="${AVATARES_PRONTOS[0]}"`)
    expect(html).toContain('alt="Ana Souza"')
  })
  it('sem foto, as iniciais do nome; sem nome, a inicial do e-mail — nunca um quadrado vazio', () => {
    expect(
      renderToStaticMarkup(
        createElement(AvatarUsuario, { nome: 'Ana Souza', email: 'ana@x.com', fotoUrl: null }),
      ),
    ).toContain('>AS<')
    expect(
      renderToStaticMarkup(
        createElement(AvatarUsuario, { nome: null, email: 'ana@x.com', fotoUrl: null }),
      ),
    ).toContain('>A<')
    // Nome só com espaços não é nome: mesmo fallback do nome ausente.
    expect(
      renderToStaticMarkup(
        createElement(AvatarUsuario, { nome: '   ', email: 'ana@x.com', fotoUrl: null }),
      ),
    ).toContain('>A<')
  })
  it('há oito avatares prontos e todos apontam para public/avatares', () => {
    expect(AVATARES_PRONTOS).toHaveLength(8)
    for (const a of AVATARES_PRONTOS) expect(a).toMatch(/^\/avatares\/0[1-8]\.svg$/)
  })
})
