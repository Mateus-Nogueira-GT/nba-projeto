import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ClassificacaoCompacta } from '../ClassificacaoCompacta'

const linha = (timeId: string, sigla: string, nome: string, posicao: number) => ({
  timeId,
  sigla,
  nome,
  posicao,
  vitorias: 10,
  derrotas: 2,
  aproveitamento: 0.8333,
})

const conferencias = [
  { conferencia: 'Leste', linhas: [linha('bos', 'BOS', 'Boston', 1)] },
  { conferencia: 'Oeste', linhas: [linha('lal', 'LAL', 'Los Angeles', 1)] },
]

describe('classificação compacta (correções UX e de lógica, 19/09)', () => {
  it('o tabpanel é um <div> em volta da tabela — a tabela continua tabela', () => {
    // `role="tabpanel"` na própria <table> apaga o papel de tabela para o
    // leitor de tela: some o cabeçalho de coluna, some a navegação por célula.
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toMatch(/<div[^>]*role="tabpanel"[^>]*><table/)
    expect(html).not.toMatch(/<table[^>]*role=/)
  })

  it('cada aba controla o painel, e o painel diz qual aba o nomeia', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toContain('id="conferencia-0"')
    expect(html).toContain('id="conferencia-1"')
    expect(html.match(/aria-controls="painel-conferencia"/g)).toHaveLength(2)
    expect(html).toMatch(/id="painel-conferencia"[^>]*aria-labelledby="conferencia-0"/)
  })

  it('"Ver completa" cai na classificação, não no topo de Estatísticas', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toContain('href="/estatisticas#classificacao"')
  })

  it('o aproveitamento sai com uma casa, igual à tabela cheia (correções de lógica 19/09)', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    // a fixture tem aproveitamento 0.8333
    expect(html).toContain('<td>83,3</td>')
    expect(html).not.toContain('<td>83</td>')
  })
})
