import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { primitivo } from '../tokens/primitivo'
import { semantico } from '../tokens/semantico'
import { componente } from '../tokens/componente'
import { APITO, CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO, gerarCss } from '../tokens/css'
import { AA, razaoDeContraste } from '../tokens/contraste'

const DIR_COMPONENTES = 'src/design-system/componentes'
const HEX = /#[0-9a-fA-F]{3,8}\b/

// ===========================================================================
// CAMADAS DE TOKEN
// ===========================================================================

describe('camadas de token', () => {
  function fontesDeComponente(): { arquivo: string; conteudo: string }[] {
    return readdirSync(DIR_COMPONENTES)
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .map((f) => ({ arquivo: f, conteudo: readFileSync(join(DIR_COMPONENTES, f), 'utf8') }))
  }

  it('nenhum componente importa a paleta primitiva', () => {
    const infratores = fontesDeComponente()
      .filter(({ conteudo }) => /from\s+['"][^'"]*tokens\/primitivo['"]/.test(conteudo))
      .map((f) => f.arquivo)

    expect(infratores).toEqual([])
  })

  it('nenhum componente escreve hex direto', () => {
    const infratores = fontesDeComponente()
      .filter(({ conteudo }) => HEX.test(conteudo))
      .map((f) => f.arquivo)

    expect(infratores).toEqual([])
  })

  it('o hex vive SÓ no primitivo — semântico e componente só referenciam', () => {
    const semanticoFonte = readFileSync('src/design-system/tokens/semantico.ts', 'utf8')
    const componenteFonte = readFileSync('src/design-system/tokens/componente.ts', 'utf8')

    expect(HEX.test(semanticoFonte)).toBe(false)
    expect(HEX.test(componenteFonte)).toBe(false)
    expect(HEX.test(readFileSync('src/design-system/tokens/primitivo.ts', 'utf8'))).toBe(true)
  })

  it('o índice público não reexporta primitivo', () => {
    const indice = readFileSync('src/design-system/tokens/index.ts', 'utf8')
    expect(/export .*primitivo/.test(indice)).toBe(false)
  })

  it('todo token semântico aponta para um valor da paleta primitiva', () => {
    // `string | number`: os pontos de quebra da moldura (identidade 05) são
    // números — media query não lê variável CSS, então o número precisa existir
    // no TypeScript para o teste do CSS da Moldura comparar os dois.
    const paleta = new Set<string | number>(Object.values(primitivo))
    for (const [nome, valor] of Object.entries(semantico)) {
      expect(paleta.has(valor), `semantico.${nome} = ${valor} não está no primitivo`).toBe(true)
    }
  })

  it('tokens.css está em sincronia com o TypeScript', () => {
    const emDisco = readFileSync('src/design-system/tokens/tokens.css', 'utf8')
    expect(emDisco).toBe(gerarCss())
  })
})

// ===========================================================================
// DOIS CANAIS, E SÓ DOIS
// ===========================================================================

describe('dois canais visuais, e só dois', () => {
  it('o nível do jogador tem 4 cores e nenhuma se repete', () => {
    const cores = Object.values(NIVEL_JOGADOR).map((n) => n.cor)
    expect(cores).toHaveLength(4)
    expect(new Set(cores).size).toBe(4)
  })

  it('o nível do apito tem 3 cores + turbo, sem repetição', () => {
    const cores = [...Object.values(APITO).map((a) => a.cor), TURBO.cor]
    expect(new Set(cores).size).toBe(4)
  })

  it('os dois canais não compartilham nenhuma cor', () => {
    const jogador = new Set(Object.values(NIVEL_JOGADOR).map((n) => n.cor))
    const apito = [...Object.values(APITO).map((a) => a.cor), TURBO.cor]

    expect(apito.filter((c) => jogador.has(c))).toEqual([])
  })

  it('a rampa de confiança é a ÚNICA outra escala: nada de "escala*" avulsa', () => {
    // A escala de 5 faixas MULTI-MATIZ original (a que colidia com o apito)
    // continua banida. A identidade 02 reintroduz confiança como cor, mas só
    // como `confianca*` — uma rampa de UM matiz, verificada contra colisão e
    // contraste no describe 'rampa de confiança (identidade 02)' abaixo. Se
    // aparecer `escala*`/`faixa*` fora de `confianca*`, é a escala antiga
    // voltando pela porta dos fundos.
    const suspeitos = Object.keys(semantico).filter(
      (k) => /escala|faixa/i.test(k) && !/^confianca/i.test(k),
    )
    expect(suspeitos).toEqual([])
  })
})

