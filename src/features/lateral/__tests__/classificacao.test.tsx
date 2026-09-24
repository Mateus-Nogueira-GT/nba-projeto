import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Classificacao } from '../Classificacao'

/**
 * A CLASSIFICAÇÃO ENXUTA DA COLUNA — herdeira do `classificacao-compacta.test.ts`
 * do front antigo (Tarefa 12 do front v2). O que vale com qualquer marcação:
 * a tabela continua tabela para o leitor de tela (nenhum `role` em cima dela),
 * as conferências são abas de verdade, e "Ver completa" cai na classificação,
 * não no topo de Estatísticas.
 */
const linha = (timeId: string, sigla: string, posicao: number) => ({
  timeId,
  sigla,
  nome: sigla,
  posicao,
  vitorias: 10,
  derrotas: 2,
  aproveitamento: 0.8333,
})

const duas = {
  temporada: '2026-27',
  conferencias: [
    { conferencia: 'Leste', linhas: [linha('bos', 'BOS', 1)] },
    { conferencia: 'Oeste', linhas: [linha('lal', 'LAL', 1)] },
  ],
}

describe('a classificação da coluna', () => {
  it('a tabela continua tabela: nenhum papel ARIA por cima dela, e a legenda nomeia conferência e temporada', () => {
    const html = renderToStaticMarkup(<Classificacao classificacao={duas} />)
    expect(html).not.toMatch(/<table[^>]*role=/)
    expect(html).toMatch(/<caption[^>]*>[^<]*Leste[^<]*2026-27/)
  })

  it('uma aba por conferência, com a aberta marcada em aria-selected', () => {
    const html = renderToStaticMarkup(<Classificacao classificacao={duas} />)
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html).toMatch(/aria-selected="true"[^>]*>Leste</)
    expect(html).toMatch(/aria-selected="false"[^>]*>Oeste</)
  })

  it('com uma conferência só não há abas para escolher', () => {
    const uma = { ...duas, conferencias: duas.conferencias.slice(0, 1) }
    expect(renderToStaticMarkup(<Classificacao classificacao={uma} />)).not.toContain('role="tablist"')
  })

  it('"Ver completa" cai na classificação, e cada time leva à própria tela', () => {
    const html = renderToStaticMarkup(<Classificacao classificacao={duas} />)
    expect(html).toContain('href="/estatisticas#classificacao"')
    expect(html).toContain('href="/estatisticas/time/bos"')
  })

  it('sem conferência nenhuma não desenha tabela vazia', () => {
    expect(renderToStaticMarkup(<Classificacao classificacao={{ ...duas, conferencias: [] }} />)).toBe('')
  })
})
