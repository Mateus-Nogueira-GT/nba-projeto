import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FaixaDemonstracao } from '../FaixaDemonstracao'

/**
 * A faixa responde, antes de alguém perguntar, ao rótulo "2025-26" e à taxa de
 * acerto da tela de Resultados: enquanto o banco é de demonstração, TODA tela
 * diz que os dados são simulados. O que os testes travam aqui é o texto (que é
 * a promessa feita ao cliente) e a guarda (que é o que impede a faixa de
 * aparecer sobre dado real).
 *
 * Herdeiro do `src/app/__tests__/faixa-demonstracao.test.ts`, que testava a
 * faixa do front antigo (Tarefa 12 do front v2). A cor saiu do estilo embutido
 * para o `.module.css`, e por isso o caso da cor lê o CSS, não o HTML.
 */
describe('FaixaDemonstracao', () => {
  it('aparece, com o texto exato, quando DEMO_AUTOSSEMEADURA=true', () => {
    const html = renderToStaticMarkup(
      createElement(FaixaDemonstracao, { env: { DEMO_AUTOSSEMEADURA: 'true' } }),
    )
    expect(html).toContain('Temporada demonstrativa · dados simulados')
    expect(html).toContain('role="note"')
  })

  it('o separador é o ponto médio, e a frase não leva ponto final', () => {
    const html = renderToStaticMarkup(
      createElement(FaixaDemonstracao, { env: { DEMO_AUTOSSEMEADURA: 'true' } }),
    )
    // U+00B7, não '-' nem '•' nem '.': é o separador que o resto da UI usa.
    expect(html).toContain('Temporada demonstrativa · dados simulados')
    expect(html).not.toContain('dados simulados.')
  })

  it('a cor e a borda saem de token, nunca de hex cru', () => {
    const css = readFileSync('src/features/shell/FaixaDemonstracao.module.css', 'utf8')
    const faixa = css.match(/\.faixa\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(faixa).toMatch(/background:\s*var\(--/)
    expect(faixa).toMatch(/color:\s*var\(--/)
    expect(faixa).toMatch(/border-bottom:[^;]*var\(--/)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('não renderiza nada sem a variável (ou com valor ambíguo)', () => {
    // A mesma comparação estrita de `autossemeaduraHabilitada`: '1', 'TRUE' e
    // 'sim' não ligam nada. Uma variável ambígua é como se liga o que não se
    // queria ligar — e aqui o custo seria a faixa some sobre dado de verdade,
    // ou aparece sobre ele.
    expect(FaixaDemonstracao({ env: {} })).toBeNull()
    expect(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: '1' } })).toBeNull()
    expect(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: 'TRUE' } })).toBeNull()
    expect(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: 'sim' } })).toBeNull()
    expect(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: 'false' } })).toBeNull()

    expect(renderToStaticMarkup(createElement(FaixaDemonstracao, { env: {} }))).toBe('')
  })

  it('recua a área segura do topo: no PWA em iOS a faixa não fica atrás da barra de status', () => {
    // O app é `standalone` com `statusBarStyle: 'black-translucent'` e
    // `viewportFit: 'cover'` (src/app/layout.tsx) — o conteúdo começa em y=0,
    // por baixo da barra de status. A faixa é o primeiro elemento pintado do
    // body; sem recuo, o aviso "dados simulados" desaparece inteiro justamente
    // no aparelho-alvo do PWA. O `0px` de padrão é para o navegador que não
    // conhece o env().
    // Sem os comentários: o cabeçalho do CSS CITA o `position: fixed` para
    // explicar por que ele não existe.
    const css = readFileSync('src/features/shell/FaixaDemonstracao.module.css', 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(css).toContain('env(safe-area-inset-top, 0px)')
    // No fluxo, nunca fixa: não pode cobrir conteúdo nem competir com a barra.
    expect(css).not.toMatch(/position:\s*fixed/)
  })
})

/**
 * A promessa da faixa não é "o componente renderiza" — é "TODA tela avisa". Só
 * o layout raiz entrega isso, e ele é uma linha que ninguém mais exercita:
 * `next/font/google` não existe fora do transform do Next, então importar o
 * RootLayout numa suíte vitest não roda. O teste barato lê o arquivo e trava a
 * fiação. Sem ele, apagar `<FaixaDemonstracao />` do layout deixa a suíte
 * inteira verde e o dado simulado sem aviso.
 */
describe('fiação no layout raiz', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8')

  it('o layout raiz importa a faixa do shell do v2', () => {
    expect(layout).toMatch(
      /import \{[^}]*\bFaixaDemonstracao\b[^}]*\} from '@\/features\/shell\/FaixaDemonstracao'/,
    )
  })

  it('a faixa é renderizada dentro do <body>, e não em algum ramo condicional', () => {
    const corpo = layout.slice(layout.indexOf('<body>'), layout.indexOf('</body>'))
    expect(corpo).toContain('<FaixaDemonstracao />')
    // Antes de `{children}`: o aviso é a primeira coisa da tela, acima do
    // conteúdo, não um rodapé perdido depois dele.
    expect(corpo.indexOf('<FaixaDemonstracao />')).toBeLessThan(corpo.indexOf('{children}'))
  })
})