// ===========================================================================
// CONTRASTE AA — todas as combinações da galeria
// ===========================================================================

describe('contraste WCAG AA', () => {
  const superficie = semantico.superficie
  const aneis = [
    ...Object.entries(APITO).map(([k, v]) => [`apito ${k}`, v.cor] as const),
    ['turbo', TURBO.cor] as const,
    ['modo fire', MODO_FIRE.cor] as const,
  ]

  it('o número dentro de cada anel passa em AA para texto (4.5)', () => {
    for (const [nome, cor] of aneis) {
      const razao = razaoDeContraste(cor, componente.anelTexto)
      expect(razao, `${nome}: ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(AA.texto)
    }
  })

  it('cada anel se destaca da superfície do card (3.0, gráfico)', () => {
    for (const [nome, cor] of aneis) {
      const razao = razaoDeContraste(cor, superficie)
      expect(razao, `${nome}: ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(AA.grafico)
    }
  })

  it('cada borda metálica se destaca da superfície (3.0, gráfico)', () => {
    for (const [nivel, { cor }] of Object.entries(NIVEL_JOGADOR)) {
      const razao = razaoDeContraste(cor, superficie)
      expect(razao, `${nivel}: ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(AA.grafico)
    }
  })

  it('o rótulo textual do nível, que usa a cor metálica, passa em AA para texto', () => {
    // A redundância do canal 1 é texto colorido — se ela não for legível,
    // a redundância não existe.
    for (const [nivel, { cor }] of Object.entries(NIVEL_JOGADOR)) {
      const razao = razaoDeContraste(cor, superficie)
      expect(razao, `${nivel}: ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(AA.texto)
    }
  })

  it('texto primário e de apoio passam em AA sobre a superfície', () => {
    expect(razaoDeContraste(semantico.textoPrimario, superficie)).toBeGreaterThanOrEqual(AA.texto)
    expect(razaoDeContraste(semantico.textoSecundario, superficie)).toBeGreaterThanOrEqual(
      AA.texto,
    )
  })

  it('texto BRANCO dentro do anel reprovaria — é o erro que o doc alerta', () => {
    // Registra o motivo de anelTexto ser escuro: sobre amarelo, branco dá ~1.5.
    expect(razaoDeContraste(APITO[1].cor, '#FFFFFF')).toBeLessThan(AA.texto)
  })
})

// ===========================================================================
// ESCRITA
// ===========================================================================

describe('escrita da interface', () => {
  /**
   * Remove comentários antes de checar.
   *
   * A regra proíbe a palavra no TEXTO DA INTERFACE. Em comentário ela é
   * desejável: é lá que fica o aviso para quem for mexer no arquivo depois.
   */
  function semComentarios(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }

  const fontes = readdirSync(DIR_COMPONENTES)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => semComentarios(readFileSync(join(DIR_COMPONENTES, f), 'utf8')))
    .join('\n')

  it('nenhum componente escreve "probabilidade" fora de comentário', () => {
    expect(/probabilidade/i.test(fontes)).toBe(false)
  })

  it('a palavra usada é "confiança"', () => {
    // A palavra saiu do design system na identidade 06 junto com o número: o
    // card não desenha mais a nota, e quem a desenha é a tela de ANÁLISE do
    // apito. O guarda continua existindo — só mudou de arquivo, porque é lá
    // que a interface nomeia o conceito hoje.
    // Lá a palavra aparece nas duas formas, e as duas estão certas: a nota é
    // "confiança", e a tela DIZ ao assinante que ela "não é uma probabilidade".
    // Por isso aqui só se cobra a presença da palavra certa — a proibição da
    // errada é do teste acima, que varre o design system.
    const analise = readFileSync('src/app/(app)/apito/[jogadorId]/page.tsx', 'utf8')
    expect(/confian[çc]a/i.test(semComentarios(analise))).toBe(true)
  })

  it('o aviso permanece nos comentários do código', () => {
    const comComentarios = readdirSync(DIR_COMPONENTES)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => readFileSync(join(DIR_COMPONENTES, f), 'utf8'))
      .join('\n')

    expect(/probabilidade/i.test(comComentarios)).toBe(true)
  })
})

