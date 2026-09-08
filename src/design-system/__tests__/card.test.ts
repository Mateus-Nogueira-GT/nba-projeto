import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CardEntrada, type CardEntradaProps } from '../componentes/CardEntrada'
import { componente } from '../tokens/componente'

const base = {
  nome: 'D. Malloy',
  timeSigla: 'LAL',
  posicao: 'G',
  atributo: 'PONTOS' as const,
  nivelJogador: 'MVP' as const,
  nivelApito: 3 as const,
  confianca: 92,
  grauConfianca: 4 as const,
  fotoUrl: null,
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
    const batida = render({
      ...base,
      vivo: true,
      temperatura: 'quente',
      alvo1Q: 12,
      progresso1Q: { observado: 14, alvo: 12 },
    })
    expect(batida).toContain('VIVO')
    expect(batida).toContain('LINHA BATIDA')

    const parcial = render({
      ...base,
      vivo: true,
      temperatura: 'quente',
      alvo1Q: 12,
      progresso1Q: { observado: 9, alvo: 12 },
    })
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
      ...base,
      linha: 25,
      ultimos5: [
        { valor: 30, bateu: true },
        { valor: 20, bateu: false },
      ],
    })
    expect(html).toContain('ÚLT. 5 NA LINHA')
    expect(html).toContain('>30<')
    expect(html).toContain('>20<')
  })

  it('na tela quente a zona 2 é a barra rumo ao alvo, não as barrinhas', () => {
    const html = render({
      ...base,
      temperatura: 'quente',
      modoFire: true,
      alvo1Q: 10,
      progresso1Q: { observado: 9, alvo: 10 },
      ultimos5: [{ valor: 30, bateu: true }],
    })
    expect(html).toContain('9 / 10')
    expect(html).not.toContain('ÚLT. 5 NA LINHA')
  })

  it('rodapé: faixa sem média, ODD MÉDIA quando existir, nada de odd quando null', () => {
    expect(
      render({
        ...base,
        linha: 25,
        mediaTemporada: 25.7,
        oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 },
      }),
    ).toContain('ODD 1,47–1,62')
    expect(
      render({
        ...base,
        linha: 25,
        mediaTemporada: 25.7,
        oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 },
      }),
    ).toContain('ODD MÉDIA 1,55')
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
      ...base,
      modoFire: true,
      linha: 20,
      ultimos5: [{ valor: 30, bateu: true }],
      mediaTemporada: 25.7,
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
    const html = render({
      ...base,
      temperatura: 'quente',
      alvo1Q: 10,
      progresso1Q: { observado: 4, alvo: 10 },
    })
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

// ===========================================================================
// IDENTIDADE 04 — o card fecha o ciclo, ganha abas de atributo e lente
// ===========================================================================

describe('CardEntrada — identidade 04: o card fecha o ciclo (PRÉ → CONFERIDO)', () => {
  const conferido = {
    ...base,
    linha: 25,
    mediaTemporada: 25.7,
    oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 },
  }

  it('CONFERIDO e bateu: o rodapé direito vira "fez 27" com o ✓ nomeado, na cor de bateu', () => {
    const html = render({ ...conferido, estado: 'CONFERIDO', fez: 27, bateu: true })
    expect(html).toContain('fez 27')
    expect(html).toContain('aria-label="Bateu a linha"')
    expect(html).toContain(componente.conferido.bateu)
    // média e odd saem do rodapé: o veredito ocupa o lugar deles
    expect(html).not.toContain('MÉDIA 25,7')
    expect(html).not.toContain('ODD 1,47')
  })

  it('CONFERIDO e não bateu: "fez 19" com o ✗ nomeado, na cor de falhou', () => {
    const html = render({ ...conferido, estado: 'CONFERIDO', fez: 19, bateu: false })
    expect(html).toContain('fez 19')
    expect(html).toContain('aria-label="Não bateu a linha"')
    expect(html).toContain(componente.conferido.falhou)
  })

  it('CONFERIDO sem jogar é NEUTRO: "não jogou · neutro", nem ✓ nem ✗, badge DNP', () => {
    const html = render({ ...conferido, estado: 'CONFERIDO', fez: null, bateu: null })
    expect(html).toContain('não jogou · neutro')
    expect(html).not.toContain('aria-label="Bateu a linha"')
    expect(html).not.toContain('aria-label="Não bateu a linha"')
    expect(html).toContain(componente.conferido.neutro)
    expect(html).toContain('>DNP<')
  })

  it('badge de status de largura FIXA com o rótulo escrito: PRÉ · 1º Q · FIM 1º Q · FT', () => {
    const casos = [
      ['PRE', 'PRÉ'],
      ['Q1', '1º Q'],
      ['FIM_Q1', 'FIM 1º Q'],
      ['AGUARDANDO_OFICIAL', 'FT'],
      ['CONFERIDO', 'FT'],
    ] as const
    for (const [estado, rotulo] of casos) {
      const html = render({ ...conferido, estado, fez: 27, bateu: true })
      expect(html, estado).toContain(
        `width:${componente.statusCiclo.largura};box-sizing:border-box`,
      )
      expect(html, estado).toContain(`>${rotulo}<`)
    }
  })

  it('só o 1º Q em andamento veste a tinta do ao vivo; os outros estados são neutros', () => {
    const vivo = render({ ...base, linha: 20, estado: 'Q1' })
    expect(vivo).toContain(componente.statusCiclo.fundoAoVivo)
    for (const estado of ['PRE', 'FIM_Q1', 'AGUARDANDO_OFICIAL'] as const) {
      const html = render({ ...base, linha: 20, estado })
      expect(html, estado).toContain(componente.statusCiclo.fundoNeutro)
      expect(html, estado).not.toContain(componente.statusCiclo.fundoAoVivo)
    }
  })

  it('sem as props novas nada muda: nem badge, nem aba, nem veredito', () => {
    const html = render({ ...conferido })
    // o Avatar também mede 52px; a assinatura do badge é largura fixa + box-sizing
    expect(html).not.toContain(`width:${componente.statusCiclo.largura};box-sizing:border-box`)
    expect(html).not.toMatch(/>(PRÉ|1º Q|FIM 1º Q|FT|DNP)</)
    expect(html).not.toContain('aria-current')
    expect(html).not.toContain('fez ')
    expect(html).toContain('MÉDIA 25,7')
  })
})

