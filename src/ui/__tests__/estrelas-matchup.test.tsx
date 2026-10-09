import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EstrelasMatchup } from '../marcas'

/**
 * MATCHUP EM ESTRELAS (CJ, 09/10). A ★ fica ao lado do nível do apito na
 * Lista, no Ao Vivo e no painel: uma por critério atendido. Cor nunca é o
 * único canal — o leitor de tela ouve "2 estrelas de matchup".
 */
describe('EstrelasMatchup', () => {
  it('uma ★ por estrela, com rótulo acessível', () => {
    const html = renderToStaticMarkup(
      <EstrelasMatchup matchup={{ estrelas: 2, motivos: ['PONTOS_CEDIDOS', 'BOLAS_PERDIDAS'], aviso: [] }} />,
    )
    expect(html.split('★').length - 1).toBe(2)
    expect(html).toContain('aria-label="2 estrelas de matchup"')
    expect(html).toContain('role="img"')
  })

  it('singular com uma estrela', () => {
    const html = renderToStaticMarkup(
      <EstrelasMatchup matchup={{ estrelas: 1, motivos: ['PONTOS_CEDIDOS'], aviso: [] }} />,
    )
    expect(html).toContain('aria-label="1 estrela de matchup"')
  })

  it('sem estrela, sem matchup ou snapshot antigo (campo ausente): nada', () => {
    expect(renderToStaticMarkup(<EstrelasMatchup matchup={{ estrelas: 0, motivos: [], aviso: ['PONTOS_MARCADOS'] }} />)).toBe('')
    expect(renderToStaticMarkup(<EstrelasMatchup matchup={null} />)).toBe('')
    expect(renderToStaticMarkup(<EstrelasMatchup matchup={undefined} />)).toBe('')
  })

  it('a cor da estrela é token, definido no escuro e no claro', () => {
    const tokens = readFileSync('src/ui/tokens.css', 'utf8')
    const claro = tokens.slice(tokens.indexOf(":root[data-tema='claro']"))
    expect(tokens).toMatch(/--matchup-estrela:/)
    expect(claro).toMatch(/--matchup-estrela:/)
    const css = readFileSync('src/ui/marcas.module.css', 'utf8')
    expect(css).toContain('var(--matchup-estrela)')
  })
})
