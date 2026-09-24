import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CabecalhoStats, NotaPartida, UltimaAtualizacao } from '../Comum'
import { aproveitamento } from '../regras'

/**
 * AS PEÇAS COMUNS DA ABA DE ESTATÍSTICAS — o que os testes do design-system
 * antigo (`nota-partida.test.ts`, `components/__tests__/formato.test.ts`) e o
 * `entrega/__tests__/estatisticas.test.ts` provavam nos componentes antigos e
 * continua valendo no v2 (Tarefa 12 do front v2). Regras do projeto inteiro:
 * número em português (vírgula), ausência é travessão (nunca zero nem 1970),
 * e a tela diz o quão recente é o dado.
 */
const AGORA = new Date('2026-08-19T23:30:00.000Z')

describe('UltimaAtualizacao', () => {
  it('sem dado nenhum, admite que não há dado em vez de datar 1970', () => {
    const html = renderToStaticMarkup(
      <UltimaAtualizacao fuso="America/Sao_Paulo" em={new Date(0)} fonte="jogos" agora={AGORA} />,
    )
    expect(html).toContain('sem dado para exibir')
    expect(html).not.toContain('1970')
  })

  it('mostra o tempo decorrido, a fonte e o horário absoluto', () => {
    const html = renderToStaticMarkup(
      <UltimaAtualizacao
        fuso="America/Sao_Paulo"
        em={new Date('2026-08-19T23:27:00.000Z')}
        fonte="ao vivo"
        agora={AGORA}
      />,
    )
    expect(html).toContain('há 3 min')
    expect(html).toContain('ao vivo')
    expect(html).toContain('2026-08-19T23:27:00.000Z')
  })
})

describe('CabecalhoStats — o voltar das telas de detalhe', () => {
  it('(navegacao) o botão de voltar é um link com nome acessível: o texto, não o chevron', () => {
    // Herdado do `navegacao.test.ts` antigo: o voltar existe em TODA tela de
    // detalhe da aba (jogador, time, partida) e tem nome — o ícone é decorativo.
    const html = renderToStaticMarkup(
      <CabecalhoStats voltar={{ href: '/estatisticas#classificacao', rotulo: 'Classificação' }} titulo="Lakers" />,
    )
    const link = html.match(/<a\b[^>]*href="\/estatisticas#classificacao"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? ''
    expect(link).toMatch(/<svg[^>]*aria-hidden/)
    // O nome acessível é o TEXTO do link (o React separa " " e o rótulo com
    // `<!-- -->`; sem tags e sem comentários, sobra "Classificação").
    expect(link.replace(/<[^>]+>/g, '').trim()).toBe('Classificação')
    expect(html).not.toContain('←')
  })

  it('sem `voltar` não há link nenhum — a tela de entrada da aba não volta para lugar algum', () => {
    const html = renderToStaticMarkup(<CabecalhoStats titulo="Estatísticas" />)
    expect(html).not.toMatch(/<a\s+href=/)
  })
})

describe('NotaPartida', () => {
  it('imprime com vírgula e uma casa — é português', () => {
    const html = renderToStaticMarkup(<NotaPartida nota={8.4} />)
    expect(html).toContain('8,4')
    expect(html).not.toContain('8.4')
  })

  it('nota ausente vira travessão, não zero', () => {
    const html = renderToStaticMarkup(<NotaPartida nota={null} />)
    expect(html).toContain('—')
    expect(html).not.toMatch(/>\s*0/)
  })

  it('a faixa muda a classe — leitura de relance, não decoração', () => {
    const fraca = renderToStaticMarkup(<NotaPartida nota={4.5} />)
    const excepcional = renderToStaticMarkup(<NotaPartida nota={9.4} />)
    expect(fraca).not.toBe(excepcional)
  })

  it('nunca escreve "probabilidade" nem "nível"', () => {
    const html = renderToStaticMarkup(<NotaPartida nota={7} />).toLowerCase()
    expect(html).not.toContain('probabilidade')
    expect(html).not.toContain('nível')
  })
})

describe('aproveitamento', () => {
  it('uma casa decimal, vírgula, com a unidade — distingue 66,7 de 66,3 na briga por play-in', () => {
    expect(aproveitamento(0.8889)).toBe('88,9%')
    expect(aproveitamento(0.6667)).toBe('66,7%')
    expect(aproveitamento(1)).toBe('100,0%')
    expect(aproveitamento(0)).toBe('0,0%')
  })

  it('null é travessão: temporada sem jogo não é zero por cento', () => {
    expect(aproveitamento(null)).toBe('—')
  })
})