describe('CardEntrada — identidade 04: abas de atributo e lente da zona 2', () => {
  const abas = [
    { atributo: 'PONTOS' as const, linha: 10, ativo: true, href: '/?atributo=PONTOS' },
    { atributo: 'REBOTES' as const, linha: 3, ativo: false, href: '/?atributo=REBOTES' },
    { atributo: 'ASSISTENCIAS' as const, linha: 4, ativo: false, href: '/?atributo=ASSISTENCIAS' },
  ]

  it('três atributos viram três abas no rodapé, uma ativa com aria-current, no lugar do rótulo longo', () => {
    const html = render({ ...base, linha: 10, atributos: abas })
    for (const rotulo of ['PTS 10+', 'REB 3+', 'AST 4+']) expect(html).toContain(rotulo)
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('href="/?atributo=REBOTES"')
    expect(html).toContain(componente.abaAtributo.bordaAtiva)
    expect(html).toContain(componente.abaAtributo.fundoAtiva)
    expect(html).not.toContain('PONTOS 10+')
  })

  it('lente MEDIA_LINHA troca a zona 2: sem Barrinhas, média × linha em texto', () => {
    const html = render({
      ...base,
      linha: 4,
      lente: 'MEDIA_LINHA',
      mediaTemporada: 4.9,
      ultimos5: [
        { valor: 2, bateu: false },
        { valor: 7, bateu: true },
      ],
    })
    expect(html).not.toContain('ÚLT. 5 NA LINHA')
    expect(html).not.toContain('>7<')
    expect(html).toContain('4,9 × 4+')
  })

  it('lente ULT5 é o padrão de hoje; ODDS mostra a faixa e as casas; HIERARQUIA, a posição no time', () => {
    const ult5 = render({ ...base, linha: 4, lente: 'ULT5', ultimos5: [{ valor: 7, bateu: true }] })
    expect(ult5).toContain('ÚLT. 5 NA LINHA')

    const odds = render({
      ...base,
      linha: 4,
      lente: 'ODDS',
      oddFaixa: { min: 1.49, max: 1.66, qtdCasas: 3 },
    })
    expect(odds).toContain('1,49–1,66')
    expect(odds).toContain('3 CASAS')
    expect(odds).not.toContain('ÚLT. 5 NA LINHA')

    const hierarquia = render({
      ...base,
      linha: 4,
      lente: 'HIERARQUIA',
      hierarquia: { posicao: 2, total: 8 },
    })
    expect(hierarquia).toContain('Nº 2 DE 8')
    expect(hierarquia).toContain('HIERARQUIA')
  })

  it('lente sem dado mostra o rótulo com "—", nunca um número inventado', () => {
    const semOdd = render({ ...base, linha: 4, lente: 'ODDS', oddFaixa: null })
    expect(semOdd).toContain('ODD')
    expect(semOdd).toContain('—')
    expect(semOdd).not.toMatch(/\d,\d\d–\d,\d\d/)

    const semHierarquia = render({ ...base, linha: 4, lente: 'HIERARQUIA' })
    expect(semHierarquia).toContain('HIERARQUIA')
    expect(semHierarquia).toContain('—')
    expect(semHierarquia).not.toContain('Nº ')
  })

  it('nunca escreve "probabilidade", em nenhum estado nem lente', () => {
    const todos = [
      render({ ...base, linha: 25, estado: 'CONFERIDO', fez: 27, bateu: true }),
      render({ ...base, linha: 25, estado: 'CONFERIDO', fez: null, bateu: null }),
      render({ ...base, linha: 10, estado: 'Q1', atributos: abas }),
      render({ ...base, linha: 4, lente: 'MEDIA_LINHA', mediaTemporada: 4.9 }),
      render({ ...base, linha: 4, lente: 'ODDS', oddFaixa: { min: 1.49, max: 1.66, qtdCasas: 3 } }),
      render({ ...base, linha: 4, lente: 'HIERARQUIA', hierarquia: { posicao: 1, total: 5 } }),
    ].join('\n')
    expect(todos.toLowerCase()).not.toContain('probabilidade')
  })
})