// ===========================================================================
// RAMPA DE CONFIANÇA — IDENTIDADE 02
// ===========================================================================

describe('rampa de confiança (identidade 02)', () => {
  const degraus = [
    semantico.confiancaGrau1,
    semantico.confiancaGrau2,
    semantico.confiancaGrau3,
    semantico.confiancaGrau4,
    semantico.confiancaGrau5,
  ]

  it('nenhum degrau colide com as cores do apito ou as metálicas', () => {
    const categoricas = [
      semantico.apitoNivel1, semantico.apitoNivel2, semantico.apitoNivel3, semantico.apitoTurbo,
      semantico.nivelMvp, semantico.nivelAllStar, semantico.nivelSuporte, semantico.nivelRandola,
    ]
    for (const d of degraus) expect(categoricas).not.toContain(d)
    expect(new Set(degraus).size).toBe(5)
  })

  it('todo degrau é legível como texto sobre a superfície do card (AA)', () => {
    for (const d of degraus) {
      expect(razaoDeContraste(d, semantico.superficie)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('o acento é PREENCHIMENTO: o texto branco em cima dele passa em AA', () => {
    // Identidade 05: o acento deixou de ser legível COMO TINTA de propósito —
    // o azul do manual tem o matiz do azul do turbo, e um azul claro o bastante
    // para ser texto seria o 🔵 do CJ. O que se cobra dele agora é o contrário:
    // ser escuro o bastante para o branco em cima passar. Ver o describe
    // 'identidade 05'.
    expect(
      razaoDeContraste(semantico.textoSobreAcento, semantico.acento),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('CONFIANCA_GRAU espelha exatamente os 5 degraus semânticos', () => {
    expect([
      CONFIANCA_GRAU[1],
      CONFIANCA_GRAU[2],
      CONFIANCA_GRAU[3],
      CONFIANCA_GRAU[4],
      CONFIANCA_GRAU[5],
    ]).toEqual(degraus)
  })
})

// ===========================================================================
// IDENTIDADE 03 · BROADCAST
// ===========================================================================

describe('identidade 03 — broadcast', () => {
  it('temperatura por contexto: frio e quente não compartilham gradiente, e o quente é o único com o véu vermelho', () => {
    expect(componente.contextoFrio.cardGradiente).not.toBe(componente.contextoQuente.cardGradiente)
    expect(componente.contextoQuente.destaque).toBe(semantico.acento)
    // O universo frio nunca usa o acento quente em nenhuma das suas partes.
    expect(JSON.stringify(componente.contextoFrio)).not.toContain(semantico.acento)
  })

  it('o brilho do turbo usa a cor do turbo, que segue sendo a categórica do apito', () => {
    expect(componente.turboBrilho).toContain('rgba(77,163,255')
    expect(semantico.apitoTurbo).toBe(primitivo.azul400)
  })

  it('o selo VIVO tem cor própria, distinta do alerta', () => {
    expect(semantico.vivoSelo).not.toBe(semantico.alerta)
  })

  it('barrinhas usam par próprio, fora das cores categóricas dos dois canais', () => {
    const categoricas = [
      semantico.apitoNivel1, semantico.apitoNivel2, semantico.apitoNivel3, semantico.apitoTurbo,
      semantico.nivelMvp, semantico.nivelAllStar, semantico.nivelSuporte, semantico.nivelRandola,
    ]
    expect(categoricas).not.toContain(semantico.barrinhaBateu)
    expect(categoricas).not.toContain(semantico.barrinhaFalhou)
    // e são legíveis com o valor escrito dentro (texto escuro no verde, claro no vermelho)
    expect(razaoDeContraste(semantico.textoSobreCor, semantico.barrinhaBateu)).toBeGreaterThanOrEqual(4.5)
    expect(razaoDeContraste(primitivo.branco, semantico.barrinhaFalhou)).toBeGreaterThanOrEqual(4.5)
  })

  it('o fundo de tela é gradiente e o card tem borda lateral', () => {
    // A LARGURA saiu daqui na identidade 06 (3 px → 6 px, e de "cor do grau de
    // confiança" para "cor do metálico do nível"): ela é afirmada no describe
    // daquela identidade, junto do motivo. Aqui fica só o que a 03 decidiu —
    // que a borda lateral existe e que o fundo da tela é gradiente.
    expect(componente.fundoTela).toContain('linear-gradient')
    expect(componente.cardBordaLateral).toMatch(/^\d+px$/)
  })
})

describe('errata pós-merge — o CSS gerado é só de strings', () => {
  it('nenhum token composto (objeto) vaza como [object Object]', () => {
    expect(gerarCss()).not.toContain('[object Object]')
  })
})

// ===========================================================================
// IDENTIDADE 04 — varredura e análise (acabamento)
// ===========================================================================

describe('identidade 04 — acabamento', () => {
  it('texto em cinco opacidades, todas derivadas da mesma tinta clara', () => {
    // É assim que o Sofascore obtém densidade sem borda: número em texto100,
    // rótulo em texto55, apoio em texto40 — uma cor, várias intensidades.
    expect(semantico.texto100).toBe(primitivo.branco)
    for (const [nome, esperado] of [
      ['texto70', '.7'],
      ['texto55', '.55'],
      ['texto40', '.55'], // piso de contraste AA para o nome legado
    ] as const) {
      const valor = semantico[nome]
      expect(valor, nome).toMatch(/^rgba\(255,255,255,\.\d+\)$/)
      expect(valor.endsWith(`${esperado})`), `${nome} termina em ${esperado}`).toBe(true)
    }
  })

  it('ao vivo tem forma sólida e tinta próprias, legíveis DENTRO do universo quente', () => {
    // O Fire Live inteiro é quente; o ao vivo precisa se destacar dentro do
    // quente, não do frio. Sólido para o ponto e o texto, tinta para o fundo
    // do badge de status e borda para o contorno.
    expect(semantico.aoVivoSolido).toBe(semantico.aoVivo)
    expect(semantico.aoVivoTinta).toMatch(/^rgba\(255,92,112,\.\d+\)$/)
    expect(semantico.aoVivoBorda).toMatch(/^rgba\(255,92,112,\.\d+\)$/)
    expect(razaoDeContraste(semantico.aoVivoSolido, semantico.superficieQuente1)).toBeGreaterThanOrEqual(AA.grafico)
    // nunca colide com o amarelo do nível 1 nem com o laranja do nível 2
    expect([semantico.apitoNivel1, semantico.apitoNivel2, semantico.apitoNivel3]).not.toContain(semantico.aoVivoSolido)
  })

  it('durações curtas: estado em ≤ 200 ms, entrada de card novo em 400 ms', () => {
    expect(semantico.duracaoEstado).toBe('200ms')
    expect(semantico.duracaoEntrada).toBe('400ms')
  })

  it('o turbo ganha par claro/escuro sem deixar de ser o azul categórico', () => {
    expect(semantico.apitoTurbo).toBe(primitivo.azul400)
    // `toBeDefined` primeiro: sem isto, um token inexistente passaria por
    // "diferente do categórico" de graça (foi o que aconteceu no vermelho).
    expect(semantico.turboClaro).toMatch(HEX)
    expect(semantico.turboEscuro).toMatch(HEX)
    expect(semantico.turboClaro).not.toBe(semantico.apitoTurbo)
    expect(semantico.turboEscuro).not.toBe(semantico.apitoTurbo)
    // o par não invade nenhuma cor categórica dos dois canais
    const categoricas = [
      semantico.apitoNivel1, semantico.apitoNivel2, semantico.apitoNivel3, semantico.apitoTurbo,
      semantico.nivelMvp, semantico.nivelAllStar, semantico.nivelSuporte, semantico.nivelRandola,
    ]
    expect(categoricas).not.toContain(semantico.turboClaro)
    expect(categoricas).not.toContain(semantico.turboEscuro)
  })

  it('componentes novos: selo de contexto, cabeçalho de jogo e status do ciclo', () => {
    expect(componente.seloContexto.preLive.fundo).toBe(semantico.acento)
    expect(componente.seloContexto.preLive.texto).toBe(semantico.textoSobreAcento)
    expect(componente.seloContexto.aoVivo.fundo).toBe(semantico.vivoSelo)
    expect(componente.seloContexto.aoVivo.texto).toBe(semantico.textoSobreAcento)
    expect(componente.cabecalhoJogo.fundoFrio).toBe(componente.contextoFrio.cardGradiente)
    expect(componente.cabecalhoJogo.fundoQuente).toBe(componente.contextoQuente.cardGradiente)
    // largura FIXA: o badge PRÉ · 1º Q · FIM 1º Q · FT nunca faz o card pular
    // a cada refresh. 60 desde a identidade 05: o texto subiu para os 12 px do
    // piso do manual e "FIM 1º Q" não cabia mais em 52.
    expect(componente.statusCiclo.largura).toBe('60px')
  })

  it('os tokens novos chegam ao CSS gerado', () => {
    const css = gerarCss()
    for (const nome of ['--texto70', '--texto55', '--texto40', '--ao-vivo-tinta', '--duracao-estado', '--turbo-claro']) {
      expect(css, nome).toContain(nome)
    }
  })
})

// ===========================================================================
// IDENTIDADE 05 — MANUAL DA MARCA
// ===========================================================================

/** Tira comentário: a regra vale para o CÓDIGO, não para o aviso sobre ele. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Toda fonte de UI sob as raízes dadas — tsx, ts e css, sem os testes. */
function arquivosDeUi(raizes: readonly string[]): { arquivo: string; conteudo: string }[] {
  const saida: { arquivo: string; conteudo: string }[] = []
  const visitar = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name !== '__tests__' && entrada.name !== 'node_modules') visitar(caminho)
      } else if (/\.(tsx?|css)$/.test(entrada.name)) {
        saida.push({ arquivo: caminho, conteudo: readFileSync(caminho, 'utf8') })
      }
    }
  }
  for (const raiz of raizes) visitar(raiz)
  return saida
}

describe('identidade 05 — manual da marca', () => {
  it('as cores do manual estão no primitivo, literalmente', () => {
    expect(primitivo.azulNip).toBe('#0057B8')
    expect(primitivo.vermelhoNip).toBe('#C8102E')
    expect(primitivo.navy).toBe('#001D3D')
    expect(primitivo.cinzaNip).toBe('#A6ABB4')
    expect([primitivo.fundoNip, primitivo.cartaoNip, primitivo.campoNip, primitivo.tinta500]).toEqual([
      '#071426',
      '#101C30',
      '#18243A',
      '#2A3852',
    ])
    // A divisória do manual É a tinta500 que o projeto já usava.
    expect(semantico.divisor).toBe('#2A3852')
  })

  it('o manual manda nas superfícies e no texto de apoio', () => {
    expect(semantico.fundo).toBe(primitivo.fundoNip)
    expect(semantico.superficie).toBe(primitivo.cartaoNip)
    expect(semantico.superficieElevada).toBe(primitivo.campoNip)
    expect(semantico.textoSecundario).toBe(primitivo.cinzaNip)
    expect(semantico.cromo).toBe(primitivo.navy)
  })

  it('o texto sobre cor virou DOIS tokens: escuro no anel do apito, branco sobre azul e vermelho', () => {
    // O anel continua exigindo texto ESCURO (ver 'texto BRANCO dentro do anel
    // reprovaria'); quem senta sobre o azul ou o vermelho do manual precisa do
    // branco. Um token só não serviria aos dois.
    expect(componente.anelTexto).toBe(semantico.textoSobreCor)
    expect(semantico.textoSobreAcento).toBe(primitivo.branco)
    for (const fundo of [semantico.acento, semantico.acentoClaro, semantico.vivoSelo]) {
      expect(razaoDeContraste(semantico.textoSobreAcento, fundo)).toBeGreaterThanOrEqual(AA.texto)
    }
  })

  it('o único azul CLARO do sistema é o turbo: o de interface é escuro o bastante para ser preenchimento', () => {
    // O azul do manual tem o matiz do azul do turbo (212° contra 211°). Se um
    // dia alguém o clarear para usá-lo como texto, ele vira o 🔵 do CJ na tela.
    // O que impede isso é ele ser escuro: branco em cima passa, texto dele
    // sobre o cartão não passaria.
    expect(razaoDeContraste(semantico.acento, primitivo.branco)).toBeGreaterThanOrEqual(AA.texto)
    expect(razaoDeContraste(semantico.acentoClaro, primitivo.branco)).toBeGreaterThanOrEqual(AA.texto)
    expect(razaoDeContraste(semantico.acento, semantico.superficie)).toBeLessThan(AA.texto)
  })

  it('azul nunca é tinta: o acento só aparece em preenchimento, em toda a UI', () => {
    const ACENTO = /semantico\.acento(?:Claro)?\b|\bs\.acento(?:Claro)?\b|var\(--acento(?:-claro)?\)/g
    /** Onde o acento PODE estar: preenchimento, gradiente, brilho. Nunca tinta. */
    const PREENCHIMENTO =
      /^(background|backgroundColor|background-color|backgroundImage|background-image|fill|.*[Ff]undo|.*[Gg]radiente|.*[Bb]rilho|.*[Pp]reenchido)$/

    /**
     * A propriedade que recebe o valor, lida para trás. O `(?<![.\w])` joga
     * fora `l.estado ===` e `semantico.aoVivo :` — condição e ramo de ternário
     * ficam ENTRE a propriedade e o acento, e sem ele um `background:` com
     * ternário dentro seria acusado de tinta. O `(?!=)` joga fora `===`.
     */
    const PROPRIEDADE = /(?<![.\w])([A-Za-z-]+)\s*[:=](?!=)/g

    const infratores: string[] = []
    for (const { arquivo, conteudo } of arquivosDeUi([
      'src/design-system/componentes',
      'src/components',
      'src/app',
    ])) {
      const fonte = semComentarios(conteudo)
      for (const achado of fonte.matchAll(ACENTO)) {
        const antes = fonte.slice(Math.max(0, achado.index - 220), achado.index)
        const alvo = [...antes.matchAll(PROPRIEDADE)].at(-1)?.[1] ?? '(nenhum)'
        if (!PREENCHIMENTO.test(alvo)) infratores.push(`${arquivo}: ${alvo} ← ${achado[0]}`)
      }
    }
    expect(infratores).toEqual([])
  })

  it('o vermelho é cheio no selo e claro na tinta', () => {
    expect(semantico.vivoSelo).toBe(primitivo.vermelhoNip)
    expect(semantico.aoVivo).toBe(primitivo.vermelhoNipClaro)
    expect(semantico.alerta).toBe(primitivo.vermelhoNipClaro)
    // O cheio não serve de texto no cartão; a tinta clara serve. É a divisão.
    expect(razaoDeContraste(semantico.vivoSelo, semantico.superficie)).toBeLessThan(AA.texto)
    expect(razaoDeContraste(semantico.aoVivo, semantico.superficie)).toBeGreaterThanOrEqual(AA.texto)
  })

  it('tipografia do manual: Bebas nos títulos e números, Montserrat no resto', () => {
    expect(semantico.fonteTitulo).toContain('--fonte-bebas')
    expect(semantico.fonteCorpo).toContain('--fonte-montserrat')
    // O manual PROÍBE a Bebas em formulário; o rótulo veste formulário.
    expect(semantico.fonteRotulo).toContain('--fonte-montserrat')
    // A Bebas foi medida (scripts/medir-digitos.mjs): dígitos de largura fixa,
    // então ela pode vestir número que muda a cada refresh sem o card pular.
    expect(semantico.fonteNumero).toContain('--fonte-bebas')
  })

  it('o botão primário do manual: chapado, 48 px, canto de 8, texto branco', () => {
    expect(componente.ctaFundo).toBe(semantico.acento)
    expect(componente.ctaFundoHover).toBe(semantico.acentoClaro)
    expect(componente.ctaTexto).toBe(semantico.textoSobreAcento)
    expect(componente.ctaAltura).toBe('48px')
    expect(componente.raioControle).toBe('8px')
    expect(componente.cardRaio).toBe('12px')
  })

  it('o foco é branco — o anel de foco nunca pode ser o azul que vira turbo', () => {
    expect(semantico.focoAnel).toBe(primitivo.branco)
    expect(componente.foco).toContain(semantico.focoAnel)
  })

  it('os pontos de quebra da moldura são tokens, não números soltos', () => {
    expect(semantico.larguraTopo).toBe(1024)
    expect(semantico.larguraLateral).toBe(1280)
  })
})

// ===========================================================================
// IDENTIDADE 06 — CORES VIVAS
// ===========================================================================

describe('identidade 06 — cores vivas', () => {
  /**
   * As CINCO superfícies onde uma cor de card pode pousar. Medir só contra
   * `superficie` (o que os testes de contraste acima fazem) não basta a partir
   * daqui: o metálico virou tipo grande dentro de um card cujo gradiente vai de
   * `campoFrio` a `cartaoFrio`, e no Fire Live de `campoQuente` a `cartaoQuente`.
   * O pior dos cinco é o número que precisa passar.
   */
  const SUPERFICIES = [
    semantico.superficie,
    semantico.superficieFria2,
    semantico.superficieFria1,
    semantico.superficieQuente1,
    semantico.superficieQuente2,
  ]
  const pior = (cor: string) => Math.min(...SUPERFICIES.map((s) => razaoDeContraste(cor, s)))

  /** Saturação HSL — "mais vivo" medido, não opinado. */
  const sat = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const l = (mx + mn) / 2
    // Arredondado: dois cromáticos de saturação 100% divergem na 16ª casa
    // decimal e reprovariam a comparação por um erro de ponto flutuante.
    return mx === mn ? 0 : Number((((mx - mn) / (1 - Math.abs(2 * l - 1))) * 100).toFixed(2))
  }

  it('os hexes novos estão no primitivo, literalmente', () => {
    expect(primitivo.ouro).toBe('#F2AE1C')
    expect(primitivo.prata).toBe('#A9B6C9')
    expect(primitivo.bronze).toBe('#F08040')
    expect(primitivo.ambar400).toBe('#FFDD00')
    expect(primitivo.laranja400).toBe('#FFA31F')
    expect(primitivo.verde400).toBe('#2BE884')
    expect(semantico.nivelRandola).toBe(primitivo.branco)
  })

  it('grafite não existe mais — o Randola virou branco', () => {
    expect('grafite' in primitivo).toBe(false)
  })

  it('as cinco cores que sobem ganham saturação E contraste', () => {
    // Prata e Randola são as DUAS exceções declaradas na spec §4: a prata desce
    // nos dois de propósito, para abrir distância do branco do Randola; e o
    // branco não tem saturação para comparar.
    const antes = {
      ouro: '#E0B24A',
      bronze: '#C8823C',
      ambar400: '#FFC93D',
      laranja400: '#FF9838',
      verde400: '#3DD37E',
    } as const
    for (const [chave, velho] of Object.entries(antes)) {
      const novo = primitivo[chave as keyof typeof antes]
      expect(sat(novo), `${chave} saturação`).toBeGreaterThanOrEqual(sat(velho))
      expect(pior(novo), `${chave} contraste`).toBeGreaterThanOrEqual(pior(velho))
    }
  })

  it('o rótulo do nível passa em AA para texto nas CINCO superfícies', () => {
    for (const [nivel, { cor }] of Object.entries(NIVEL_JOGADOR))
      expect(pior(cor), `${nivel}: ${pior(cor).toFixed(2)}`).toBeGreaterThanOrEqual(AA.texto)
  })

  it('a moldura do Randola é o branco a 55%, não o branco cheio', () => {
    // Branco puro é a maior luminância do sistema: uma moldura branca faria o
    // card do jogador MENOS importante gritar mais que o do MVP. O TEXTO do
    // nível continua branco cheio — é o que o feedback pediu.
    expect(NIVEL_JOGADOR.RANDOLA.cor).toBe('#FFFFFF')
    expect(NIVEL_JOGADOR.RANDOLA.borda).toBe(primitivo.brancoVeu55)
    expect(NIVEL_JOGADOR.MVP.borda).toBe(semantico.nivelMvp)
  })

  it('cada véu da moldura é o decimal exato do seu metálico', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')
    for (const [nivel, { cor, veu }] of Object.entries(NIVEL_JOGADOR)) {
      const base = nivel === 'RANDOLA' ? '#FFFFFF' : cor
      expect(veu, nivel).toBe(`rgba(${rgb(base)},.12)`)
    }
  })

  it('a moldura ficou mais larga e o anel do avatar mais grosso', () => {
    expect(componente.cardBordaLateral).toBe('6px')
    expect(componente.avatarAnelEspessura).toBe('3px')
  })
})
