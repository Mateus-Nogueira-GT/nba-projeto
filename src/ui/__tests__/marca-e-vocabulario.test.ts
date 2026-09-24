import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * FONTE DA MARCA E DO VOCABULÁRIO (spec I13 + Manual da Marca).
 *
 * Este teste é o sucessor do `design-system/__tests__/tokens.test.ts` (que
 * varria só o design-system antigo e `src/app`) e do caso "o número grande do
 * exemplo permanece legível" que a Tarefa 7 retirou do
 * `escrita-identidade-04.test.ts`. Ele lê o CÓDIGO, não o HTML: a marca tem
 * uma fonte só (`src/ui/tokens.css`), e uma cor escrita à mão numa tela é uma
 * cor que o tema não alcança.
 *
 * As regras:
 *  (a) nenhum `#rgb`/`#rrggbb`/`#rrggbbaa` fora de `src/ui/tokens.css`, em
 *      .ts/.tsx/.css de `src/ui`, `src/features` e `src/app` — inclusive
 *      estilo inline e atributo de SVG. Cor é `var(--…)`.
 *      `rgba(…)` só é aceito para VÉU DE BRANCO OU PRETO PURO
 *      (`rgba(255, 255, 255, a)` / `rgba(0, 0, 0, a)`): sombra, brilho e vidro
 *      não têm matiz para o tema trocar. Qualquer outro rgba é uma cor com
 *      matiz e vira token — `color-mix(in srgb, var(--token) N%, transparent)`
 *      dá o mesmo rgba sem repetir o número.
 *  (b) nenhum `font-size` abaixo de 12px (0.75rem/em) em CSS ou `fontSize`
 *      inline: o Manual não tem texto menor que isso.
 *  (c) a palavra "probabilidade" não aparece em texto de tela. A ÚNICA forma
 *      aceita é a negação que a metodologia exige — "não é probabilidade de
 *      acerto" (travada por `escrita-identidade-04.test.ts`). O % é score de
 *      confiança; "nota de confiança não é probabilidade" sem o "de acerto"
 *      também não passa, para a frase ser a mesma em toda tela.
 *  (d) contraste: a odd da linha de exemplo da metodologia é `--texto` sobre
 *      `--superficie`, e o par precisa de AA (4,5:1) em CADA tema, calculado
 *      dos hex de `tokens.css`. Os textos de apoio (`--texto-2`, `--texto-3`)
 *      sobre a superfície também.
 *
 * Duas frestas explícitas, ambas travadas por outro teste:
 *  - `features/shell/tema.ts` guarda `FUNDO_DO_TEMA_PADRAO` em hex porque o
 *    `themeColor` do layout raiz não lê CSS; `shell/__tests__/tema.test.ts`
 *    prova que é o mesmo `--fundo` do Marinho.
 */

const RAIZ = process.cwd()
const TOKENS = 'src/ui/tokens.css'
const PASTAS = ['src/ui', 'src/features', 'src/app']
const FRESTAS_DE_HEX: Record<string, string> = {
  'src/features/shell/tema.ts': 'FUNDO_DO_TEMA_PADRAO — themeColor não lê CSS; tema.test.ts trava o valor',
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
// rgb()/rgba() com números (vírgula ou espaço). `rgba(var(--x-rgb), a)` e
// `color-mix(…)` não casam: começam por `var(`.
const RGB = /rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/g
const PRETO_OU_BRANCO = (r: string, g: string, b: string) =>
  (r === '255' && g === '255' && b === '255') || (r === '0' && g === '0' && b === '0')

type Arquivo = { caminho: string; conteudo: string }

function listar(dir: string, extensoes: string[]): string[] {
  const saida: string[] = []
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name !== '__tests__') saida.push(...listar(caminho, extensoes))
    } else if (extensoes.some((e) => entrada.name.endsWith(e)) && caminho !== TOKENS) {
      saida.push(caminho)
    }
  }
  return saida
}

/**
 * Comentário não é tela: `/* … *\/` (CSS, TS e JSX) e `// …` de linha. As
 * quebras de linha ficam, para a falha apontar a linha certa do arquivo.
 */
