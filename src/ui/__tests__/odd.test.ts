import { describe, expect, it } from 'vitest'

import { oddDaLinha } from '../odd'

/**
 * A FORMA DA ODD NA TELA — o fim da cadeia agregada → materialização → linha.
 *
 * Quem escolhe a forma é `odds.exibicao` no YAML (regra 1), aplicada na
 * materialização; a tela só traduz o que o item traz. Estes casos herdam do
 * `lista-secreta.test.ts` (que os provava no `CardEntrada` do design-system
 * antigo, aposentado na Tarefa 12 do front v2) a parte que é da TELA: as três
 * saídas do mesmo item. A parte do dado (`oddFaixa` que a materialização
 * grava) continua lá.
 */
describe('oddDaLinha', () => {
  it('com UMA casa, a odd sai sozinha: nem "média" (não há o que promediar), nem "1,85–1,85"', () => {
    const odd = oddDaLinha({ min: 1.85, max: 1.85, qtdCasas: 1, unica: 1.85 })
    expect(odd).toEqual({ rotulo: 'Odd', valor: '1,85', apoio: null })
  })

  it('com VÁRIAS casas sob casa_unica, a faixa volta: escolher um número seria inventar a casa', () => {
    const odd = oddDaLinha({ min: 1.47, max: 1.62, qtdCasas: 8 })
    expect(odd).toEqual({ rotulo: 'Odd', valor: '1,47–1,62', apoio: '8 casas' })
  })

  it('com odds.exibicao = media, o rótulo diz que é média — a forma vem do item, não da tela', () => {
    const odd = oddDaLinha({ min: 1.47, max: 1.62, qtdCasas: 8, media: 1.55 })
    expect(odd).toEqual({ rotulo: 'Odd média', valor: '1,55', apoio: '8 casas' })
  })

  it('várias casas no MESMO número não viram faixa de um ponto só', () => {
    const odd = oddDaLinha({ min: 1.9, max: 1.9, qtdCasas: 3 })
    expect(odd).toEqual({ rotulo: 'Odd', valor: '1,90', apoio: '3 casas' })
  })

  it('sem odd não há nada a mostrar: nem "—", nem número de tabela fingindo casa', () => {
    expect(oddDaLinha(null)).toBeNull()
    expect(oddDaLinha(undefined)).toBeNull()
  })
})
