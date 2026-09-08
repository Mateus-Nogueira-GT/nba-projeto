import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FormaNoAtributo, type FormaNoAtributoProps } from '../componentes/FormaNoAtributo'
import { semantico } from '../tokens/semantico'

/**
 * A OSCILAÇÃO VISUALIZADA (spec 04, §4.3).
 *
 * As `Barrinhas` de 5 continuam no card; aqui são os últimos 10 com a LINHA
 * marcada — a comparação que importa para o apostador é contra a linha, não
 * contra outro jogador. Os dados abaixo são os do artboard aprovado: seis
 * jogos acima da linha 4 e quatro abaixo, três deles zerados.
 */
const DEZ: FormaNoAtributoProps['jogos'] = [
  { valor: 6, bateu: true, adversarioSigla: 'AAA' },
  { valor: 4, bateu: true, adversarioSigla: 'BBB' },
  { valor: 7, bateu: true, adversarioSigla: 'CCC' },
  { valor: 8, bateu: true, adversarioSigla: 'DDD' },
  { valor: 7, bateu: true, adversarioSigla: 'EEE' },
  { valor: 7, bateu: true, adversarioSigla: 'FFF' },
  { valor: 0, bateu: false, adversarioSigla: 'GGG' },
  { valor: 0, bateu: false, adversarioSigla: 'HHH' },
  { valor: 0, bateu: false, adversarioSigla: 'III' },
  { valor: 2, bateu: false, adversarioSigla: 'JJJ' },
]

const render = (props: FormaNoAtributoProps) =>
  renderToStaticMarkup(createElement(FormaNoAtributo, props))

/** Quantas barras o HTML tem — a barra é o único elemento com este raio. */
function barras(html: string): number {
  return html.split('border-radius:4px 4px 2px 2px').length - 1
}

