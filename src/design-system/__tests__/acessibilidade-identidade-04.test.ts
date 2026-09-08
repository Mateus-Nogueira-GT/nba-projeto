import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FormaNoAtributo } from '../componentes/FormaNoAtributo'
import { CardEntrada } from '../componentes/CardEntrada'
import { componente } from '../tokens/componente'
import { AA, hexParaRgb, razaoDeContraste } from '../tokens/contraste'
import { semantico } from '../tokens/semantico'

/** A transparência faz parte da cor que o usuário lê, não da luminância do RGB puro. */
function sobre(cor: string, fundo: string): string {
  if (cor.startsWith('#')) return cor
  const rgba = cor.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  if (!rgba) throw new Error(`Cor sem composição conhecida: ${cor}`)
  const base = hexParaRgb(fundo)
  const alpha = Number(rgba[4])
  const canais = [base.r, base.g, base.b].map((canal, indice) =>
    Math.round(Number(rgba[indice + 1]) * alpha + canal * (1 - alpha)),
  )
  return `#${canais.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`
}

describe('identidade 04 · texto de apoio legível', () => {
  it('o estado DNP preserva contraste do texto neutro após compor a opacidade do card', () => {
    const html = renderToStaticMarkup(createElement(CardEntrada, {
      nome: 'Jogador DNP', timeSigla: 'LAL', atributo: 'PONTOS', nivelJogador: 'MVP',
      nivelApito: 1, confianca: 90, fotoUrl: null, estado: 'NAO_JOGOU', linha: 20,
    }))
    const estilo = html.match(/<article style="([^"]*)"/)?.[1] ?? ''
    const opacidade = Number(estilo.match(/(?:^|;)opacity:([\d.]+)/)?.[1] ?? '1')
    const comporCard = (cor: string) => {
      const { r, g, b } = hexParaRgb(cor)
      return sobre(`rgba(${r},${g},${b},${opacidade})`, semantico.fundo)
    }
    const fundo = sobre(componente.contextoFrio.faixaFundo, semantico.superficieFria1)
    const texto = sobre(componente.conferido.neutro, fundo)
    expect(razaoDeContraste(comporCard(texto), comporCard(fundo))).toBeGreaterThanOrEqual(AA.texto)
  })
  // A tabela usa fundo no cabeçalho fixo; os rodapés e cabeçalhos de jogo
  // também usam texto40 sobre os dois extremos do card frio. São textos de
  // 9–12px: a tolerância de texto grande não se aplica.
  it.each([
    ['fundo da tabela e do detalhe', semantico.fundo],
    ['superfície fria inicial', semantico.superficieFria1],
    ['superfície fria final', semantico.superficieFria2],
  ])('texto40 passa AA sobre %s', (_nome, fundo) => {
    const razao = razaoDeContraste(sobre(semantico.texto40, fundo), fundo)
    expect(razao, `texto40 composto: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA.texto)
  })

  // O vermelho das barrinhas era fundo com número claro. No veredito virou
  // texto de 14px sobre o card + véu do rodapé; esse par precisa passar por si.
  it.each([
    ['início', semantico.superficieFria1],
    ['fim', semantico.superficieFria2],
  ])('o veredito falhou passa AA no %s do rodapé frio', (_nome, card) => {
    const fundo = sobre(componente.contextoFrio.faixaFundo, card)
    const razao = razaoDeContraste(sobre(componente.conferido.falhou, fundo), fundo)
    expect(razao, `veredito falhou: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA.texto)
  })
})

describe('identidade 04 · alternativa textual da forma', () => {
  const jogos = [
    { valor: 6, bateu: true, adversarioSigla: 'AAA' },
    { valor: 4, bateu: true, adversarioSigla: 'BBB' },
    { valor: 2, bateu: false, adversarioSigla: 'CCC' },
  ]

  it.each([4, null])('o gráfico com linha %s descreve valores e adversários visíveis', (linha) => {
    const html = renderToStaticMarkup(createElement(FormaNoAtributo, { jogos, linha }))
    // role=img faz o gráfico ser anunciado como uma unidade. Os valores e
    // siglas desenhados dentro dela precisam de equivalência na descrição;
    // "bateu 2 de 3" sozinho perde a sequência que a forma existe para mostrar.
    const nome = html.match(/role="img" aria-label="([^"]*)"/)?.[1]
    expect(nome).toBeDefined()
    for (const jogo of jogos) {
      expect(nome).toContain(jogo.adversarioSigla)
      expect(nome).toContain(String(jogo.valor))
    }
  })
})
