import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraInferior } from '../../components/navegacao'
import { CabecalhoTela, FolhaDeFiltros } from '../../components/navegacao'
import { GRADE_DE_CARDS, Moldura, LARGURA_DA_MOLDURA } from '../../components/navegacao/Moldura'
import { Esqueleto } from '../../components/navegacao/Esqueleto'
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

  it('a aba ativa é uma pílula PREENCHIDA no acento, com texto branco e aria-current', () => {
    // A regressão que este teste guardava desde a identidade 02 era outra: o
    // preenchimento do ícone dependia da forma, e uma das abas nunca acendia.
    // Na identidade 05 não há mais formas nem preenchimento de ícone — quem
    // acende é a pílula atrás dele, igual em todas as abas, e a cor continua
    // não sendo canal único (peso da fonte e `aria-current` acompanham).
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'fire-live' }))
    expect(html).toContain('aria-current="page"')
    expect(html).toContain(`background:${componente.pilulaNav.fundoAtiva}`)
    expect(html).toContain(`color:${componente.pilulaNav.textoAtiva}`)
    // uma pílula acesa, e uma só
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('os ícones são de traço, 20 px, um por aba — nada de forma geométrica', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    expect(html.match(/<svg width="20" height="20"/g)).toHaveLength(5)
    expect(html).toContain('stroke-width="1.5"')
    expect(html).not.toContain('<rect')
  })

  it('nenhum rótulo da navegação fica abaixo do piso de 12 px do manual', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    expect(html).not.toMatch(/font-size:1[01]px/)
  })

  it('a barra inferior veste o cromo e se separa do conteúdo pela divisória', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    expect(html).toContain(`background:${semantico.cromo}`)
    expect(html).toContain(`border-top:1px solid ${semantico.divisor}`)
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

  it('lente ATIVA guarda o sublinhado mesmo quando o grupo GRAVA a escolha', () => {
    // Regressão que já custou caro duas vezes: com `acao`, a opção vira
    // <button> e o `border: none` que o botão precisa comia a borda calculada.
    // Na identidade 04 isso apagava a borda divisória da pílula ativa; na 05
    // apagava o SUBLINHADO da aba ativa, e nos dois casos só na Lista — que é
    // a única tela onde a lente grava a escolha na conta. A ordem das chaves é
    // a ordem das declarações: o `none` vai antes, o específico depois.
    const comAcao = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        titulo: 'LISTA DO DIA',
        lentes: {
          opcoes: [
            { valor: 'ULT5', rotulo: 'ÚLT. 5', href: '/?lente=ULT5' },
            { valor: 'ODDS', rotulo: 'ODDS', href: '/?lente=ODDS' },
          ],
          ativa: 'ULT5',
          acao: async () => {},
        },
      }),
    )
    expect(comAcao).toContain('<form')
    expect(comAcao).toContain(`border-bottom:2px solid ${semantico.texto100}`)
    expect(comAcao).toContain('border-bottom:2px solid transparent')
    // o `none` do <button> continua lá, mas ANTES do sublinhado, sem comê-lo
    expect(comAcao).toMatch(/border:none;[^"]*border-bottom:2px solid/)
  })

  it('a sobrancelha é cinza, e o marcador ao lado dela não carrega mais o acento', () => {
    // Identidade 05: o marcador do contexto deixou de ser o acento — o azul do
    // manual não pode virar um quadradinho de cor solto, que é o vocabulário do
    // anel do apito. Quem diz o contexto é o SELO no canto do cabeçalho.
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'LISTA SECRETA', titulo: 'LISTA DO DIA' }),
    )
    const sobrancelha = html.match(/<p style="([^"]*)"/)![1]!
    expect(sobrancelha).toContain(`color:${semantico.textoSecundario}`)
    expect(html).not.toContain(`background:${semantico.acento}`)
  })

  it('FolhaDeFiltros: o botão FILTRAR fica na tela, a parede de filtros dentro da folha fechada, o recorte ativo vira chip com ×', () => {
    const html = renderToStaticMarkup(
      createElement(FolhaDeFiltros, {
        ativos: [{ rotulo: 'PONTOS', limparHref: '/' }],
        grupos: [{ titulo: 'QUANTIDADE', chips: 'chips' }],
      }),
    )
    expect(html).toContain('FILTRAR')
    expect(html).toContain('<details')
    expect(html).not.toContain('<details open')
    expect(html).toContain('<summary')
    expect(html).toContain('QUANTIDADE')
    expect(html).toContain('PONTOS')
    expect(html).toContain('×')
    expect(html).toContain('href="/"')
    // o ícone do FILTRAR é cinza (artboard), não herda a cor do rótulo
    expect(html).toContain(`stroke="${semantico.textoSecundario}"`)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('a moldura tem duas larguras: leitura (padrão) e dados', () => {
    const leitura = renderToStaticMarkup(createElement(Moldura, { aba: 'lista' }, 'x'))
    const dados = renderToStaticMarkup(
      createElement(Moldura, { aba: 'stats', largura: 'dados' }, 'x'),
    )
    // A largura viaja por variável CSS: o `max-width` mora no .module.css,
    // porque a partir de 1280 ele muda junto com a lateral e uma media query
    // não alcança um estilo embutido.
    expect(leitura).toContain(`--largura-coluna:${LARGURA_DA_MOLDURA.leitura}px`)
    expect(dados).toContain(`--largura-coluna:${LARGURA_DA_MOLDURA.dados}px`)
  })

  it('o esqueleto de carregamento acompanha a largura, senão a tela pula quando o conteúdo chega', () => {
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'stats', largura: 'dados' }))
    expect(html).toContain(`--largura-coluna:${LARGURA_DA_MOLDURA.dados}px`)
  })
})

