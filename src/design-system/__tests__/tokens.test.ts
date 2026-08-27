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
    const paleta = new Set<string>(Object.values(primitivo))
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
    expect(/confian[çc]a/i.test(fontes)).toBe(true)
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

  it('o acento laranja é legível sobre superfície e o texto sobre o acento também', () => {
    expect(razaoDeContraste(semantico.acento, semantico.superficie)).toBeGreaterThanOrEqual(3)
    expect(razaoDeContraste(semantico.textoSobreCor, semantico.acento)).toBeGreaterThanOrEqual(4.5)
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
  it('temperatura por contexto: frio e quente não compartilham gradiente, e o quente é o único com o veu laranja', () => {
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

  it('o fundo de tela é gradiente e a borda lateral do card tem 3px', () => {
    expect(componente.fundoTela).toContain('linear-gradient')
    expect(componente.cardBordaLateral).toBe('3px')
  })
})

describe('errata pós-merge — o CSS gerado é só de strings', () => {
  it('nenhum token composto (objeto) vaza como [object Object]', () => {
    expect(gerarCss()).not.toContain('[object Object]')
  })
})