function semComentarios(conteudo: string, caminho: string): string {
  let limpo = conteudo.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  if (!caminho.endsWith('.css')) limpo = limpo.replace(/(^|\s)\/\/[^\n]*/g, '$1')
  return limpo
}

function fontes(extensoes: string[]): Arquivo[] {
  return PASTAS.flatMap((pasta) => listar(pasta, extensoes)).map((caminho) => ({
    caminho,
    conteudo: semComentarios(readFileSync(join(RAIZ, caminho), 'utf8'), caminho),
  }))
}

/** `arquivo:linha: trecho`, para a falha dizer onde. */
function ocorrencias(arquivo: Arquivo, regex: RegExp, aceitar?: (m: RegExpExecArray) => boolean) {
  const achados: string[] = []
  const linhas = arquivo.conteudo.split('\n')
  linhas.forEach((linha, i) => {
    for (const m of linha.matchAll(new RegExp(regex.source, regex.flags))) {
      if (aceitar?.(m as RegExpExecArray)) continue
      achados.push(`${arquivo.caminho}:${i + 1}: ${linha.trim()}`)
      break
    }
  })
  return achados
}

// ===========================================================================
// (a) COR: só de token
// ===========================================================================

describe('marca · cor só por token', () => {
  const arquivos = fontes(['.ts', '.tsx', '.css'])

  it('nenhum hex fora de src/ui/tokens.css — estilo inline e SVG inclusos', () => {
    const infratores = arquivos
      .filter((a) => !(a.caminho in FRESTAS_DE_HEX))
      .flatMap((a) => ocorrencias(a, HEX))
    expect(infratores).toEqual([])
  })

  it('as frestas de hex existem só pelo motivo declarado', () => {
    for (const [caminho, motivo] of Object.entries(FRESTAS_DE_HEX)) {
      const fonte = readFileSync(join(RAIZ, caminho), 'utf8')
      expect(fonte, motivo).toContain(motivo.split(' — ')[0]!)
    }
  })

  it('rgba() com matiz é token; só véu de branco ou preto puro fica escrito', () => {
    const infratores = arquivos.flatMap((a) =>
      ocorrencias(a, RGB, (m) => PRETO_OU_BRANCO(m[1]!, m[2]!, m[3]!)),
    )
    expect(infratores).toEqual([])
  })

  it('tokens.css: o hex vive lá — e nenhum token é declarado duas vezes no mesmo bloco', () => {
    const css = readFileSync(join(RAIZ, TOKENS), 'utf8')
    expect(css).toMatch(HEX)
    for (const bloco of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const seletor = bloco[1]!.trim().split('\n').pop()!.trim()
      const nomes = [...bloco[2]!.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!)
      const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i)
      expect(repetidos, `repetido em "${seletor}"`).toEqual([])
    }
  })
})

// ===========================================================================
// (b) TAMANHO: nada abaixo de 12px
// ===========================================================================

describe('marca · nenhum texto abaixo de 12px', () => {
  const MINIMO_PX = 12
  const MINIMO_REM = 0.75
  const abaixo = (valor: string) =>
    [...valor.matchAll(/([\d.]+)(px|rem|em)\b/g)].some(([, n, unidade]) =>
      unidade === 'px' ? Number(n) < MINIMO_PX : Number(n) < MINIMO_REM,
    )

  it('font-size em CSS (inclusive dentro de clamp/calc)', () => {
    const infratores = fontes(['.css']).flatMap((a) =>
      ocorrencias(a, /font-size\s*:\s*([^;}]+)/g, (m) => !abaixo(m[1]!)),
    )
    expect(infratores).toEqual([])
  })

  it('fontSize inline em TSX', () => {
    const infratores = fontes(['.tsx']).flatMap((a) =>
      ocorrencias(a, /fontSize\s*:\s*(['"]?)([\d.]+(?:px|rem|em)?)\1/g, (m) => {
        const valor = m[2]!
        return /[a-z]/.test(valor) ? !abaixo(valor) : Number(valor) >= MINIMO_PX
      }),
    )
    expect(infratores).toEqual([])
  })
})