// ===========================================================================
// IDENTIDADE 05 — A MOLDURA DE TRÊS REGIÕES
// ===========================================================================

describe('moldura (identidade 05)', () => {
  it('desenha as DUAS barras — o CSS escolhe uma — e o cromo é o navy', () => {
    // As duas saem no HTML de propósito: é isso que mantém a Moldura como
    // componente de servidor, sem medir janela nem embarcar JavaScript em toda
    // página só para decidir qual barra mostrar.
    const html = renderToStaticMarkup(
      createElement(Moldura, { aba: 'lista' }, 'conteúdo'),
    )
    expect(html).toContain('barra-inferior')
    expect(html).toContain('aria-label="Seções do app (topo)"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(2)
    expect(html).toContain(`background:${semantico.cromo}`)
  })

  it('a lateral só existe quando a TELA passa uma', () => {
    const sem = renderToStaticMarkup(createElement(Moldura, { aba: 'lista' }, 'x'))
    const com = renderToStaticMarkup(
      createElement(Moldura, { aba: 'lista', lateral: 'painel' }, 'x'),
    )
    expect(sem).not.toContain('aria-label="Painel lateral"')
    expect(com).toContain('aria-label="Painel lateral"')
  })

  it('tela sem aba não ganha barra nenhuma nem lateral', () => {
    const html = renderToStaticMarkup(createElement(Moldura, { aba: null }, 'x'))
    expect(html).not.toContain('barra-inferior')
    expect(html).not.toContain('Seções do app')
  })

  it('a grade de cards nunca exige mais largura do que a tela tem', () => {
    // O `minmax(420px, 1fr)` anterior vazava a 390 px: 420 forçados numa tela
    // com 358 úteis criavam rolagem horizontal, que o manual proíbe.
    expect(GRADE_DE_CARDS).toBe('repeat(auto-fill, minmax(min(420px, 100%), 1fr))')
  })

  it('os pontos de quebra do CSS da moldura são os dos tokens', () => {
    // Media query não lê variável CSS: o número é repetido no .module.css, e
    // é este teste que impede os dois de divergirem.
    const css = readFileSync('src/components/navegacao/Moldura.module.css', 'utf8')
    expect(css).toContain(`(min-width: ${semantico.larguraTopo}px)`)
    expect(css).toContain(`(min-width: ${semantico.larguraLateral}px)`)
    const filtros = readFileSync('src/components/navegacao/FolhaDeFiltros.module.css', 'utf8')
    expect(filtros).toContain(`(min-width: ${semantico.larguraTopo}px)`)
  })

  it('o esqueleto veste a MESMA moldura, com o cromo inteiro', () => {
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'stats' }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-label="Seções do app (topo)"')
    expect(html).toContain('barra-inferior')
  })

  it('a barra do topo só mostra o atalho da conta quando a tela passa uma', () => {
    const sem = renderToStaticMarkup(createElement(Moldura, { aba: 'conta' }, 'x'))
    const com = renderToStaticMarkup(
      createElement(Moldura, { aba: 'conta', conta: { email: 'a@b.com' } }, 'x'),
    )
    expect(sem).not.toContain('aria-label="Sua conta"')
    expect(com).toContain('aria-label="Sua conta"')
  })
})

describe('cabeçalho de tela (identidade 05)', () => {
  it('H1 em Bebas 32; a sobrancelha perdeu o marcador colorido', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'LISTA SECRETA', titulo: 'LISTA DO DIA' }),
    )
    expect(html).toContain('font-size:32px')
    expect(html).toContain('var(--fonte-bebas)')
    // o losango de 8px que carregava a cor do contexto não existe mais
    expect(html).not.toContain('transform:rotate(45deg)')
  })

  it('o contador é o número da tela em fonte de número, com o rótulo ao lado', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        contador: { numero: 37, rotulo: 'entradas em 7 jogos' },
      }),
    )
    expect(html).toContain('>37</strong>')
    expect(html).toContain('var(--fonte-bebas)')
    expect(html).toContain('entradas em 7 jogos')
  })

  it('as lentes viram abas com sublinhado, não pílulas', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        lentes: {
          ativa: 'A',
          opcoes: [
            { valor: 'A', rotulo: 'ÚLT. 5', href: '/?l=A' },
            { valor: 'B', rotulo: 'ODDS', href: '/?l=B' },
          ],
        },
      }),
    )
    expect(html).toContain(`border-bottom:2px solid ${semantico.texto100}`)
    expect(html).toContain('border-bottom:2px solid transparent')
  })
})

describe('filtros (identidade 05)', () => {
  const grupos = [
    { titulo: 'Quantidade', chips: 'q' },
    { titulo: 'Método', ativo: 'OPD', chips: 'm' },
  ]

  it('os mesmos grupos saem DUAS vezes: na folha do celular e nos chips com menu do desktop', () => {
    const html = renderToStaticMarkup(createElement(FolhaDeFiltros, { grupos }))
    // folha: um fieldset/legend por grupo
    expect(html.match(/<legend/g)).toHaveLength(2)
    // desktop: um <details> com menu por grupo
    expect(html.match(/<details/g)).toHaveLength(3) // 2 menus + a folha
    expect(html).toContain('role="group"')
  })

  it('o chip do grupo mostra o que está filtrando, não o nome do filtro', () => {
    const html = renderToStaticMarkup(createElement(FolhaDeFiltros, { grupos }))
    expect(html).toContain('aria-label="Método: OPD"')
    expect(html).toContain('>OPD<')
  })
})
