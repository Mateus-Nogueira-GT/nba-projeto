import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Esqueleto } from '../../components/navegacao'

/**
 * FEEDBACK DE CARREGAMENTO — o outro lado da lentidão.
 *
 * Toda tela do app é `force-dynamic` e volta do servidor entre 200ms e 1s
 * (ADR-0008). Sem fronteira de Suspense o roteador segura a tela ANTERIOR
 * inteira nesse intervalo: o usuário toca e nada muda. Silêncio não se lê
 * como "carregando", se lê como "travou".
 *
 * A parte de infraestrutura da lentidão (banco em outro continente) se
 * resolve fora do código. Esta parte não: é a tela dizendo que ouviu o toque.
 */
const TELAS_COM_BANCO = [
  'src/app/(app)/loading.tsx',
  'src/app/(app)/fire-live/loading.tsx',
  'src/app/(app)/gestao/loading.tsx',
  'src/app/(app)/resultados/loading.tsx',
  'src/app/(app)/estatisticas/loading.tsx',
  'src/app/(app)/conta/loading.tsx',
  'src/app/(app)/apito/[jogadorId]/loading.tsx',
]

describe('esqueleto de carregamento', () => {
  it('toda tela que consulta o banco tem fronteira de carregamento', () => {
    for (const caminho of TELAS_COM_BANCO) {
      expect(existsSync(caminho), caminho).toBe(true)
    }
  })

  it('a barra de abas SOBREVIVE ao carregamento', () => {
    // A barra já sabe para onde o usuário vai. Se ela sumisse junto, a
    // moldura piscaria a cada troca de tela — e a navegação inteira pareceria
    // recarregar em vez de trocar de conteúdo.
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'gestao', linhas: 2 }))
    expect(html).toContain('ENTRADAS')
    expect(html).toContain('GESTÃO')
  })

  it('anuncia a espera para leitor de tela', () => {
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'lista' }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Carregando')
  })

  it('telas de detalhe não ganham barra de abas', () => {
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: null, linhas: 1 }))
    expect(html).not.toContain('ENTRADAS')
  })

  it('a animação respeita prefers-reduced-motion', () => {
    // Mesma regra do ponto do "ao vivo": movimento é opcional, a forma não.
    const css = readFileSync('src/app/globals.css', 'utf8')
    const bloco = css.slice(css.indexOf('esqueleto-brilho'))
    expect(bloco).toContain('prefers-reduced-motion: no-preference')
  })
})
