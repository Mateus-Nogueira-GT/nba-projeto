import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Avatar, iniciaisDe, fundoDoTime } from '../componentes/Avatar'

describe('Avatar', () => {
  it('iniciais: duas letras, das duas primeiras palavras', () => {
    expect(iniciaisDe('D. Malloy')).toBe('DM')
    expect(iniciaisDe('stephen Curry')).toBe('SC')
    expect(iniciaisDe('Jokic')).toBe('J')
  })

  it('fundo é determinístico por sigla', () => {
    expect(fundoDoTime('LAL')).toBe(fundoDoTime('LAL'))
    expect(fundoDoTime('LAL')).not.toBe(fundoDoTime('BOS'))
  })

  it('sem foto renderiza monograma; com foto renderiza <img>', () => {
    const sem = renderToStaticMarkup(
      createElement(Avatar, { nome: 'D. Malloy', fotoUrl: null, timeSigla: 'LAL', nivelApito: 3 }),
    )
    expect(sem).toContain('DM')
    expect(sem).not.toContain('<img')

    const com = renderToStaticMarkup(
      createElement(Avatar, {
        nome: 'D. Malloy',
        fotoUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png',
        timeSigla: 'LAL',
        nivelApito: 3,
      }),
    )
    expect(com).toContain('<img')
  })

  it('o raio do rosto acompanha o contexto: 12 no card, 16 no hero do perfil', () => {
    const noCard = renderToStaticMarkup(
      createElement(Avatar, { nome: 'X', fotoUrl: null, timeSigla: 'LAL', nivelApito: null }),
    )
    expect(noCard).toContain('border-radius:12px')

    const noHero = renderToStaticMarkup(
      createElement(Avatar, {
        nome: 'X',
        fotoUrl: null,
        timeSigla: 'LAL',
        nivelApito: null,
        tamanho: 72,
        raio: 16,
      }),
    )
    expect(noHero).toContain('border-radius:16px')
  })

  it('o numeral do nível acompanha o anel (redundância do canal)', () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, { nome: 'X', fotoUrl: null, timeSigla: 'LAL', nivelApito: 2 }),
    )
    expect(html).toContain('N2')
  })
})
