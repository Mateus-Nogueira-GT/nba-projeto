import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BarraAlvo, type BarraAlvoProps } from '../componentes/BarraAlvo'
import { semantico } from '../tokens/semantico'

const render = (props: BarraAlvoProps) => renderToStaticMarkup(createElement(BarraAlvo, props))

/**
 * O card quente do artboard (FireLive.dc.html, `.zona2`): alvo de 11 pts, 9
 * feitos, apito saiu com 6 e o marco do modo fire em 8.
 *
 * O 8 vem do ITEM, já calculado pela entrega — a barra não conhece ruleset, e
 * por isso o rótulo do marco também chega pronto: se o percentual do modo fire
 * mudar no YAML, quem muda o texto é a entrega, não este componente.
 */
const artboard: BarraAlvoProps = {
  observado: 9,
  alvo: 11,
  unidade: 'pts',
  marcos: [{ valor: 8, rotulo: '75% da média', cor: semantico.apitoNivel2 }],
  apitouEm: { valor: 6, rotulo: 'apitou aqui' },
}

describe('BarraAlvo — dois marcos e o ponto "apitou aqui" (identidade 04)', () => {
  it('a contagem escreve observado / alvo COM a unidade — "9 / 11 pts"', () => {
    const html = render(artboard)
    expect(html).toContain('Rumo ao alvo')
    expect(html).toContain('9 / 11 pts')
    // sem unidade a contagem segue como antes, sem inventar "pts"
    expect(render({ observado: 9, alvo: 11 })).toContain('9 / 11')
    expect(render({ observado: 9, alvo: 11 })).not.toContain('pts')
  })

  it('o marco fica em `left` proporcional ao alvo e tem o rótulo ESCRITO na legenda', () => {
    // 8 de 11 = 72,7% — a régua é o alvo, não o observado.
    const html = render(artboard)
    expect(html).toContain('left:72.7%')
    expect(html).toContain('75% da média · 8')
    // o traço do modo fire e o texto dele na legenda vestem a MESMA cor: no
    // artboard a coluna do meio é a única colorida da legenda
    expect(html).toContain(`background:${semantico.apitoNivel2}`)
    expect(html).toContain(`color:${semantico.apitoNivel2}`)
  })

  it('o alvo é o marco do fim do trilho e a legenda escreve "alvo · 11"', () => {
    const html = render(artboard)
    expect(html).toContain('left:100%')
    expect(html).toContain('alvo · 11')
  })

  it('marco sem cor veste o texto cheio; nenhum marco escapa do trilho', () => {
    const html = render({
      ...artboard,
      marcos: [{ valor: 20, rotulo: 'acima do alvo' }],
    })
    expect(html).toContain(`background:${semantico.texto100}`)
    // 20 de 11 daria 181% — a posição trava em 100%
    expect(html).not.toContain('left:181.8%')
    expect(html).toContain('acima do alvo · 20')
  })

  it('apitouEm rende o ponto com aria-label "apitou aqui · 6 pts", em left proporcional', () => {
    const html = render(artboard)
    expect(html).toContain('aria-label="apitou aqui · 6 pts"')
    // 6 de 11 = 54,5%
    expect(html).toContain('left:54.5%')
    // o ponto veste a borda da superfície quente — ele nasce DENTRO do trilho
    expect(html).toContain(semantico.superficieQuente2)
  })

  it('`apitouEm: null` é a AFIRMAÇÃO de que ainda não houve push', () => {
    const html = render({ ...artboard, apitouEm: null })
    expect(html).toContain('ainda sem apito')
    expect(html).not.toContain('apitou aqui')
  })

  it('sem NOTÍCIA do push a barra cala — nem ponto, nem frase', () => {
    // A diferença que evita mentira na tela: `null` é "sei que ainda não
    // apitou" (o alvo aguardando o 1º quarto, do artboard); a AUSÊNCIA da prop
    // é "não sei". O Fire Live de hoje lista APITOS — escrever "ainda sem
    // apito" no card de um apito seria falso. Quem não tem o instante do push
    // não escreve nada.
    const { apitouEm: _ignorado, ...semNoticia } = artboard
    const html = render(semNoticia)
    expect(html).not.toContain('ainda sem apito')
    expect(html).not.toContain('apitou aqui')
    // o resto da legenda continua de pé: o marco e o alvo seguem escritos
    expect(html).toContain('75% da média · 8')
    expect(html).toContain('alvo · 11')
  })

  it('a legenda tem os três textos, um por coluna, na ordem do artboard', () => {
    // A ordem é medida DENTRO da legenda. Procurar 'apitou aqui · 6 pts' no
    // documento inteiro casaria primeiro com o `aria-label` do ponto, que sai
    // lá em cima, dentro do trilho — e a comparação passaria com os spans da
    // legenda em QUALQUER ordem.
    expect(colunasDaLegenda(render(artboard))).toEqual([
      'apitou aqui · 6 pts',
      '75% da média · 8',
      'alvo · 11',
    ])
  })

  it('"alvo · N" é SEMPRE a última coluna, mesmo sem notícia do push', () => {
    // `.legenda{justify-content:space-between}`: a primeira coluna encosta na
    // esquerda, a última na direita. Se a coluna do apito simplesmente sumisse
    // quando não há notícia — o estado que a tela TEM hoje —, o rótulo do modo
    // fire (traço em 72,7%) iria para a extremidade esquerda e o alvo deixaria
    // a direita: o rótulo pararia de apontar para o que descreve. A coluna
    // existe sempre; sem notícia, vazia.
    const { apitouEm: _semNoticia, ...semApito } = artboard
    expect(colunasDaLegenda(render(semApito))).toEqual(['', '75% da média · 8', 'alvo · 11'])
    // e no estado de HOJE, só com o alvo: ele continua encostado na direita
    expect(colunasDaLegenda(render({ observado: 9, alvo: 11, unidade: 'pts' }))).toEqual([
      '',
      'alvo · 11',
    ])
  })

  it('sem alvo NUNCA preenche — e nada é posicionado contra zero', () => {
    const html = render({ ...artboard, observado: 3, alvo: 0 })
    expect(html).toContain('width:0%')
    expect(html).not.toContain('width:100%')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
    // sem régua não há marco, não há ponto e não há legenda a escrever
    expect(html).not.toContain('apitou aqui')
    expect(html).not.toContain('75% da média')
    expect(html).not.toContain('alvo · 0')
  })

  it('depois de FIM 1º Q a barra congela: nenhuma animação, nada pulsando', () => {
    // Spec 04 §4.2: só a chegada de apito novo se anima; a barra é estado.
    const html = render(artboard)
    expect(html).not.toMatch(/animation|transition|keyframes/i)
    const fonte = readFileSync('src/design-system/componentes/BarraAlvo.tsx', 'utf8')
    expect(fonte).not.toMatch(/animation|@keyframes/i)
  })

  it('nenhum hex hardcoded: a barra só fala por token', () => {
    const fonte = readFileSync('src/design-system/componentes/BarraAlvo.tsx', 'utf8')
    expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(fonte).not.toMatch(/rgba?\(/)
  })
})

/**
 * As declarações do `style` inline do primeiro elemento que casa com `re` — a
 * barra desenha tudo inline, então a caixa dela é auditável no próprio HTML.
 * O grupo 1 da expressão precisa capturar o conteúdo do atributo.
 */
function estilo(html: string, re: RegExp): Record<string, string> {
  const achado = re.exec(html)
  expect(achado, `nenhum elemento casou com ${re}`).not.toBeNull()
  return Object.fromEntries(
    achado![1]!.split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]),
  )
}
const px = (valor: string | undefined) => Number((valor ?? '').replace('px', ''))
/** A largura declarada de uma borda encurtada ("1px solid #3A2A52"). */
const larguraDaBorda = (borda: string | undefined) => px(borda?.split(' ')[0])