/**
 * O QUE O CARD NÃO PODE DEDUZIR (revisão adversarial da 04, rodada 1).
 *
 * Duas afirmações que o card fazia sozinho e não tinha como saber: de que lado
 * o jogo foi (escrevia "vs" para todo mundo) e qual quadrado da fileira é o
 * desta rodada (derivava do estado CONFERIDO, e acertava só em quem reordena
 * a fileira — a galeria, que passa a fileira canônica, ganhava o contorno no
 * jogo mais ANTIGO).
 */
describe('CardEntrada — mando e fileira, identidade 04', () => {
  const cinco = [
    { valor: 25, bateu: true },
    { valor: 19, bateu: true },
    { valor: 22, bateu: true },
    { valor: 17, bateu: true },
    { valor: 13, bateu: false },
  ]

  it('o visitante joga "@ ADV"; o mandante, "vs ADV"', () => {
    const fora = render({ ...base, linha: 20, adversarioSigla: 'DEN', emCasa: false })
    expect(fora).toContain('@ DEN')
    expect(fora).not.toContain('vs DEN')

    const casa = render({ ...base, linha: 20, adversarioSigla: 'DEN', emCasa: true })
    expect(casa).toContain('vs DEN')
    expect(casa).not.toContain('@ DEN')

    // Sem dizer o lado, o card segue como antes das telas por jogo.
    expect(render({ ...base, linha: 20, adversarioSigla: 'DEN' })).toContain('vs DEN')
  })

  it('a fileira sai na ordem em que chega: quem monta a fileira decide a direção, o card não inverte', () => {
    const html = render({ ...base, linha: 20, ultimos5: cinco })
    const fileira = html.slice(html.indexOf('ÚLT. 5 NA LINHA'))
    const quadrados = [...fileira.matchAll(/>(\d+)<\/span>/g)].map((m) => m[1])
    expect(quadrados).toEqual(['25', '19', '22', '17', '13'])
  })

  it('o contorno da rodada é EXPLÍCITO: sem a prop, nem o card conferido marca nada', () => {
    const semProp = render({
      ...base,
      linha: 20,
      ultimos5: cinco,
      estado: 'CONFERIDO',
      fez: 25,
      bateu: true,
    })
    expect(semProp).not.toContain('outline')
    expect(semProp).not.toContain('desta rodada')
  })

  it('com destacarUltima, o contorno cai na ÚLTIMA da prop — quem monta a fileira põe o jogo desta rodada no fim', () => {
    const html = render({
      ...base,
      linha: 20,
      ultimos5: [...cinco].reverse(),
      estado: 'CONFERIDO',
      fez: 25,
      bateu: true,
      destacarUltima: true,
    })
    expect(html.match(/outline:2px/g)).toHaveLength(1)
    // A fileira chegou cronológica (13 … 25): o contorno está no quadrado do 25.
    expect(html.indexOf('outline:2px')).toBeGreaterThan(html.indexOf('>13<'))
    expect(html.indexOf('>25<')).toBeGreaterThan(html.indexOf('outline:2px'))
    expect(html).toContain('a última é a desta rodada')
  })

  it('a faixa metálica nasce recuada, alinhada ao conteúdo do card', () => {
    const html = render({ ...base, linha: 20 })
    expect(html).toContain('margin-left:14px')
  })
})
