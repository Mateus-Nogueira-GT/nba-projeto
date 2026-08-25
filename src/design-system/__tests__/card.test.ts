import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardEntrada } from '../componentes/CardEntrada'

const base = {
  nome: 'D. Malloy', timeSigla: 'LAL', posicao: 'G',
  atributo: 'PONTOS' as const, nivelJogador: 'MVP' as const, nivelApito: 3 as const,
  confianca: 92, grauConfianca: 4 as const, fotoUrl: null,
}

describe('CardEntrada (identidade 02)', () => {
  it('linha inteira com sufixo +, nunca meio ponto', () => {
    const html = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    expect(html).toContain('PONTOS 20+')
    expect(html).not.toContain('20,5')
    expect(html).not.toContain('19,5')
  })

  it('brilha SOMENTE no grau máximo de confiança', () => {
    const comum = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    const maximo = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, grauConfianca: 5, linha: 20 }),
    )
    expect(maximo).toContain('box-shadow')
    expect(comum).not.toContain('box-shadow')
  })

  it('turbo e modo fire têm selo escrito, não brilho', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, turbo: true, modoFire: true, linha: 20 }),
    )
    expect(html).toContain('TURBO')
    expect(html).toContain('MODO FIRE')
    expect(html).not.toContain('box-shadow')
  })

  it('fire live: selo VIVO e barra de progresso com o texto do estado', () => {
    const batida = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, vivo: true, alvo1Q: 12, progresso1Q: { observado: 14, alvo: 12 } }),
    )
    expect(batida).toContain('VIVO')
    expect(batida).toContain('LINHA BATIDA')

    const parcial = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, vivo: true, alvo1Q: 12, progresso1Q: { observado: 9, alvo: 12 } }),
    )
    expect(parcial).toContain('FALTA 3 PTS')
  })

  it('mostra contra quem o jogador está jogando, quando a tela sabe', () => {
    // A tela ao vivo montava "Lakers · vs DEN" e passava a string em
    // `timeNome`, prop que o corpo do componente nunca lia: o card perdia o
    // confronto. Agora o adversário é prop de verdade — e some quando não há,
    // em vez de virar um "vs —" que não informa nada.
    const comAdversario = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, linha: 20, adversarioSigla: 'DEN' }),
    )
    expect(comAdversario).toContain('vs DEN')

    const sem = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    expect(sem).not.toContain('vs ')
  })

  it('toda prop obrigatória do card aparece na saída renderizada', () => {
    // Prop obrigatória que ninguém lê é uma promessa que a tela paga e o
    // usuário não recebe — foi assim que o confronto do Fire Live sumiu.
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, linha: 20, adversarioSigla: 'DEN' }),
    )
    for (const valor of ['D. Malloy', 'LAL', 'G', '20', 'MVP', '92'])
      expect(html, `prop com valor ${valor} não chegou à tela`).toContain(valor)
  })

  it('nível do jogador e do apito têm redundância textual', () => {
    const html = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    expect(html).toContain('MVP')
    expect(html).toContain('N3')
  })
})
