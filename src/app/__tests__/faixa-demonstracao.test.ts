import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FaixaDemonstracao } from '../../components/navegacao'
import { semantico } from '../../design-system/tokens/semantico'

/**
 * A faixa responde, antes de alguém perguntar, ao rótulo "2025-26" e à taxa de
 * acerto da tela de Resultados: enquanto o banco é de demonstração, TODA tela
 * diz que os dados são simulados. O que os testes travam aqui é o texto (que é
 * a promessa feita ao cliente) e a guarda (que é o que impede a faixa de
 * aparecer sobre dado real).
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
    // U+00B7, não '-' nem '•' nem '.': é o separador que o resto da UI usa
    // (ver a sobrancelha "LISTA SECRETA · PRÉ-LIVE" do CabecalhoTela).
    expect(html).toContain('Temporada demonstrativa · dados simulados')
    expect(html).not.toContain('dados simulados.')
  })

  it('a cor e a borda saem do token semântico, nunca de hex cru', () => {
    const html = renderToStaticMarkup(
      createElement(FaixaDemonstracao, { env: { DEMO_AUTOSSEMEADURA: 'true' } }),
    )
    expect(html).toContain(semantico.textoSecundario)
    expect(html).toContain(semantico.divisor)
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
    // body e mede ~27px; a barra de status de um iPhone com notch mede mais
    // que isso. Sem recuo, o aviso "dados simulados" desaparece inteiro
    // justamente no aparelho-alvo do PWA.
    //
    // Mesmo remédio que a BarraInferior já usa no outro extremo da tela, com
    // o `0px` de padrão para o navegador que não conhece o env().
    const html = renderToStaticMarkup(
      createElement(FaixaDemonstracao, { env: { DEMO_AUTOSSEMEADURA: 'true' } }),
    )
    expect(html).toContain('env(safe-area-inset-top, 0px)')
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
  const layout = readFileSync(fileURLToPath(new URL('../layout.tsx', import.meta.url)), 'utf8')

  it('o layout raiz importa a faixa do barril de navegação', () => {
    expect(layout).toMatch(/import \{[^}]*\bFaixaDemonstracao\b[^}]*\} from '@\/components\/navegacao'/)
  })

  it('a faixa é renderizada dentro do <body>, e não em algum ramo condicional', () => {
    const corpo = layout.slice(layout.indexOf('<body>'), layout.indexOf('</body>'))
    expect(corpo).toContain('<FaixaDemonstracao />')
    // Antes de `{children}`: o aviso é a primeira coisa da tela, acima do
    // conteúdo, não um rodapé perdido depois dele.
    expect(corpo.indexOf('<FaixaDemonstracao />')).toBeLessThan(corpo.indexOf('{children}'))
  })
})