const TRILHO = /<div style="(height:[^"]*position:relative)"/
const CHEIO = /<div style="(position:absolute;left:0;[^"]*)"/
const MARCO_ALVO = /<div aria-hidden="true" style="(position:absolute;left:100%[^"]*)"/
const MARCO_FIRE = /<div aria-hidden="true" style="(position:absolute;left:72\.7%[^"]*)"/
const PONTO = /<span role="img"[^>]*style="([^"]*)"/
const LEGENDA = /<div style="(display:flex;justify-content:space-between;margin-top[^"]*)"/

/**
 * Os textos das colunas da legenda, em ordem de DOM — que é a ordem na tela:
 * num flex `space-between` o primeiro filho encosta na esquerda e o último na
 * direita. Coluna vazia entra como string vazia, de propósito: ela é o que
 * segura o alinhamento das outras.
 */
function colunasDaLegenda(html: string): string[] {
  const inicio = html.search(LEGENDA)
  expect(inicio, 'nenhuma legenda no HTML').toBeGreaterThan(-1)
  // A legenda não tem `div` dentro: o primeiro fechamento é o dela.
  const trecho = html.slice(inicio, html.indexOf('</div>', inicio))
  return [...trecho.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1]!)
}

describe('BarraAlvo — a caixa medida no artboard (FireLive.dc.html, `.trilho`)', () => {
  // O artboard NÃO tem reset de box-sizing: `.trilho{height:7px;border:1px}`
  // é content-box e renderiza 9 px totais com 7 px de laranja entre as bordas
  // (medido no PNG: laranja puro nas linhas 424–430, borda em 423 e 431). O
  // app TEM o reset (`src/app/globals.css`, `*{box-sizing:border-box}`), então
  // o mesmo desenho aqui se escreve com a altura TOTAL — repetir os 7 px do
  // artboard deixaria a barra 2 px mais fina que o aprovado, e os filhos
  // absolutos (que se resolvem contra o miolo) desalinhados.
  const html = render(artboard)
  const trilho = estilo(html, TRILHO)
  const alturaDoTrilho = px(trilho.height)
  const borda = larguraDaBorda(trilho.border)

  it('o trilho mede 9 px e o preenchimento ocupa os 7 px de miolo', () => {
    expect(trilho['box-sizing']).toBe('border-box')
    expect(borda).toBe(1)
    expect(alturaDoTrilho - 2 * borda).toBe(7)
    // o preenchimento é filho absoluto: `height:100%` é 100% do MIOLO
    expect(estilo(html, CHEIO).height).toBe('100%')
  })

  it('o marco sobra igual dos dois lados do trilho — 2 px acima, 2 px abaixo', () => {
    const marco = estilo(html, MARCO_ALVO)
    // `top` de filho absoluto conta a partir do miolo, que começa uma borda
    // abaixo do topo do trilho.
    const topo = borda + px(marco.top)
    expect(-topo).toBe(2)
    expect(topo + px(marco.height) - alturaDoTrilho).toBe(2)
  })

  it('o ponto do apito tem 13 px com núcleo branco de 9 px, centrado no trilho', () => {
    const ponto = estilo(html, PONTO)
    const diametro = px(ponto.width)
    expect(ponto.height).toBe(ponto.width)
    expect(ponto['box-sizing']).toBe('border-box')
    expect(diametro).toBe(13)
    // `.apitou{width:9px;border:2px}` do artboard é content-box: o núcleo
    // branco tem os 9 px, o anel fica por fora.
    expect(diametro - 2 * larguraDaBorda(ponto.border)).toBe(9)
    // o centro do ponto é o centro da barra, nos dois eixos
    expect(borda + px(ponto.top) + diametro / 2).toBe(alturaDoTrilho / 2)
    expect(px(ponto['margin-left'])).toBe(-diametro / 2)
  })

  it('o traço do alvo encosta por DENTRO da borda direita; o do meio fica centrado', () => {
    const alvo = estilo(html, MARCO_ALVO)
    const fire = estilo(html, MARCO_FIRE)
    // `.marco{left:100%;margin-left:-2px}` no artboard: centrado, metade do
    // traço cairia sobre a borda.
    expect(px(alvo['margin-left'])).toBe(-px(alvo.width))
    expect(px(fire['margin-left'])).toBe(-px(fire.width) / 2)
  })

  it('a legenda escreve número de largura fixa e sem gap que o artboard não tem', () => {
    const legenda = estilo(html, LEGENDA)
    // `body{font-variant-numeric:tabular-nums}` do artboard: a 30 s por
    // refresh, número que muda de largura faz a legenda pular.
    expect(legenda['font-variant-numeric']).toBe('tabular-nums')
    expect(legenda.gap).toBeUndefined()
  })
})
