import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CardEntrada } from '../componentes'

const BASE = {
  nome: 'Stephen Curry',
  timeSigla: 'GSW',
  posicao: 'G',
  atributo: 'PONTOS' as const,
  nivelJogador: 'MVP' as const,
  nivelApito: 3 as const,
  grauConfianca: 5 as const,
  linha: 20,
  confianca: 99,
  turbo: false,
  modoFire: false,
  ultimos5: [],
  mediaTemporada: 30,
}

describe('narrativa no card', () => {
  it('mostra a análise quando ela existe', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...BASE, narrativa: 'Vem de sequência abaixo da média.' }),
    )
    expect(html).toContain('Vem de sequência abaixo da média.')
  })

  it('sem narrativa o card não abre espaço vazio', () => {
    // Ausência é o caso NORMAL (LLM fora, validador reprovou, sem chave).
    // Um bloco vazio anunciaria defeito onde há degradação prevista.
    const semNada = renderToStaticMarkup(createElement(CardEntrada, { ...BASE, narrativa: null }))
    const semProp = renderToStaticMarkup(createElement(CardEntrada, BASE))
    expect(semNada).toBe(semProp)
  })

  it('nunca imprime a palavra probabilidade', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...BASE, narrativa: 'Análise sóbria do confronto.' }),
    )
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })
})
