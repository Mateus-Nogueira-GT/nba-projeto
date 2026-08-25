import { describe, expect, it } from 'vitest'

import fixture from '../odds/__fixtures__/balldontlie-player-props.json'
import { casasBalldontlie } from '../odds/balldontlie-props'

const buscarFixture = async (_gameIdExterno: string) => fixture as unknown

describe('casas do balldontlie (player props)', () => {
  it('fatia a resposta por vendor — cada casa com o próprio nome', async () => {
    const casas = await casasBalldontlie(buscarFixture, '15908525')
    const nomes = casas.map((c) => c.nome).sort()
    // 4 vendors na fixture; o dos compostos/milestone também aparece (a casa
    // existe — as cotações dela é que morrem na tradução)
    expect(nomes).toEqual([
      'balldontlie:betrivers',
      'balldontlie:caesars',
      'balldontlie:draftkings',
      'balldontlie:fanduel',
    ])
  })

  it('traduz tudo na fronteira: decimal, linha inteira do CJ, atributo, id externo', async () => {
    const casas = await casasBalldontlie(buscarFixture, '15908525')
    const draftkings = casas.find((c) => c.nome === 'balldontlie:draftkings')!
    const cotacoes = await draftkings.cotacoes('15908525')

    const pontos = cotacoes.find((c) => c.atributo === 'PONTOS')!
    expect(pontos.linha).toBe(25) // "24.5" over → 25+
    expect(pontos.oddOver).toBe(1.91) // −110
    expect(pontos.oddUnder).toBe(1.91)
    expect(pontos.jogadorIdExternoProvedor).toBe('237')

    const rebotes = cotacoes.find((c) => c.atributo === 'REBOTES')!
    expect(rebotes.linha).toBe(10) // "9.5" over → 10+
    expect(rebotes.oddOver).toBe(2) // +100
  })

  it('milestone, compostos e linha inteira morrem na porta — contados, nunca silenciosos', async () => {
    const casas = await casasBalldontlie(buscarFixture, '15908525')
    const todas = (
      await Promise.all(casas.map((c) => c.cotacoes('15908525')))
    ).flat()
    // sobram: dk points + fd points + caesars points + dk rebounds + betrivers points
    expect(todas).toHaveLength(5)

    const descartadas = casas.reduce((soma, c) => soma + (c.descartadas?.() ?? 0), 0)
    // double_double (milestone) + points_rebounds_assists (composto)
    expect(descartadas).toBe(2)
  })
})
