import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * CORREÇÕES UX 19/09, §4.15 — estilo embutido não tem :hover. As cores dos
 * controles com estado moram em quatro classes globais; este teste garante
 * que elas existem, têm hover e foco, e leem só tokens.
 */
const css = readFileSync('src/app/globals.css', 'utf8')

const CLASSES = ['botao-primario', 'botao-secundario', 'pilula-nav', 'chip-filtro'] as const

describe('controles com estado (correções UX 19/09)', () => {
  it.each(CLASSES)('.%s tem hover e foco visível', (classe) => {
    expect(css).toMatch(new RegExp(`\\.${classe}(?:[^{]*)?:hover\\s*\\{`))
    expect(css).toMatch(
      new RegExp(`\\.${classe}:focus-visible\\s*\\{[^}]*outline:\\s*var\\(--foco\\)`),
    )
  })

  it('o hover vive atrás de (hover: hover): tela de toque não fica com o estado preso', () => {
    const blocosHover = css.match(/@media \(hover: hover\)\s*\{[\s\S]*?\n\}/g) ?? []
    for (const classe of CLASSES) {
      expect(
        blocosHover.some((b) => b.includes(`.${classe}`)),
        classe,
      ).toBe(true)
    }
  })

  it('as classes só leem tokens — nenhum hex', () => {
    const inicio = css.indexOf('/* ===== CONTROLES COM ESTADO')
    expect(inicio).toBeGreaterThan(-1)
    const trecho = css.slice(inicio, css.indexOf('/* ===== FIM CONTROLES COM ESTADO'))
    expect(trecho).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('o primário é o botão do manual: fundo do CTA, hover mais claro, texto branco', () => {
    expect(css).toMatch(/\.botao-primario\s*\{[^}]*background:\s*var\(--cta-fundo\)/)
    expect(css).toMatch(/\.botao-primario:hover\s*\{[^}]*background:\s*var\(--cta-fundo-hover\)/)
    expect(css).toMatch(/\.botao-primario\s*\{[^}]*color:\s*var\(--cta-texto\)/)
  })

  it('pílula e chip ativos são PREENCHIDOS no acento; inativos, transparentes', () => {
    expect(css).toMatch(/\.pilula-nav-ativa\s*\{[^}]*background:\s*var\(--acento\)/)
    expect(css).toMatch(/\.chip-filtro-ativo\s*\{[^}]*background:\s*var\(--acento\)/)
    expect(css).toMatch(/\.pilula-nav\s*\{[^}]*background:\s*transparent/)
    expect(css).toMatch(/\.chip-filtro\s*\{[^}]*background:\s*transparent/)
  })
})

const CTAS = [
  'src/app/(app)/entrar/formulario.tsx',
  'src/app/(app)/cadastrar/formulario.tsx',
  'src/app/(app)/assinar/page.tsx',
  'src/app/(app)/apito/[jogadorId]/page.tsx',
  'src/app/(app)/conta/blocos.tsx',
  'src/components/planos/ConviteDoPlano.tsx',
]

describe('os CTAs usam a classe, não o token embutido', () => {
  it.each(CTAS)('%s não escreve background: componente.ctaFundo', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf8')
    expect(fonte).not.toContain('background: componente.ctaFundo')
    expect(fonte).toContain('botao-primario')
  })
})

describe('hover nos módulos', () => {
  it('chip-menu e estrela têm :hover atrás de (hover: hover)', () => {
    const folha = readFileSync('src/components/navegacao/FolhaDeFiltros.module.css', 'utf8')
    const estrela = readFileSync(
      'src/components/preferencias/BotaoAcompanharJogador.module.css',
      'utf8',
    )
    expect(folha).toMatch(/\.chipMenu > summary:hover/)
    expect(estrela).toMatch(/\.estrela:not\(:disabled\):hover/)
  })
})

const CLASSES_DE_ESTADO = [
  'card-alvo',
  'linha-alvo',
  'link-texto',
  'aba-atributo',
  'opcao-segmentada',
] as const

describe('estado no desktop (auditoria de UX para web, 19/09)', () => {
  it.each(CLASSES_DE_ESTADO)('.%s tem hover atrás de (hover: hover)', (classe) => {
    const blocos = css.match(/@media \(hover: hover\)\s*\{[\s\S]*?\n\}/g) ?? []
    expect(
      blocos.some((b) => b.includes(`.${classe}`)),
      classe,
    ).toBe(true)
  })

  it('as quatro NÃO escrevem cor de base — só estado', () => {
    // O card e a aba carregam a cor do NÍVEL embutida; uma classe que
    // escrevesse background/color/border fora de :hover apagaria o sinal.
    const inicio = css.indexOf('/* ===== ESTADO NO DESKTOP')
    expect(inicio).toBeGreaterThan(-1)
    const trecho = css.slice(inicio, css.indexOf('/* ===== FIM ESTADO NO DESKTOP'))
    for (const regra of trecho.matchAll(
      /\.(card-alvo|linha-alvo|link-texto|aba-atributo|opcao-segmentada)([^{]*)\{([^}]*)\}/g,
    )) {
      const seletor = regra[2] ?? ''
      const corpo = regra[3] ?? ''
      const eEstado = /:hover|:focus-visible|:focus-within/.test(seletor)
      if (!eEstado)
        expect(corpo, `${regra[1]}${seletor}`).not.toMatch(/background:|color:|border:/)
    }
  })

  it('o card e os links ganham foco visível pelo anel do app', () => {
    expect(css).toMatch(/\.card-alvo:focus-within > article,[\s\S]{0,60}outline:\s*var\(--foco\)/)
    expect(css).toMatch(/\.link-texto:focus-visible[\s\S]{0,140}outline:\s*var\(--foco\)/)
  })
})
