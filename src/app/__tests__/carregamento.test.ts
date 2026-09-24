import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * FEEDBACK DE CARREGAMENTO — o outro lado da lentidão.
 *
 * Toda tela do app é dinâmica e volta do servidor entre 200ms e 1s (ADR-0008).
 * Sem fronteira de Suspense o roteador segura a tela ANTERIOR inteira nesse
 * intervalo: o usuário toca e nada muda. Silêncio não se lê como
 * "carregando", se lê como "travou".
 *
 * Front v2 (Tarefa 12): o `Esqueleto` antigo repetia a moldura inteira — barra
 * de abas, lateral — porque a moldura era montada pela TELA. No v2 a casca
 * (`src/app/(app)/layout.tsx`) é quem desenha sidebar e barra inferior, e o
 * `loading.tsx` só troca o miolo. A barra sobrevive ao carregamento por
 * construção, e é isso que o segundo caso trava: o esqueleto não pode
 * desenhar navegação própria, senão a moldura piscaria duplicada.
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

/** Os módulos CSS que os esqueletos vestem — cada um com a sua animação. */
const CSS_DOS_ESQUELETOS = [
  'src/features/lista/Carregando.module.css',
  'src/features/ao-vivo/Carregando.module.css',
  'src/features/estatisticas/Carregando.module.css',
]

async function esqueleto(caminho: string): Promise<string> {
  const modulo = (await import(`../../../${caminho}`)) as { default: () => React.ReactElement }
  return renderToStaticMarkup(createElement(modulo.default))
}

describe('esqueleto de carregamento', () => {
  it('toda tela que consulta o banco tem fronteira de carregamento', () => {
    for (const caminho of TELAS_COM_BANCO) {
      expect(existsSync(caminho), caminho).toBe(true)
    }
  })

  it('a barra de abas SOBREVIVE ao carregamento: mora na casca, e o esqueleto não a repete', () => {
    const casca = readFileSync('src/app/(app)/layout.tsx', 'utf8')
    expect(casca).toContain('<Sidebar ')
    expect(casca).toContain('<BarraInferior ')
    for (const caminho of TELAS_COM_BANCO) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, caminho).not.toMatch(/Navegacao|BarraInferior|Sidebar/)
    }
  })

  it.each(TELAS_COM_BANCO)('%s anuncia a espera para leitor de tela', async (caminho) => {
    const html = await esqueleto(caminho)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Carregando')
    // Sem navegação própria no HTML: a casca já está na tela.
    expect(html).not.toContain('aria-label="Seções"')
  })

  it.each(CSS_DOS_ESQUELETOS)('%s: a animação respeita prefers-reduced-motion', (caminho) => {
    // Mesma regra do ponto do "ao vivo": movimento é opcional, a forma não.
    const css = readFileSync(caminho, 'utf8')
    expect(css).toContain('animation:')
    const reduzido = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1]
    expect(reduzido, 'bloco de prefers-reduced-motion: reduce').toBeDefined()
    expect(reduzido).toMatch(/animation:\s*none/)
  })
})