// ===========================================================================
// (c) VOCABULÁRIO: "probabilidade" só na negação da metodologia
// ===========================================================================

describe('vocabulário · "probabilidade" não aparece em tela', () => {
  const FORMA_ACEITA = /n[ãa]o é probabilidade de acerto/gi

  it('só a frase "não é probabilidade de acerto", e nada mais', () => {
    const infratores = fontes(['.ts', '.tsx']).flatMap((a) => {
      // JSX quebra frase entre linhas; o texto que a tela mostra é sem quebra.
      const texto = a.conteudo.replace(/\s+/g, ' ').replace(FORMA_ACEITA, '')
      const sobra = texto.match(/.{0,40}probabil.{0,40}/gi) ?? []
      return sobra.map((trecho) => `${a.caminho}: …${trecho.trim()}…`)
    })
    expect(infratores).toEqual([])
  })
})

// ===========================================================================
// (d) CONTRASTE: calculado dos tokens, tema a tema
// ===========================================================================

type Rgb = [number, number, number]
type Paleta = Record<string, string>

/** Os blocos de `tokens.css`: `:root` (base) e cada `:root[data-tema='…']`. */
function paletasPorTema(): Record<string, Paleta> {
  const css = readFileSync(join(RAIZ, TOKENS), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const blocos: Record<string, Paleta> = {}
  for (const bloco of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const seletor = bloco[1]!.trim()
    if (!seletor.startsWith(':root')) continue
    const tema = seletor.match(/data-tema='([a-z]+)'/)?.[1] ?? 'base'
    blocos[tema] ??= {}
    for (const decl of bloco[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      blocos[tema]![decl[1]!] = decl[2]!.trim()
    }
  }
  const base = blocos.base!
  const temas: Record<string, Paleta> = { base }
  for (const [tema, sobrescrita] of Object.entries(blocos)) {
    if (tema !== 'base') temas[tema] = { ...base, ...sobrescrita }
  }
  return temas
}

function resolver(paleta: Paleta, valor: string): string {
  let atual = valor
  for (let i = 0; i < 10; i++) {
    const ref = atual.match(/^var\((--[a-z0-9-]+)\)$/)
    if (!ref) return atual
    atual = paleta[ref[1]!] ?? ''
  }
  throw new Error(`referência circular a partir de ${valor}`)
}

function lerCor(valor: string): { rgb: Rgb; alpha: number } {
  const hex = valor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!
    return {
      rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)],
      alpha: 1,
    }
  }
  const rgba = valor.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }
  throw new Error(`cor sem leitura conhecida: ${valor}`)
}

/** A transparência faz parte da cor lida: compõe sobre o fundo antes de medir. */
function sobre(cor: { rgb: Rgb; alpha: number }, fundo: Rgb): Rgb {
  return cor.rgb.map((c, i) => c * cor.alpha + fundo[i]! * (1 - cor.alpha)) as Rgb
}

function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste WCAG 2.1 de `texto` sobre `fundo`, ambos nomes de token. */
function contraste(paleta: Paleta, texto: string, fundo: string): number {
  const f = lerCor(resolver(paleta, paleta[fundo]!))
  expect(f.alpha, `${fundo} precisa ser opaco para servir de fundo`).toBe(1)
  const t = sobre(lerCor(resolver(paleta, paleta[texto]!)), f.rgb)
  const [claro, escuro] = [luminancia(t), luminancia(f.rgb)].sort((a, b) => b - a) as [number, number]
  return (claro + 0.05) / (escuro + 0.05)
}

