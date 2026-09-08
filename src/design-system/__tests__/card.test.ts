import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CardEntrada, type CardEntradaProps } from '../componentes/CardEntrada'
import { componente } from '../tokens/componente'
import { MODO_FIRE } from '../tokens/css'

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

/**
 * O `style` do `<article>` — a caixa do card. O brilho do universo quente
 * também veste o preenchimento da BarraAlvo (`.cheio` do artboard), então
 * procurar o token no documento inteiro não diz nada sobre o CARD.
 */
const estiloDoCard = (html: string) => /<article style="([^"]*)"/.exec(html)?.[1] ?? ''

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
    expect(batida).toContain('ALVO BATIDO')

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

  it('diz de que LADO o jogador está: "@ DEN" fora de casa, "vs DEN" em casa', () => {
    // O artboard alterna `MIA · @ IND` e `IND · vs MIA`. Em POR NÍVEL, sem
    // cabeçalho de jogo, essa é a única pista de onde a partida acontece.
    expect(render({ ...base, linha: 20, adversarioSigla: 'DEN', emCasa: false })).toContain('@ DEN')
    expect(render({ ...base, linha: 20, adversarioSigla: 'DEN', emCasa: false })).not.toContain(
      'vs DEN',
    )
    expect(render({ ...base, linha: 20, adversarioSigla: 'DEN', emCasa: true })).toContain('vs DEN')
  })

  it('a nota de confiança é número puro — o artboard 04 tirou o "%" do card', () => {
    // docs/04-design-system.md: "Probabilidade: 92%" ❌ contra "Confiança: 92" ✅.
    const html = render({ ...base, linha: 20 })
    expect(html).toContain('>92<')
    expect(html).not.toContain('92%')
  })

  it('a faixa metálica do nível fica recuada, alinhada com o avatar', () => {
    // `.faixa-nivel{margin:0 0 4px 14px}` do artboard — encostada na borda
    // esquerda ela brigava com a borda lateral do grau.
    expect(render({ ...base, linha: 20 })).toContain('margin-left:14px')
  })

  it('os links do card são <Link>: tocar num card não recarrega a Lista nem volta ao topo', async () => {
    // Âncora crua faz navegação de documento inteira — a lista recarrega e o
    // assinante é jogado para o início dela. Vigiado no FONTE, como o paywall.
    const { readFile } = await import('node:fs/promises')
    const fonte = await readFile(new URL('../componentes/CardEntrada.tsx', import.meta.url), 'utf8')
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(fonte).toContain("from 'next/link'")
    expect(codigo).not.toMatch(/<a[\s>]/)
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

  it('rodapé: quem decide média ou faixa é o RULESET, pela presença de `media` no item', () => {
    // `odds.exibicao` (config/ruleset.v1.yaml) é decisão homologada do parceiro
    // em 25/08, e a MATERIALIZAÇÃO é que a aplica: com `exibicao: faixa` ela
    // suprime `oddFaixa.media` do item (lista-secreta.ts, "a tela não decide").
    // O card só desenha o que recebe — se ele escolhesse a forma, virar a chave
    // no ruleset deixaria de mudar o produto, e isso é a regra 1 do CLAUDE.md.
    const faixa = render({
      ...base,
      linha: 25,
      mediaTemporada: 25.7,
      oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 },
    })
    expect(faixa).toContain('ODD 1,47–1,62')

    const comMedia = render({
      ...base,
      linha: 25,
      mediaTemporada: 25.7,
      oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 },
    })
    expect(comMedia).toContain('ODD MÉDIA 1,55')
    // e a faixa NÃO aparece junto: com `exibicao: media` o card diz um número
    // só, que é o que o parceiro pediu ver.
    expect(comMedia).not.toContain('1,47–1,62')

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

  it('temperatura quente explícita veste a PELE quente mesmo sem modo fire — o brilho, não', () => {
    // O Fire Live inteiro é quente — quem cruza alvo sem estar em modo fire
    // também está na tela ao vivo. A pele é da TELA; o brilho é do modo fire
    // (terceiro card do artboard: sem a pílula, `box-shadow:none`).
    const html = render({
      ...base,
      temperatura: 'quente',
      alvo1Q: 10,
      progresso1Q: { observado: 4, alvo: 10 },
    })
    expect(html).toContain(componente.contextoQuente.cardGradiente)
    expect(html).toContain('4 / 10')
    expect(estiloDoCard(html)).not.toContain('box-shadow')
  })
})

