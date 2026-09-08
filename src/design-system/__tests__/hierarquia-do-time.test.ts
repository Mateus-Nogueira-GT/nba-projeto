import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  HierarquiaDoTime,
  type HierarquiaDoTimeProps,
  type LinhaDaHierarquia,
} from '../componentes/HierarquiaDoTime'
import { semantico } from '../tokens/semantico'

const linha = (
  posicao: number,
  nome: string,
  nivel: LinhaDaHierarquia['nivel'],
  fora = false,
): LinhaDaHierarquia => ({ posicao, jogadorId: `jogador-${posicao}`, nome, nivel, fora })

const render = (props: HierarquiaDoTimeProps) =>
  renderToStaticMarkup(createElement(HierarquiaDoTime, props))

/** O HTML de cada `<li>`, na ordem em que sai. */
function itens(html: string): string[] {
  return html
    .split('<li')
    .slice(1)
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</li>')))
}

/** Texto visível de um pedaço de HTML. */
const texto = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('HierarquiaDoTime — o depth chart do CJ', () => {
  it('ordena pela posição do CJ, não pela ordem em que as linhas chegam', () => {
    const html = render({
      linhas: [
        linha(3, 'Terceiro', 'SUPORTE'),
        linha(1, 'Primeiro', 'MVP'),
        linha(2, 'Segundo', 'ALL_STAR'),
      ],
    })

    expect(itens(html).map(texto)).toEqual([
      expect.stringContaining('Primeiro'),
      expect.stringContaining('Segundo'),
      expect.stringContaining('Terceiro'),
    ])
  })

  it('o número da posição sai em Anton, com tabular-nums', () => {
    const html = render({ linhas: [linha(1, 'Primeiro', 'MVP')] })
    expect(html).toContain('var(--fonte-anton)')
    expect(html).toContain('tabular-nums')
  })

  it('a faixa metálica e o rótulo vêm do nível do jogador NAQUELE atributo', () => {
    const html = render({
      linhas: [
        linha(1, 'Primeiro', 'MVP'),
        linha(2, 'Segundo', 'ALL_STAR'),
        linha(3, 'Terceiro', 'SUPORTE'),
        linha(4, 'Quarto', 'RANDOLA'),
      ],
    })
    const linhas = itens(html)

    for (const [indice, [cor, rotulo]] of (
      [
        [semantico.nivelMvp, 'MVP'],
        [semantico.nivelAllStar, 'All Star'],
        [semantico.nivelSuporte, 'Suporte'],
        [semantico.nivelRandola, 'Randola'],
      ] as const
    ).entries()) {
      expect(linhas[indice]).toContain(cor)
      expect(texto(linhas[indice]!)).toContain(rotulo)
    }
  })
})

describe('HierarquiaDoTime — o desfalque em PREFIXO', () => {
  /** Nº 1 e nº 2 fora (o prefixo), nº 3 em quadra, nº 4 fora — o caso da OPD. */
  const comDesfalques: LinhaDaHierarquia[] = [
    linha(1, 'Primeiro', 'MVP', true),
    linha(2, 'Segundo', 'ALL_STAR', true),
    linha(3, 'Terceiro', 'SUPORTE'),
    linha(4, 'Quarto', 'RANDOLA', true),
  ]

  it('destaca só as posições iniciais consecutivas que estão fora', () => {
    const linhas = itens(render({ linhas: comDesfalques }))

    for (const prefixo of [linhas[0]!, linhas[1]!]) {
      expect(prefixo).toContain(semantico.aoVivoTinta)
      expect(prefixo).toContain(semantico.aoVivoBorda)
    }
    // Quem joga, e quem falta DEPOIS de alguém que joga, ficam fora do
    // destaque: é a OPD desenhada — se o nº 2 falta e o nº 1 joga, não há
    // apito, e a tela não pode sugerir que há.
    for (const semDestaque of [linhas[2]!, linhas[3]!]) {
      expect(semDestaque).not.toContain(semantico.aoVivoTinta)
      expect(semDestaque).not.toContain(semantico.aoVivoBorda)
    }
  })

  it('todo desfalque é NOMEADO "FORA", dentro ou fora do prefixo', () => {
    const linhas = itens(render({ linhas: comDesfalques }))

    expect(texto(linhas[0]!)).toContain('FORA')
    expect(texto(linhas[1]!)).toContain('FORA')
    expect(texto(linhas[2]!)).not.toContain('FORA')
    expect(texto(linhas[3]!)).toContain('FORA')
  })

  it('o desfalque começando no nº 2 não destaca nada: o prefixo é vazio', () => {
    const html = render({
      linhas: [linha(1, 'Primeiro', 'MVP'), linha(2, 'Segundo', 'ALL_STAR', true)],
    })

    expect(html).not.toContain(semantico.aoVivoTinta)
    expect(texto(html)).toContain('FORA')
  })

  it('sem desfalque nenhum, nenhuma linha em destaque e nenhum "FORA"', () => {
    const html = render({
      linhas: [linha(1, 'Primeiro', 'MVP'), linha(2, 'Segundo', 'ALL_STAR')],
    })

    expect(html).not.toContain(semantico.aoVivoTinta)
    expect(texto(html)).not.toContain('FORA')
  })

  it('a legenda escreve a regra do prefixo em uma linha, no vocabulário do CJ', () => {
    const visivel = texto(render({ linhas: comDesfalques }))

    expect(visivel).toContain('nº 2')
    expect(visivel).toContain('nº 1')
    expect(visivel).toContain('não há apito')
  })
})

describe('HierarquiaDoTime — semântica e vazio', () => {
  it('é uma lista, e cada linha se anuncia com posição, nome e o desfalque', () => {
    const html = render({
      linhas: [linha(1, 'Primeiro', 'MVP', true), linha(2, 'Segundo', 'ALL_STAR')],
    })

    expect(html).toContain('role="list"')
    expect((html.match(/role="listitem"/g) ?? []).length).toBe(2)

    const rotulos = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]!)
    const doPrimeiro = rotulos.find((r) => r.includes('Primeiro'))!
    expect(doPrimeiro).toContain('1')
    expect(doPrimeiro).toContain('fora')

    const doSegundo = rotulos.find((r) => r.includes('Segundo'))!
    expect(doSegundo).toContain('2')
    expect(doSegundo).not.toContain('fora')
  })

  it('cada nome leva ao perfil do jogador quando a tela oferece rota', () => {
    const html = render({
      linhas: [linha(1, 'Primeiro', 'MVP')],
      hrefDoJogador: (id) => `/estatisticas/jogador/${id}`,
    })
    expect(html).toContain('href="/estatisticas/jogador/jogador-1"')

    // Sem rota (a galeria do design system), nenhuma âncora quebrada.
    expect(render({ linhas: [linha(1, 'Primeiro', 'MVP')] })).not.toContain('<a ')
  })

  it('sem linha nenhuma diz o que falta, e não desenha lista vazia', () => {
    const html = render({ linhas: [], vazio: 'A lista do CJ não cobre este atributo.' })

    expect(texto(html)).toContain('A lista do CJ não cobre este atributo.')
    expect(html).not.toContain('role="listitem"')
  })
})
