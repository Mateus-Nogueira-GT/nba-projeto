import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Tabela } from '../componentes'
import type { Coluna } from '../componentes'
import { componente } from '../tokens/componente'

/**
 * A TABELA DENSA DA IDENTIDADE 04.
 *
 * O desenho aprovado veste a tabela de condensada — cabeçalho minúsculo em
 * maiúsculas, linha fina, primeira coluna colada à margem. Antes disso ela
 * herdava a fonte de corpo e imprimia a legenda como texto visível, logo
 * abaixo do cabeçalho da seção que já dá o mesmo contexto.
 */

type Linha = { id: string; pontos: number }

const COLUNAS: Coluna<Linha>[] = [
  { chave: 'jogo', rotulo: 'Jogo', fixa: true, celula: (l) => l.id },
  {
    chave: 'pts',
    rotulo: 'PTS',
    descricao: 'pontos',
    alinhamento: 'direita',
    celula: (l) => l.pontos,
  },
]

function tabela() {
  return renderToStaticMarkup(
    createElement(Tabela<Linha>, {
      legenda: 'Uma linha por partida',
      colunas: COLUNAS,
      linhas: [{ id: 'a', pontos: 10 }],
      chaveDaLinha: (l: Linha) => l.id,
    }),
  )
}

describe('Tabela · a vestimenta da identidade 04', () => {
  it('é condensada, e o cabeçalho sai em maiúsculas mesmo escrito em caixa mista', () => {
    const html = tabela()
    expect(html).toContain('var(--fonte-barlow-condensed)')
    // O rótulo literal é "Jogo"; quem uppercasa é o estilo, como no artboard.
    expect(html).toContain('>Jogo<')
    expect(html).toMatch(/<th[^>]*text-transform:uppercase/)
    expect(html).toMatch(/<th[^>]*font-size:10px/)
  })

  it('a legenda continua no DOM para o leitor de tela, mas não ocupa a tela', () => {
    // O cabeçalho da seção já carrega o contexto; a legenda visível competia
    // com ele. Removê-la do DOM tiraria o nome da tabela de quem não vê.
    const html = tabela()
    expect(html).toContain('Uma linha por partida')
    expect(html).toMatch(/<caption[^>]*clip:rect\(0 0 0 0\)/)
  })

  it('a primeira coluna nasce colada à margem esquerda', () => {
    const html = tabela()
    expect(html).toMatch(/<th[^>]*padding:6px 6px 6px 0/)
    expect(html).toMatch(/<td[^>]*padding:8px 6px 8px 0/)
  })

  it('sem `destaque` nenhuma coluna veste o universo quente', () => {
    expect(tabela()).not.toContain(componente.contextoQuente.faixaFundo)
  })

  it('a coluna em destaque veste o quente do cabeçalho à última célula', () => {
    const html = renderToStaticMarkup(
      createElement(Tabela<Linha>, {
        legenda: 'Uma linha por partida',
        colunas: [COLUNAS[0]!, { ...COLUNAS[1]!, destaque: true }],
        linhas: [{ id: 'a', pontos: 10 }],
        chaveDaLinha: (l: Linha) => l.id,
      }),
    )
    const quente = componente.contextoQuente.faixaFundo
    const marcadas = html.split(quente).length - 1
    // Cabeçalho + a célula da única linha: a coluna INTEIRA, não só o topo.
    expect(marcadas).toBe(2)
    expect(html).toContain(`border-left:1px solid ${componente.contextoQuente.borda}`)
    expect(html).toContain(`border-right:1px solid ${componente.contextoQuente.borda}`)
    // E a coluna vizinha continua fria.
    const primeiraCelula = html.match(/<td\b[^>]*>[\s\S]*?<\/td>/)?.[0]
    expect(primeiraCelula).toBeDefined()
    expect(primeiraCelula).not.toContain(componente.contextoQuente.borda)
  })
})