describe('errata pós-merge — alvo desconhecido nunca vira linha batida', () => {
  it('BarraAlvo com alvo 0 mostra 0%, não 100%', async () => {
    const { BarraAlvo } = await import('../componentes/BarraAlvo')
    const html = renderToStaticMarkup(createElement(BarraAlvo, { observado: 3, alvo: 0 }))
    expect(html).toContain('width:0%')
    expect(html).not.toContain('width:100%')
  })

  it('card quente sem progresso não afirma ALVO BATIDO', () => {
    const html = render({ ...base, temperatura: 'quente', progresso1Q: null })
    expect(html).not.toContain('ALVO BATIDO')
  })

  it('alvo ZERO também não é alvo: nem "ALVO BATIDO", nem "FALTA", nem "ALVO 1º Q · 0"', () => {
    // A barra se recusa a desenhar contra régua zero (`alvo > 0`): sem marco,
    // sem ponto, sem legenda. O rodapé do MESMO card não pode afirmar o
    // contrário — 0 de 0 lido como alvo cumprido é exatamente a linha batida
    // inventada que esta errata existe para impedir, e "FALTA 0" mente do
    // outro lado.
    for (const progresso1Q of [
      { observado: 0, alvo: 0 },
      { observado: 3, alvo: 0 },
    ]) {
      const html = render({ ...base, temperatura: 'quente', alvo1Q: 0, progresso1Q })
      expect(html, JSON.stringify(progresso1Q)).not.toContain('ALVO BATIDO')
      expect(html, JSON.stringify(progresso1Q)).not.toContain('FALTA')
      expect(html, JSON.stringify(progresso1Q)).not.toContain('ALVO 1º Q · 0')
    }
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
    expect(html).toContain(componente.abaAtributo.ativaPorNivel[3].borda)
    expect(html).toContain(componente.abaAtributo.ativaPorNivel[3].fundo)
    expect(html).not.toContain('PONTOS 10+')
  })

  it('a aba ativa veste a cor do NÍVEL DO APITO daquele card, não um verde fixo', () => {
    // Verde é N3. Fixá-lo na aba faria um card N1 exibir o sinal de N3 no
    // rodapé — um quarto canal de cor contradizendo o anel do avatar.
    const abas = [
      { atributo: 'PONTOS' as const, linha: 10, ativo: true, href: '/?atributo=PONTOS' },
      { atributo: 'REBOTES' as const, linha: 3, ativo: false, href: '/?atributo=REBOTES' },
    ]
    // A asserção é sobre a TINTA, não sobre a borda: a cor da borda também é a
    // do anel do avatar e apareceria no HTML de qualquer jeito. A tinta a 12%
    // só existe na aba, então ela é a única prova do vínculo.
    const n1 = render({ ...base, nivelApito: 1, linha: 10, atributos: abas })
    expect(n1).toContain(componente.abaAtributo.ativaPorNivel[1].fundo)
    expect(n1).not.toContain(componente.abaAtributo.ativaPorNivel[3].fundo)

    const turbo = render({ ...base, nivelApito: 1, turbo: true, linha: 10, atributos: abas })
    expect(turbo).toContain(componente.abaAtributo.ativaTurbo.fundo)
    expect(turbo).not.toContain(componente.abaAtributo.ativaPorNivel[1].fundo)
  })

  it('aba de atributo sem linha escreve só o atributo — o apito não some do card', () => {
    // Um apito com `linha` nula existe (o mercado ainda não veio das casas).
    // Filtrá-lo apagava o apito da tela inteira, porque o card por jogador é o
    // único lugar onde ele aparece. Escrever "REB 0+" seria pior: número
    // inventado. Escrever "REB" é a verdade.
    const html = render({
      ...base,
      linha: 10,
      atributos: [
        { atributo: 'PONTOS' as const, linha: 10, ativo: true, href: '/?a=PTS' },
        { atributo: 'REBOTES' as const, linha: null, ativo: false, href: '/?a=REB' },
      ],
    })
    expect(html).toContain('PTS 10+')
    expect(html).toContain('>REB<')
    expect(html).not.toContain('REB 0+')
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

describe('CardEntrada — identidade 04: o card QUENTE do Fire Live', () => {
  // Como o Fire Live monta o card (fire-live/page.tsx): sem confiança — ela é
  // conceito pré-live —, temperatura quente e o progresso contra o alvo do 1º Q.
  const quente = {
    ...base,
    confianca: null,
    grauConfianca: null,
    temperatura: 'quente' as const,
    vivo: true,
    alvo1Q: 11,
    progresso1Q: { observado: 9, alvo: 11 },
  }

  it('rodapé quente: "ALVO 1º Q · 11 PTS" à esquerda, o que FALTA à direita', () => {
    const html = render(quente)
    expect(html).toContain('ALVO 1º Q · 11 PTS')
    expect(html).toContain('FALTA 2 PTS')
    // Os dois lados escrevem número, e a tela se recarrega a cada 30 s: sem
    // largura fixa de dígito (`body{font-variant-numeric:tabular-nums}` no
    // artboard) o "FALTA n" muda de largura e o rodapé pula.
    expect(html).toMatch(/font-variant-numeric:tabular-nums[^"]*">ALVO 1º Q · 11 PTS</)
    expect(html).toMatch(/font-variant-numeric:tabular-nums[^"]*">FALTA 2 PTS</)
  })

  it('alvo alcançado é "ALVO BATIDO" — a LINHA é do jogo inteiro, o alvo é do 1º Q', () => {
    const html = render({ ...quente, progresso1Q: { observado: 12, alvo: 11 } })
    expect(html).toContain('ALVO BATIDO')
    expect(html).not.toContain('LINHA BATIDA')
    expect(html).not.toContain('FALTA')
  })

  it('mesmo com linha do jogo inteiro, o rodapé quente fala do alvo do 1º Q', () => {
    // No pré-live a linha manda; na tela ao vivo o assinante acompanha o alvo.
    const html = render({ ...quente, linha: 24 })
    expect(html).toContain('ALVO 1º Q · 11 PTS')
    expect(html).not.toContain('PONTOS 24+')
  })

  it('o marco do modo fire chega à barra com o rótulo que a ENTREGA escreveu', () => {
    // O percentual do modo fire é regra de estratégia (ruleset): o card recebe
    // o valor E o texto prontos. Nenhum "75" mora neste componente.
    const html = render({ ...quente, alvoFire: { valor: 8, rotulo: '75% da média' } })
    expect(html).toContain('75% da média · 8')
    expect(html).toContain('left:72.7%')
    expect(html).toContain(`background:${MODO_FIRE.cor}`)

    const fonte = readFileSync('src/design-system/componentes/CardEntrada.tsx', 'utf8')
    expect(fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toContain('75%')
  })

  it('o brilho quente tem dono: só o card em MODO FIRE brilha, não todo card da tela', () => {
    // "Três brilhos, três donos" (docs/04 e o cabeçalho do próprio CardEntrada):
    // grau 5 → cor do grau; turbo → turboBrilho; MODO FIRE → brilho quente. No
    // artboard os dois cards com a pílula "Modo fire" brilham e o terceiro —
    // sem ela — leva `box-shadow:none`. Brilho em todo card quente seria um
    // quarto canal de cor, e deixaria de sinalizar modo fire.
    const emModoFire = render({ ...quente, modoFire: true })
    expect(estiloDoCard(emModoFire)).toContain(`box-shadow:${componente.contextoQuente.brilho}`)

    const semModoFire = render(quente)
    expect(semModoFire).toContain(componente.contextoQuente.cardGradiente) // a pele segue quente
    expect(estiloDoCard(semModoFire)).not.toContain('box-shadow')
  })

  it('"apitou aqui" nasce do valor no instante do push, com a unidade do atributo', () => {
    const html = render({ ...quente, apitouEm: 6 })
    expect(html).toContain('aria-label="apitou aqui · 6 pts"')
    expect(html).toContain('apitou aqui · 6 pts')

    // SEM O DADO A BARRA CALA. O card do Fire Live já É um apito: escrever
    // "ainda sem apito" embaixo dele seria falso na tela do assinante. A frase
    // só sai quando quem monta o card AFIRMA que o push não veio (`null`) — o
    // alvo aguardando o 1º quarto, terceiro card do artboard.
    expect(render(quente)).not.toContain('ainda sem apito')
    expect(render(quente)).not.toContain('apitou aqui')
    expect(render({ ...quente, apitouEm: null })).toContain('ainda sem apito')
  })

  it('o status de largura fixa acompanha o ciclo: PRÉ · 1º Q ao vivo · FIM 1º Q neutro', () => {
    const largura = `width:${componente.statusCiclo.largura};box-sizing:border-box`

    const antes = render({ ...quente, estado: 'PRE' })
    expect(antes).toContain(largura)
    expect(antes).toContain('>PRÉ<')
    expect(antes).toContain(componente.statusCiclo.fundoNeutro)

    const noQuarto = render({ ...quente, estado: 'Q1' })
    expect(noQuarto).toContain(largura)
    expect(noQuarto).toContain('>1º Q<')
    expect(noQuarto).toContain(componente.statusCiclo.fundoAoVivo)
    expect(noQuarto).toContain(componente.statusCiclo.bordaAoVivo)

    // FIM 1º Q congela: o apito não some da tela, mas para de piscar
    const depois = render({ ...quente, estado: 'FIM_Q1' })
    expect(depois).toContain(largura)
    expect(depois).toContain('>FIM 1º Q<')
    expect(depois).toContain(componente.statusCiclo.fundoNeutro)
    expect(depois).not.toContain(componente.statusCiclo.fundoAoVivo)
  })
})

describe('CardEntrada — regras de escrita (docs/04-design-system.md)', () => {
  const telas = [
    render({
      ...base,
      linha: 24,
      mediaTemporada: 25.7,
      oddFaixa: { min: 1.3, max: 1.7, qtdCasas: 4 },
    }),
    render({ ...base, linha: 24, estado: 'CONFERIDO', fez: 27, bateu: true }),
    render({
      ...base,
      confianca: null,
      grauConfianca: null,
      temperatura: 'quente',
      alvo1Q: 11,
      progresso1Q: { observado: 9, alvo: 11 },
      alvoFire: { valor: 8, rotulo: '75% da média' },
      apitouEm: 6,
      estado: 'Q1',
    }),
  ].join('\n')

  it('nunca escreve "probabilidade"', () => {
    expect(telas.toLowerCase()).not.toContain('probabilidade')
  })

  it('a nota da partida NÃO entra no card do apito, e "nível" segue sendo do jogador e do apito', () => {
    // Spec 04 §4.5: a nota competiria com o nível do apito e o grau.
    expect(telas.toLowerCase()).not.toContain('nota')
    expect(telas.toLowerCase()).not.toContain('nível da partida')
  })

  it('a nota de confiança não tem casa decimal', () => {
    const html = render({ ...base, confianca: 92.4, linha: 24 })
    expect(html).toContain('>92<')
    expect(html).not.toContain('92,4')
    expect(html).not.toContain('92.4')
  })

  it('linha sempre INTEIRA com "+", nunca meio ponto', () => {
    expect(telas).toContain('PONTOS 24+')
    expect(telas.toLowerCase()).not.toContain('meio ponto')
    expect(telas).not.toMatch(/\d+,5\+/)
  })

  it('odd sempre em FAIXA, com travessão — "1,30–1,70"', () => {
    expect(telas).toContain('1,30–1,70')
  })

  it('sem "ALTÍSSIMO VALOR" e sem reticências', () => {
    expect(telas).not.toContain('ALTÍSSIMO VALOR')
    expect(telas).not.toContain('...')
    expect(telas).not.toContain('…')
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
})
