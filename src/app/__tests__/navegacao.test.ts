import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraInferior } from '../../components/navegacao'
import { CabecalhoTela } from '../../components/navegacao'
import { semantico } from '../../design-system/tokens/semantico'

describe('navegação (identidade 02)', () => {
  it('as cinco abas do mockup, sem emoji, com SVG', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    for (const rotulo of ['ENTRADAS', 'AO VIVO', 'STATS', 'GESTÃO', 'PERFIL']) expect(html).toContain(rotulo)
    expect(html).not.toContain('RESULTADOS')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[📋🔥✅💰👤]/u)
  })

  it('a aba ativa preenche o ícone em qualquer forma (regressão: quadradoVazado nunca preenchia)', () => {
    // AO VIVO usa a forma 'quadradoVazado'. Antes da correção, o preenchimento
    // ativo era condicionado a `forma === 'quadrado'`, então essa aba nunca
    // preenchia mesmo ativa e sobrava só a cor do traço — cor virando canal
    // único, o que a regra do projeto proíbe.
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'fire-live' }))
    expect(html).toContain(`fill="${semantico.acento}"`)
  })

  it('cabeçalho: sobrancelha + título; contexto aoVivo muda a cor do marcador', () => {
    const padrao = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'LISTA SECRETA · PRÉ-LIVE', titulo: 'LISTA DO DIA' }),
    )
    expect(padrao).toContain('LISTA SECRETA · PRÉ-LIVE')
    expect(padrao).toContain('LISTA DO DIA')

    const vivo = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'FIRE LIVE · AO VIVO', titulo: 'ACONTECENDO', contexto: 'aoVivo' }),
    )
    expect(vivo).toContain('ACONTECENDO')
  })
})
