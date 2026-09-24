import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FormaNoAtributo } from '@/features/apito/FormaNoAtributo'
import { GraficoBarras, Minigrafico } from '../graficos'

/**
 * OS GRÁFICOS DA FORMA — herdeiros do `forma-no-atributo.test.ts`, do
 * `barrinhas.test.ts` e do `acessibilidade-identidade-04.test.ts` do
 * design-system antigo (Tarefa 12 do front v2). As regras do produto que
 * continuam valendo com qualquer desenho:
 *
 *  (a) o gráfico tem alternativa TEXTUAL: `role="img"` + `aria-label` com o
 *      resumo ("bateu X de Y") e, jogo a jogo, valor e adversário — o leitor
 *      de tela ouve a sequência que a forma existe para mostrar;
 *  (b) o contorno da última barra não é o único sinal: o leitor ouve qual é a
 *      nova (Resultados, identidade 04);
 *  (c) a ordem é do mais ANTIGO para o mais recente, na fala e no desenho;
 *  (d) mais de dez jogos não estouram a grade, e quem cai fora é o MAIS ANTIGO
 *      (o jogo de ontem nunca some) — no v2 o corte mora no chamador,
 *      `features/apito/FormaNoAtributo` (`blocos.slice(-recorte)`, `recorte ≤ 10`);
 *      e o valor 0 desenha uma barra (altura mínima), não um buraco.
 *
 * Os dados são os do artboard aprovado: seis jogos acima da linha 4, quatro
 * abaixo, três deles zerados.
 */
const DEZ = [
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

const rotulo = (html: string) => html.match(/role="img" aria-label="([^"]*)"/)?.[1] ?? ''
/** Quantas colunas o gráfico do detalhe desenhou. */
const colunas = (html: string) => html.match(/class="_coluna_[a-z0-9]+"/g)?.length ?? 0

