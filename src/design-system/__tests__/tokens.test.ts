import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { primitivo } from '../tokens/primitivo'
import { semantico } from '../tokens/semantico'
import { componente } from '../tokens/componente'
import { APITO, MODO_FIRE, NIVEL_JOGADOR, TURBO, gerarCss } from '../tokens/css'
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

  it('não existe terceira escala de cor: a confiança não tem cor própria', () => {
    // Se um dia aparecer algo como `confianca*` ou `escala*` nos tokens
    // semânticos, a escala de 5 faixas voltou pela porta dos fundos.
    const suspeitos = Object.keys(semantico).filter((k) => /confianca|escala|faixa/i.test(k))
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
