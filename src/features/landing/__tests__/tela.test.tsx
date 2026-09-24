import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { DadosDaLanding } from '../carregar'

/**
 * A LANDING SEM DADO NÃO INVENTA NÚMERO (fix round 1 da Tarefa 11).
 *
 * No lançamento (02/10, dentro do hiato) pode não haver noite conferida; e
 * um acerto pode não ter nota. O v2 escrevia "94%" fixo sob "Nota de
 * confiança" — número que não existe (regra 3 do CLAUDE.md; conteudo.ts:
 * "nada de taxa que não exista de verdade"). Aqui a tela é renderizada
 * direto, sem banco, com os dois casos.
 */
vi.mock('next/font/google', () => ({
  Montserrat: () => ({ variable: 'fonte-titulo', className: 'fonte-titulo' }),
  Roboto: () => ({ variable: 'fonte-corpo', className: 'fonte-corpo' }),
}))

const BASE: DadosDaLanding = {
  noite: null,
  totalDeApitos: 0,
  gestao: { banca: 1000, unidade: 10, limites: { stopWin: 100, stopLoss: 60, tetoPorEntrada: 30 } as never },
  precos: null,
}

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** O card "Nota de confiança" do Bento, do rótulo até a legenda. */
function cardDaNota(html: string): string {
  const inicio = html.indexOf('Nota de confiança</p>')
  expect(inicio, 'card da nota ausente').toBeGreaterThan(-1)
  return html.slice(inicio, html.indexOf('</article>', inicio))
}

async function renderizar(dados: DadosDaLanding): Promise<string> {
  const { TelaLanding } = await import('../TelaLanding')
  return renderToStaticMarkup(<TelaLanding dados={dados} />)
}

describe('TelaLanding sem dado', () => {
  it('sem noite conferida, a nota de confiança é "—" — nunca um 94% inventado', async () => {
    const html = await renderizar(BASE)
    const card = texto(cardDaNota(html))
    expect(card).not.toContain('94')
    expect(card).not.toMatch(/\d+%/)
    expect(card).toContain('—')
    // E o resto da tela também não traz o número do v2.
    expect(texto(html)).not.toMatch(/\b94%/)
    expect(texto(html)).toContain('0 apitos na rodada')
  })

  it('com acerto SEM nota, o card continua sem número', async () => {
    const html = await renderizar({
      ...BASE,
      noite: {
        dataReferencia: '2026-01-14',
        bateram: 1,
        conferidos: 1,
        taxa: 1,
        acertos: [
          {
            chave: 'Fulano de Tal|PONTOS|0',
            nome: 'Fulano de Tal',
            fotoUrl: null,
            timeSigla: 'CAS',
            atributo: 'PONTOS',
            nivelJogador: 'MVP',
            nivelApito: 2,
            turbo: false,
            linha: 20,
            fez: 27,
            confianca: null,
            grau: null,
            placar: { visitanteSigla: 'VIS', casaSigla: 'CAS', placarVisitante: 104, placarCasa: 110 },
          },
        ],
      },
    })
    const card = texto(cardDaNota(html))
    expect(card).not.toMatch(/\d+%/)
    expect(card).toContain('—')
    // O acerto em si aparece, com o que fez e o placar — dado de verdade.
    expect(texto(html)).toContain('Fulano de Tal')
    expect(texto(html)).toContain('fez 27')
    expect(texto(html)).toContain('VIS 104')
    // E o chip do notebook não escreve "Confiança" sem nota.
    expect(texto(html)).not.toMatch(/Confiança \d+%/)
  })
})

/**
 * A LANDING É IGUAL À DO V2 NOS TRÊS TEMAS.
 *
 * Ela tem fundo escuro fixo (`--l-fundo`), não troca de tema. A faixa corrida
 * do herói pintava cada ícone com um token do APP (`--apito-turbo`,
 * `--ao-vivo`…), que o Claro escurece — ícone escuro sobre fundo escuro. As
 * cores são as que o v2 escrevia em hex na `conteudo.ts`, agora como tokens
 * FIXOS do bloco LANDING de `tokens.css` (a marca tem uma fonte só).
 */
describe('a faixa do herói e o card do Fire Live, como no v2', () => {
  const TOKENS = readFileSync('src/ui/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  /** Os hex de `referencias/nip-front-v2/src/features/landing/conteudo.ts`, na ordem da faixa. */
  const CORES_DO_V2 = ['#4da3ff', '#ff5c70', '#5ce0ce', '#2be884', '#f2ae1c', '#a9b6c9', '#8cc4ff', '#ffa31f']

  it('cada ícone lê um token da landing (--l-*), com o hex do v2, que nenhum tema sobrescreve', async () => {
    const { FAIXA } = await import('../conteudo')
    expect(FAIXA).toHaveLength(CORES_DO_V2.length)
    // O bloco LANDING é o `:root` que declara `--l-fundo`.
    const landing = TOKENS.match(/:root\s*\{([^}]*--l-fundo:[^}]*)\}/)?.[1] ?? ''
    FAIXA.forEach((item, i) => {
      const nome = item.cor.match(/^var\((--l-[a-z0-9-]+)\)$/)?.[1]
      expect(nome, `${item.texto}: ${item.cor}`).toBeDefined()
      const declarado = landing.match(new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
      expect(declarado?.toLowerCase(), `${nome} no bloco LANDING`).toBe(CORES_DO_V2[i])
      // Declarado UMA vez no arquivo inteiro: nenhum `:root[data-tema=…]` o troca.
      expect(TOKENS.match(new RegExp(`${nome}\\s*:`, 'g')), `${nome} sobrescrito por tema`).toHaveLength(1)
    })
  })

  it('o card do Fire Live diz o que o v2 diz, sem complemento', async () => {
    const html = texto(await renderizar(BASE))
    expect(html).toContain('O 1º quarto ao vivo, jogador por jogador.')
    expect(html).not.toContain('jogador por jogador, correndo')
  })
})