describe('contraste · calculado de tokens.css, tema a tema', () => {
  const AA = 4.5
  const temas = paletasPorTema()

  it('há os três temas e a base', () => {
    expect(Object.keys(temas).sort()).toEqual(['aco', 'base', 'claro', 'marinho'])
  })

  it('a odd do exemplo da metodologia é --texto sobre --superficie (o par medido abaixo)', () => {
    // Se a linha de exemplo mudar de fundo ou a odd ganhar cor própria, o par
    // deste teste deixa de ser o da tela — este caso avisa.
    const css = readFileSync(join(RAIZ, 'src/features/metodologia/Metodologia.module.css'), 'utf8')
    const linha = css.match(/\.linhaExemplo\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(linha).toContain('background: var(--superficie)')
    expect(linha).not.toMatch(/(^|\s)color:/)
    // A odd sai SÓ com o valor, como a `PilulaOdd` da Lista e o v2 ("1,85",
    // nunca "Odd 1,85"); o rótulo vai para o `title` e o leitor de tela.
    const tsx = readFileSync(join(RAIZ, 'src/features/metodologia/Conteudo.tsx'), 'utf8')
    expect(tsx).toMatch(/<span className="num"[^>]*>\s*\{oddExemplo\.valor\}/)
    expect(tsx).not.toMatch(/\{oddExemplo\.rotulo\}\s*\{oddExemplo\.valor\}/)
  })

  it.each(Object.keys(temas))('%s: --texto (a odd) passa AA sobre --superficie', (tema) => {
    const razao = contraste(temas[tema]!, '--texto', '--superficie')
    expect(razao, `${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
  })

  it.each(Object.keys(temas))('%s: --texto-2 e --texto-3 passam AA sobre --superficie', (tema) => {
    for (const texto of ['--texto-2', '--texto-3']) {
      const razao = contraste(temas[tema]!, texto, '--superficie')
      expect(razao, `${texto} ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
    }
  })

  it.each(Object.keys(temas))('%s: dois canais visuais, e só dois — jogador e apito não dividem cor', (tema) => {
    // Herdado do `tokens.test.ts` do design-system antigo (Tarefa 12 do front
    // v2), agora lido do CSS: a MOLDURA diz o nível do JOGADOR (4 cores) e o
    // anel diz o nível do APITO (3 + turbo). Se uma cor servisse aos dois, um
    // card diria duas coisas do vocabulário homologado com uma tinta só — e o
    // modo fire, que aparece ao lado do anel, também não pode vestir um nível.
    const paleta = temas[tema]!
    const cor = (token: string) => resolver(paleta, paleta[token] ?? '').toLowerCase()
    const jogador = ['--nivel-mvp', '--nivel-all-star', '--nivel-suporte', '--nivel-randola'].map(cor)
    const apito = ['--apito-1', '--apito-2', '--apito-3', '--apito-turbo'].map(cor)
    for (const c of [...jogador, ...apito]) expect(c, 'token ausente').toMatch(/^(#|rgba?\()/)
    expect(new Set(jogador).size).toBe(4)
    expect(new Set(apito).size).toBe(4)
    expect(apito.filter((c) => jogador.includes(c))).toEqual([])
    expect(apito).not.toContain(cor('--modo-fire'))
  })

  /**
   * OS DOIS CANAIS PASSAM EM AA — herdado do `tokens.test.ts` antigo (Tarefa
   * 12), medido nos pares que o v2 de fato pinta:
   *  - nível do JOGADOR como texto (`.randola`, a estrela em `--nivel-mvp`) e
   *    o rótulo dentro da placa metálica (`--selo-*-texto` sobre CADA parada do
   *    gradiente `--selo-*-fundo`): AA texto, 4,5;
   *  - nível do APITO como texto ("N3" do `IndicadorApito`, o raio do turbo):
   *    AA texto; e como borda/anel da linha (`corDoApito`): 3,0 gráfico;
   *  - modo fire como texto (`.modoFire`, `.fogo`): AA texto.
   * Sobre `--superficie` (a linha e o card) e `--campo` (controle e chip). Um
   * par que reprove NÃO muda de cor aqui: mudança visual é do parceiro — o
   * caso fica `it.fails`, nomeado, para o controlador decidir.
   */
  const NIVEIS = ['--nivel-mvp', '--nivel-all-star', '--nivel-suporte', '--nivel-randola']
  const APITOS = ['--apito-1', '--apito-2', '--apito-3', '--apito-turbo']
  const SUPERFICIES = ['--superficie', '--campo']
  const AA_GRAFICO = 3
  /** Pares que hoje reprovam (tema · texto · fundo → razão): decisão do parceiro. */
  const REPROVAM_HOJE = new Set<string>([
    // A placa do Suporte: o texto #2b1305 sobre a parada #b5561f do gradiente
    // dá 3,60:1 — em TODOS os temas (o gradiente é da base). As outras três
    // paradas passam; é o trecho escuro do bronze que reprova.
    'base · --selo-suporte-texto · --selo-suporte-fundo',
    'marinho · --selo-suporte-texto · --selo-suporte-fundo',
    'aco · --selo-suporte-texto · --selo-suporte-fundo',
    'claro · --selo-suporte-texto · --selo-suporte-fundo',
    // Aço: o modo fire sobre o campo fica a um fio do AA (4,48:1).
    'aco · --modo-fire · --campo',
    // Claro: as cores do apito e o modo fire foram escurecidas para o tema,
    // mas não o bastante para TEXTO sobre a superfície branca e o campo:
    // apito 1 (3,98 / 3,51), apito 2 (4,29 / 3,79), apito 3 (4,41 / 3,90),
    // modo fire (4,30 / 3,80); e o ouro do MVP sobre o campo (4,14). Como
    // BORDA (3,0) todos passam — o "N3" escrito é o que reprova.
    'claro · --apito-1 · --superficie',
    'claro · --apito-2 · --superficie',
    'claro · --apito-3 · --superficie',
    'claro · --modo-fire · --superficie',
    'claro · --nivel-mvp · --campo',
    'claro · --apito-1 · --campo',
    'claro · --apito-2 · --campo',
    'claro · --apito-3 · --campo',
    'claro · --modo-fire · --campo',
  ])
  const caso = (chave: string) => (REPROVAM_HOJE.has(chave) ? it.fails : it)

  for (const tema of Object.keys(temas)) {
    for (const fundo of SUPERFICIES) {
      for (const token of [...NIVEIS, ...APITOS, '--modo-fire']) {
        const chave = `${tema} · ${token} · ${fundo}`
        caso(chave)(`${chave}: passa em AA como texto (4,5)`, () => {
          const razao = contraste(temas[tema]!, token, fundo)
          expect(razao, `${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        })
      }
      for (const token of APITOS) {
        const chave = `${tema} · ${token} · ${fundo} (borda)`
        caso(chave)(`${chave}: a borda/anel do apito se destaca (3,0 gráfico)`, () => {
          const razao = contraste(temas[tema]!, token, fundo)
          expect(razao, `${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_GRAFICO)
        })
      }
    }
    for (const nivel of ['mvp', 'all-star', 'suporte']) {
      const chave = `${tema} · --selo-${nivel}-texto · --selo-${nivel}-fundo`
      caso(chave)(`${chave}: o rótulo da placa metálica passa em AA em TODA parada do gradiente`, () => {
        const paleta = temas[tema]!
        const paradas = resolver(paleta, paleta[`--selo-${nivel}-fundo`] ?? '').match(/#[0-9a-f]{6}/gi) ?? []
        expect(paradas.length).toBeGreaterThanOrEqual(3)
        for (const parada of paradas) {
          const razao = contraste({ ...paleta, '--parada': parada }, `--selo-${nivel}-texto`, '--parada')
          expect(razao, `${parada}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        }
      })
    }
  }

  it('a amostra de cada tema no menu é o --fundo e o --acento daquele tema', () => {
    // O BotaoTema mostra os três temas de uma vez, então lê tokens nomeados
    // por tema; este caso impede que a amostra envelheça quando o tema mudar.
    for (const tema of ['marinho', 'aco', 'claro']) {
      const base = temas.base!
      expect(resolver(base, base[`--amostra-${tema}-fundo`] ?? '')).toBe(temas[tema]!['--fundo'])
      expect(resolver(base, base[`--amostra-${tema}-acento`] ?? '')).toBe(temas[tema]!['--acento'])
    }
  })
})