describe('FormaNoAtributo — os últimos 10 contra a linha', () => {
  it('desenha uma barra por jogo, até dez, com o valor em cima e a sigla embaixo', () => {
    const html = render({ jogos: DEZ, linha: 4 })
    expect(barras(html)).toBe(10)
    for (const jogo of DEZ) expect(html).toContain(jogo.adversarioSigla)
    // O valor fica escrito: a altura da barra não é o único canal.
    expect(html).toContain('8')
  })

  it('a régua tracejada nomeia a linha COM o "+" — a linha nunca sai pelada', () => {
    const html = render({ jogos: DEZ, linha: 4 })
    // "Linha sempre inteira com +" vale também para a régua: ela marca a
    // fronteira, e o que está em cima dela é a região de 4 ou mais.
    expect(html).toContain('LINHA 4+')
    expect(html).not.toMatch(/LINHA 4(?!\+)/)
    expect(html).toContain('dashed')
    // O rótulo tem o fundo do tema atrás para não ficar em cima das barras.
    expect(html).toContain(`background:${semantico.fundo}`)
  })

  it('anuncia o resumo para leitor de tela: bateu X de Y', () => {
    const html = render({ jogos: DEZ, linha: 4 })
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="bateu 6 de 10"')
    expect(render({ jogos: DEZ.slice(0, 3), linha: 4 })).toContain('aria-label="bateu 3 de 3"')
  })

  it('valor 0 vira 3 px — um jogo zerado é um jogo, não um buraco na leitura', () => {
    const html = render({ jogos: DEZ, linha: 4 })
    expect(html).toContain('height:3px')
    // Nenhuma altura negativa, em nenhuma combinação.
    expect(html).not.toMatch(/height:-/)
    expect(
      render({ jogos: [{ valor: 0, bateu: false, adversarioSigla: 'AAA' }], linha: 0 }),
    ).not.toMatch(/height:-/)
  })

  it('a cor é o par PRÓPRIO das barrinhas — nunca a categórica do apito nível 3', () => {
    const html = render({ jogos: DEZ, linha: 4 })
    expect(html).toContain(`background:${semantico.barrinhaBateu}`)
    expect(html).toContain(`background:${semantico.barrinhaFalhou}`)
    expect(html).not.toContain(semantico.apitoNivel3)
  })

  it('mais de dez jogos não estouram a grade — e quem cai fora é o MAIS ANTIGO', () => {
    const html = render({
      jogos: [...DEZ, { valor: 9, bateu: true, adversarioSigla: 'KKK' }],
      linha: 4,
    })
    expect(barras(html)).toBe(10)
    expect(html).toContain('repeat(10, minmax(0, 1fr))')
    // A seção se chama ÚLTIMOS 10 e a prop chega do mais ANTIGO para o mais
    // recente: cortar pelo começo guardaria os dez mais VELHOS e jogaria fora
    // justamente o jogo de ontem — o que a oscilação existe para mostrar.
    expect(html).toContain('KKK')
    expect(html).not.toContain('AAA')
  })

  it('sem linha não há régua, nem veredito por cor, nem contagem de acertos', () => {
    // Apito nascido AO VIVO: ele tem alvo do 1º quarto, não linha pré-live.
    // Conferir dez jogos INTEIROS contra um alvo de 12 minutos compararia
    // janelas diferentes — então a forma aparece sem régua e sem veredito.
    const html = render({ jogos: DEZ, linha: null })
    expect(barras(html)).toBe(10)
    expect(html).not.toContain('LINHA')
    expect(html).not.toContain('dashed')
    expect(html).not.toContain('aria-label="bateu')
    expect(html).toContain('aria-label="10 jogos no atributo, sem linha para conferir"')
    // Nem verde nem vermelho: nenhum destes jogos foi conferido contra nada.
    expect(html).not.toContain(`background:${semantico.barrinhaBateu}`)
    expect(html).not.toContain(`background:${semantico.barrinhaFalhou}`)
    // Os valores continuam escritos: a forma é fato, a conferência é que falta.
    expect(html).toContain('>8<')
  })

  it('a barra mais alta cabe na altura útil e a régua acompanha a escala', () => {
    // Teto = maior entre os valores e a linha. Com 8 no topo e linha 4, a
    // régua fica na metade da altura útil: é o que faz "bateu/não bateu" ser
    // legível pela geometria e não só pela cor.
    const html = render({ jogos: DEZ, linha: 4 })
    expect(html).toContain('height:80px')
    expect(html).toContain('bottom:62px')
  })

  it('com menos de dez jogos o vão fica no lado ANTIGO — a ponta do jogo de ontem nunca some', () => {
    // A leitura é antigo → recente. Nove barras numa grade de dez deixavam a
    // coluna vazia à DIREITA, e um buraco ali comunica "o jogo de ontem está
    // faltando" — o oposto do que a seção existe para mostrar.
    const html = render({ jogos: DEZ.slice(0, 9), linha: 4 })
    expect(barras(html)).toBe(9)
    expect(html).toContain('repeat(10, minmax(0, 1fr))')
    expect(html).toContain('grid-column-start:2')
    // Com a grade cheia não há deslocamento nenhum.
    expect(render({ jogos: DEZ, linha: 4 })).not.toContain('grid-column-start')
  })

  it('bateu e falhou não dependem só da cor — o valor sai com ✓ ou ·', () => {
    // O canal posicional (topo da barra acima ou abaixo da régua) não resolve
    // a IGUALDADE: valor 4 na linha 4 é "bateu" e desenha o topo EM CIMA da
    // régua. Para quem não distingue verde de vermelho, o jogo ficaria
    // indeterminado (docs/04-design-system.md, Acessibilidade).
    const html = render({
      jogos: [
        { valor: 4, bateu: true, adversarioSigla: 'AAA' },
        { valor: 4, bateu: false, adversarioSigla: 'BBB' },
      ],
      linha: 4,
    })
    expect(html).toContain('✓ 4')
    expect(html).toContain('· 4')
    // E o glifo some quando não houve conferência: sem linha não há veredito.
    const semLinha = render({ jogos: DEZ, linha: null })
    expect(semLinha).not.toContain('✓')
    expect(semLinha).toContain('>8<')
  })
})
