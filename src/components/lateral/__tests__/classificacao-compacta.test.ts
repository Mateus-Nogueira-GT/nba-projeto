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

describe('classificação compacta', () => {
  it('o aproveitamento sai com uma casa, igual à tabela cheia (correções de lógica 19/09)', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    // a fixture tem aproveitamento 0.8333
    expect(html).toContain('<td>83,3</td>')
    expect(html).not.toContain('<td>83</td>')
  })
})