describe('GraficoBarras — o detalhe do apito', () => {
  it('(a) anuncia o resumo "bateu X de Y" e, jogo a jogo, valor e adversário', () => {
    const html = renderToStaticMarkup(<GraficoBarras jogos={DEZ} linha={4} />)
    const fala = rotulo(html)
    expect(fala).toMatch(/^Bateu a linha de 4 em 6 dos 10 jogos\./)
    for (const jogo of DEZ) expect(fala).toContain(`${jogo.adversarioSigla} ${jogo.valor}`)
    // E o resumo também vai como legenda da figura, para quem lê o documento.
    expect(html).toMatch(/<figcaption class="so-leitor">Bateu a linha de 4 em 6 dos 10 jogos<\/figcaption>/)
  })

  it('(c) a fala e o eixo seguem a ordem recebida: do mais antigo ao mais recente', () => {
    const html = renderToStaticMarkup(<GraficoBarras jogos={DEZ} linha={4} />)
    const fala = rotulo(html)
    expect(fala.indexOf('AAA 6')).toBeLessThan(fala.indexOf('JJJ 2'))
    const eixo = html.slice(html.indexOf('_eixo_'))
    expect(eixo.indexOf('AAA')).toBeLessThan(eixo.indexOf('JJJ'))
  })

  it('(d) valor 0 desenha uma barra com altura mínima — um jogo zerado é um jogo, não um buraco', () => {
    const html = renderToStaticMarkup(<GraficoBarras jogos={DEZ} linha={4} />)
    expect(colunas(html)).toBe(10)
    expect(html).not.toMatch(/height:0%|height:-/)
    expect(html.match(/height:6%/g)).toHaveLength(3)
  })

  it('o valor fica ESCRITO em cada barra e a régua nomeia a linha: a altura não é o único canal', () => {
    const html = renderToStaticMarkup(<GraficoBarras jogos={DEZ} linha={4} />)
    expect(html).toContain('>8</span>')
    expect(html).toMatch(/_linhaRotulo_[a-z0-9]+ num">4</)
  })

  it('sem linha não há veredito: nem régua, nem cor de bateu/falhou — só a média', () => {
    // Apito nascido AO VIVO tem alvo do 1º quarto, não linha pré-live; conferir
    // dez jogos inteiros contra 12 minutos compararia janelas diferentes.
    const html = renderToStaticMarkup(<GraficoBarras jogos={DEZ} linha={null} />)
    expect(rotulo(html)).toMatch(/^Últimos 10 jogos, média 4,1\./)
    expect(html).not.toContain('data-bateu')
    expect(html).not.toContain('_linhaRotulo_')
    expect(colunas(html)).toBe(10)
  })

  it('lista vazia não desenha nada', () => {
    expect(renderToStaticMarkup(<GraficoBarras jogos={[]} linha={4} />)).toBe('')
  })
})

describe('FormaNoAtributo — o corte em dez mora no chamador', () => {
  it('(d) mais de dez jogos não estouram a grade — e quem cai fora é o MAIS ANTIGO', () => {
    const html = renderToStaticMarkup(
      <FormaNoAtributo blocos={[...DEZ, { valor: 9, bateu: true, adversarioSigla: 'KKK' }]} linha={4} />,
    )
    expect(colunas(html)).toBe(10)
    // A seção se chama ÚLTIMOS 10 e a prop chega do mais antigo para o mais
    // recente: cortar pelo começo guardaria os dez mais velhos e jogaria fora
    // justamente o jogo de ontem — o que a oscilação existe para mostrar.
    expect(rotulo(html)).toContain('KKK 9')
    expect(rotulo(html)).not.toContain('AAA')
    expect(html).toContain('Últimos 10')
  })

  it('com dez ou menos, todos entram, na ordem', () => {
    const html = renderToStaticMarkup(<FormaNoAtributo blocos={DEZ.slice(0, 7)} linha={4} />)
    expect(colunas(html)).toBe(7)
    expect(rotulo(html)).toMatch(/AAA 6.*GGG 0/)
  })
})

describe('Minigrafico — a linha da tabela e o card conferido', () => {
  const cinco = [
    { valor: 19, bateu: true },
    { valor: 22, bateu: true },
    { valor: 17, bateu: true },
    { valor: 13, bateu: false },
    { valor: 25, bateu: true },
  ]

  it('(a) anuncia "bateu X de Y" e a sequência de valores, do mais antigo ao mais recente', () => {
    const fala = rotulo(renderToStaticMarkup(<Minigrafico jogos={cinco} />))
    expect(fala).toMatch(/^Bateu 4 de 5\. Do mais antigo ao mais recente: 19 bateu, 22 bateu, 17 bateu, 13 não bateu, 25 bateu/)
  })

  it('(b) a ÚLTIMA barra é contornada, e só ela — e o leitor de tela ouve qual é a nova', () => {
    const html = renderToStaticMarkup(<Minigrafico jogos={cinco} valores destacarUltimo />)
    expect(html.match(/data-ultimo="true"/g)).toHaveLength(1)
    // no quadrado do último jogo, não no primeiro
    expect(html.indexOf('data-ultimo="true"')).toBeGreaterThan(html.indexOf('>19<'))
    expect(html).toMatch(/data-ultimo="true">25</)
    expect(rotulo(html)).toMatch(/A última é a desta rodada$/)
  })

  it('sem a prop, a fileira é exatamente a de antes', () => {
    const html = renderToStaticMarkup(<Minigrafico jogos={cinco} valores />)
    expect(html).not.toContain('data-ultimo')
    expect(rotulo(html)).not.toContain('desta rodada')
  })

  it('(d) valor 0 é barra de altura mínima, nunca buraco nem altura negativa', () => {
    const html = renderToStaticMarkup(<Minigrafico jogos={[{ valor: 0, bateu: false }, { valor: 10, bateu: true }]} />)
    expect(html.match(/_miniBarra_/g)).toHaveLength(2)
    expect(html).toContain('height:12%')
    expect(html).not.toMatch(/height:0%|height:-/)
  })

  it('lista vazia rende o travessão, não erro', () => {
    const html = renderToStaticMarkup(<Minigrafico jogos={[]} />)
    expect(html).toContain('—')
    expect(html).not.toMatch(/undefined|NaN/)
  })
})
