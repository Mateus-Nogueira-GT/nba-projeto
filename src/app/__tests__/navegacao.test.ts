import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraInferior } from '../../components/navegacao'
import { CabecalhoTela, FolhaDeFiltros } from '../../components/navegacao'
import { SeloContexto } from '../../design-system/componentes'
import { componente } from '../../design-system/tokens/componente'
import { semantico } from '../../design-system/tokens/semantico'

describe('navegação (identidade 02)', () => {
  it('as cinco abas do mockup, sem emoji, com SVG', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    for (const rotulo of ['ENTRADAS', 'AO VIVO', 'STATS', 'GESTÃO', 'PERFIL'])
      expect(html).toContain(rotulo)
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

  it('o botão de voltar é o chevron do artboard, com nome acessível — em TODA tela', () => {
    // O detalhe do apito adotou o chevron do mockup; adotá-lo só lá deixaria
    // metade do app com o glifo "←" e a outra metade com o traço, contra a
    // gramática aprendida uma vez (spec 04, §2/§3). O componente é um só.
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'METODOLOGIA DO CJ',
        titulo: 'COMO FUNCIONA',
        voltarHref: '/',
      }),
    )
    expect(html).toContain('aria-label="Voltar"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('←')
  })

  it('cabeçalho: sobrancelha + título; contexto aoVivo muda a cor do marcador', () => {
    const padrao = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA · PRÉ-LIVE',
        titulo: 'LISTA DO DIA',
      }),
    )
    expect(padrao).toContain('LISTA SECRETA · PRÉ-LIVE')
    expect(padrao).toContain('LISTA DO DIA')

    const vivo = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'FIRE LIVE · AO VIVO',
        titulo: 'ACONTECENDO',
        contexto: 'aoVivo',
      }),
    )
    expect(vivo).toContain('ACONTECENDO')
  })
})

describe('navegação (identidade 04)', () => {
  it('SeloContexto: PRÉ-LIVE laranja e ■ AO VIVO vermelho — sempre com o texto escrito', () => {
    const vivo = renderToStaticMarkup(createElement(SeloContexto, { contexto: 'aoVivo' }))
    expect(vivo).toContain('AO VIVO')
    expect(vivo).toContain(`background:${componente.seloContexto.aoVivo.fundo}`)

    const pre = renderToStaticMarkup(createElement(SeloContexto, { contexto: 'preLive' }))
    expect(pre).toContain('PRÉ-LIVE')
    expect(pre).toContain(`background:${componente.seloContexto.preLive.fundo}`)
    expect(pre).not.toContain(componente.seloContexto.aoVivo.fundo)
  })

  it('CabecalhoTela: slots novos — selo, seletor, ações e lentes — com a opção ativa em aria-current', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        titulo: 'LISTA DO DIA',
        selo: createElement(SeloContexto, { contexto: 'preLive' }),
        seletor: {
          opcoes: [
            { valor: 'POR_JOGO', rotulo: 'POR JOGO', href: '/?ordem=POR_JOGO' },
            { valor: 'POR_NIVEL', rotulo: 'POR NÍVEL', href: '/?ordem=POR_NIVEL' },
          ],
          ativa: 'POR_JOGO',
        },
        acoes: createElement('button', null, 'FILTRAR'),
        lentes: {
          opcoes: [
            { valor: 'ULT5', rotulo: 'ÚLT. 5', href: '/?lente=ULT5' },
            { valor: 'ODDS', rotulo: 'ODDS', href: '/?lente=ODDS' },
          ],
          ativa: 'ODDS',
        },
      }),
    )
    for (const texto of ['PRÉ-LIVE', 'POR JOGO', 'POR NÍVEL', 'FILTRAR', 'ÚLT. 5', 'ODDS'])
      expect(html).toContain(texto)
    expect(html.match(/aria-current="page"/g)).toHaveLength(2)
    expect(html).toContain('href="/?ordem=POR_NIVEL"')
    expect(html).toContain('href="/?lente=ULT5"')
  })

  it('CabecalhoTela sem os slots novos segue igual: as outras telas não mudam', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'SUA CONTA', titulo: 'PERFIL' }),
    )
    expect(html).toContain('PERFIL')
    expect(html).not.toContain('aria-current')
    expect(html).not.toContain('<nav')
  })

  it('FolhaDeFiltros: o botão FILTRAR fica na tela, a parede de filtros dentro da folha fechada, o recorte ativo vira chip com ×', () => {
    const html = renderToStaticMarkup(
      createElement(
        FolhaDeFiltros,
        { ativos: [{ rotulo: 'PONTOS', limparHref: '/' }] },
        createElement('fieldset', null, 'QUANTIDADE'),
      ),
    )
    expect(html).toContain('FILTRAR')
    expect(html).toContain('<details')
    expect(html).not.toContain('<details open')
    expect(html).toContain('<summary')
    expect(html).toContain('QUANTIDADE')
    expect(html).toContain('PONTOS')
    expect(html).toContain('×')
    expect(html).toContain('href="/"')
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })
})
