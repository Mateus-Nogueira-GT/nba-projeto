import { existsSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * AS TELAS FORA DA CASCA — o que só o layout RAIZ veste.
 *
 * `/entrar`, `/cadastrar`, `/redefinir`, `/offline`, `/oferta/…`,
 * `/admin/entrar`, `/afiliados/**`, `/conheca`, `/placar` e o 404 não passam
 * por `(app)/layout.tsx`: a única base que elas têm é o `globals.css`. Na
 * transição do front v2 (Tarefa 3) as regras de ELEMENTO do v2 ficaram presas
 * em `[data-app]` para as telas antigas não mudarem; a Tarefa 12 apagou as
 * antigas e o escopo ficou — e toda tela pública saiu na serif 16px do
 * navegador, com link sublinhado, margem de <p> e, no Claro, texto preto. A
 * base é GLOBAL, como em `referencias/nip-front-v2/src/app/globals.css`.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('globals.css: a base do v2 vale para toda tela, dentro e fora da casca', () => {
  const css = semComentarios(readFileSync('src/app/globals.css', 'utf8'))
  /** O corpo de uma regra de ELEMENTO no topo do arquivo (sem prefixo de escopo). */
  const regra = (seletor: string) =>
    css.match(new RegExp(`(?:^|\\n)${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? null

  it('nenhuma regra fica presa em [data-app]', () => {
    expect(css).not.toContain('[data-app]')
  })

  it('o <body> traz a tipografia do v2', () => {
    const corpo = regra('body')
    expect(corpo).not.toBeNull()
    for (const declaracao of [
      'color: var(--texto)',
      'font-family: var(--fonte)',
      'font-size: var(--t-14)',
      'font-weight: 500',
      'line-height: 1.45',
      '-webkit-font-smoothing: antialiased',
      'background: var(--fundo)',
    ]) {
      expect(corpo, declaracao).toContain(declaracao)
    }
  })

  it('títulos, parágrafos, links, controles, imagens e foco — como no v2', () => {
    expect(regra('h1,\nh2,\nh3,\nh4,\np')).toContain('margin: 0')
    expect(regra('a')).toContain('text-decoration: none')
    expect(regra('a')).toContain('color: inherit')
    expect(regra('button,\ninput,\nselect,\ntextarea')).toContain('color: inherit')
    expect(regra('button')).toContain('cursor: pointer')
    expect(regra('img,\nsvg')).toContain('display: block')
    expect(regra(':focus-visible')).toContain('outline: 2px solid var(--texto)')
  })

  it('o atributo data-app continua na casca: é por ele que o botão de recolher acha o grid', () => {
    // O escopo de CSS saiu; o atributo não. `BotaoRecolher` faz
    // `document.querySelector('[data-app]')` para trocar `data-recolhida`.
    expect(readFileSync('src/app/(app)/layout.tsx', 'utf8')).toContain('data-app')
    expect(readFileSync('src/features/shell/Navegacao.tsx', 'utf8')).toContain("querySelector<HTMLElement>('[data-app]')")
  })
})

describe('404: a página que não existe, igual à do v2', () => {
  it('existe na raiz de app/ e não lê cookies — o layout raiz é estático', () => {
    expect(existsSync('src/app/not-found.tsx')).toBe(true)
    const fonte = semComentarios(readFileSync('src/app/not-found.tsx', 'utf8'))
    expect(fonte).not.toContain('next/headers')
    expect(fonte).not.toContain('cookies')
  })

  it('diz que a página não existe e leva de volta para a Lista', async () => {
    const { default: NaoEncontrada } = await import('@/app/not-found')
    const html = renderToStaticMarkup(<NaoEncontrada />)
    expect(html).toContain('404')
    expect(html).toContain('Esta página não existe')
    expect(html).toContain('O link pode estar errado ou a página mudou de lugar.')
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Ir para Entradas<\/a>/)
  })
})
