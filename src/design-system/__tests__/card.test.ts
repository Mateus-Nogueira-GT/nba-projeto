import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CardEntrada, type CardEntradaProps } from '../componentes/CardEntrada'
import { componente } from '../tokens/componente'

const base = {
  nome: 'D. Malloy', timeSigla: 'LAL', posicao: 'G',
  atributo: 'PONTOS' as const, nivelJogador: 'MVP' as const, nivelApito: 3 as const,
  confianca: 92, grauConfianca: 4 as const, fotoUrl: null,
}

const render = (props: CardEntradaProps) => renderToStaticMarkup(createElement(CardEntrada, props))

describe('CardEntrada — contratos de conteúdo (desde a identidade 02)', () => {
  it('linha inteira com sufixo +, nunca meio ponto', () => {
    const html = render({ ...base, linha: 20 })
    expect(html).toContain('PONTOS 20+')
    expect(html).not.toContain('20,5')
    expect(html).not.toContain('19,5')
  })

  it('fire live: selo VIVO e o texto do estado do progresso', () => {
    const batida = render({ ...base, vivo: true, temperatura: 'quente', alvo1Q: 12, progresso1Q: { observado: 14, alvo: 12 } })
    expect(batida).toContain('VIVO')
    expect(batida).toContain('LINHA BATIDA')

    const parcial = render({ ...base, vivo: true, temperatura: 'quente', alvo1Q: 12, progresso1Q: { observado: 9, alvo: 12 } })
    expect(parcial).toContain('FALTA 3 PTS')
  })

  it('mostra contra quem o jogador está jogando, quando a tela sabe', () => {
    expect(render({ ...base, linha: 20, adversarioSigla: 'DEN' })).toContain('vs DEN')
    expect(render({ ...base, linha: 20 })).not.toContain('vs ')
  })

  it('toda prop obrigatória do card aparece na saída renderizada', () => {
    const html = render({ ...base, linha: 20, adversarioSigla: 'DEN' })
    for (const valor of ['D. Malloy', 'LAL', 'G', '20', 'MVP', '92'])
      expect(html, `prop com valor ${valor} não chegou à tela`).toContain(valor)
  })

  it('nível do jogador e do apito têm redundância textual', () => {
    const html = render({ ...base, linha: 20 })
    expect(html).toContain('MVP')
    expect(html).toContain('N3')
  })

  it('turbo e modo fire seguem com selo ESCRITO — brilho nunca é o único sinal', () => {
    const html = render({ ...base, turbo: true, modoFire: true, linha: 20 })
    expect(html).toContain('TURBO')
    expect(html).toContain('MODO FIRE')
  })
})

describe('CardEntrada — identidade 03 (3 zonas)', () => {
  it('zona 2 fria mostra as barrinhas com valor', () => {
    const html = render({
      ...base, linha: 25,
      ultimos5: [{ valor: 30, bateu: true }, { valor: 20, bateu: false }],
    })
    expect(html).toContain('ÚLT. 5 NA LINHA')
    expect(html).toContain('>30<')
    expect(html).toContain('>20<')
  })

  it('na tela quente a zona 2 é a barra rumo ao alvo, não as barrinhas', () => {
    const html = render({
      ...base, temperatura: 'quente', modoFire: true, alvo1Q: 10,
      progresso1Q: { observado: 9, alvo: 10 },
      ultimos5: [{ valor: 30, bateu: true }],
    })
    expect(html).toContain('9 / 10')
    expect(html).not.toContain('ÚLT. 5 NA LINHA')
  })

  it('rodapé: faixa sem média, ODD MÉDIA quando existir, nada de odd quando null', () => {
    expect(render({ ...base, linha: 25, mediaTemporada: 25.7, oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 } }))
      .toContain('ODD 1,47–1,62')
    expect(render({ ...base, linha: 25, mediaTemporada: 25.7, oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 } }))
      .toContain('ODD MÉDIA 1,55')
    const semOdd = render({ ...base, linha: 25, mediaTemporada: 25.7, oddFaixa: null })
    expect(semOdd).toContain('MÉDIA 25,7')
    expect(semOdd).not.toContain('ODD')
  })

  it('borda lateral na cor do grau; os três brilhos têm cada um seu dono', () => {
    // dono 1 — confiança: só o grau máximo brilha
    expect(render({ ...base, linha: 20 })).not.toContain('box-shadow')
    expect(render({ ...base, grauConfianca: 5, linha: 20 })).toContain('box-shadow')
    // dono 2 — turbo
    expect(render({ ...base, turbo: true, linha: 20 })).toContain(componente.turboBrilho)
    // dono 3 — modo fire (na tela quente)
    expect(render({ ...base, temperatura: 'quente', modoFire: true, alvo1Q: 10 })).toContain(
      componente.contextoQuente.brilho,
    )
    // e a borda lateral existe sempre que há grau
    expect(render({ ...base, linha: 20 })).toContain('border-left:3px solid')
  })

  it('SÓ a temperatura veste o universo quente — modoFire sozinho não muda a pele', () => {
    // Errata 25/08: quente atrelado a modoFire faria um item pré-live em modo
    // fire perder barrinhas, média e odd do rodapé. Temperatura é da TELA.
    const frio = render({ ...base, linha: 20 })
    const aindaFrio = render({
      ...base, modoFire: true, linha: 20,
      ultimos5: [{ valor: 30, bateu: true }], mediaTemporada: 25.7,
    })
    expect(frio).toContain(componente.contextoFrio.cardGradiente)
    expect(aindaFrio).toContain(componente.contextoFrio.cardGradiente)
    expect(aindaFrio).toContain('ÚLT. 5 NA LINHA')
    expect(aindaFrio).toContain('MÉDIA 25,7')
    expect(aindaFrio).toContain('MODO FIRE') // o selo continua — é estado, não pele
  })

  it('temperatura quente explícita veste o universo quente mesmo sem modo fire', () => {
    // O Fire Live inteiro é quente — quem cruza alvo sem estar em modo fire
    // também está na tela ao vivo.
    const html = render({ ...base, temperatura: 'quente', alvo1Q: 10, progresso1Q: { observado: 4, alvo: 10 } })
    expect(html).toContain(componente.contextoQuente.cardGradiente)
    expect(html).toContain('4 / 10')
  })
})

describe('errata pós-merge — alvo desconhecido nunca vira linha batida', () => {
  it('BarraAlvo com alvo 0 mostra 0%, não 100%', async () => {
    const { BarraAlvo } = await import('../componentes/BarraAlvo')
    const html = renderToStaticMarkup(createElement(BarraAlvo, { observado: 3, alvo: 0 }))
    expect(html).toContain('width:0%')
    expect(html).not.toContain('width:100%')
  })

  it('card quente sem progresso não afirma LINHA BATIDA', () => {
    const html = render({ ...base, temperatura: 'quente', progresso1Q: null })
    expect(html).not.toContain('LINHA BATIDA')
  })
})

