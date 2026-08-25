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

describe('errata pós-merge — a fronteira não derruba a coleta', () => {
  it('over_odds 0 (mercado suspenso) vira descarte, nunca exceção', async () => {
    const resposta = {
      data: [
        {
          id: 1, game_id: 1, player_id: 237, vendor: 'draftkings', prop_type: 'points',
          line_value: '24.5',
          market: { type: 'over_under', over_odds: 0, under_odds: -110 },
          updated_at: 'x',
        },
      ],
      meta: { per_page: 25 },
    }
    const casas = await casasBalldontlie(async () => resposta as unknown, '1')
    const dk = casas.find((c) => c.nome === 'balldontlie:draftkings')!
    expect(await dk.cotacoes('1')).toHaveLength(0)
    expect(dk.descartadas?.()).toBe(1)
  })

  it('linha que não parseia (line_value numérico) é CONTADA, não silenciada', async () => {
    const resposta = {
      data: [
        {
          id: 1, game_id: 1, player_id: 237, vendor: 'fanduel', prop_type: 'points',
          line_value: 24.5, // número em vez de string: shape quebrado
          market: { type: 'over_under', over_odds: -110, under_odds: -110 },
          updated_at: 'x',
        },
      ],
      meta: { per_page: 25 },
    }
    const casas = await casasBalldontlie(async () => resposta as unknown, '1')
    const total = casas.reduce((soma, c) => soma + (c.descartadas?.() ?? 0), 0)
    expect(total).toBe(1)
  })

  it('buscarPropsHttp segue next_cursor quando o provedor paginar', async () => {
    const { buscarPropsHttp } = await import('../odds/balldontlie-props')
    const paginas: Record<string, unknown> = {
      sem_cursor: {
        data: [{ id: 1 }],
        meta: { per_page: 100, next_cursor: 77 },
      },
      '77': { data: [{ id: 2 }], meta: { per_page: 100 } },
    }
    const chamadas: string[] = []
    const fetchFalso = (async (url: string) => {
      chamadas.push(String(url))
      const cursor = /cursor=(\d+)/.exec(String(url))?.[1] ?? 'sem_cursor'
      return {
        ok: true,
        status: 200,
        json: async () => paginas[cursor],
      }
    }) as unknown as typeof fetch
    const buscar = buscarPropsHttp('chave', 'https://x', fetchFalso)
    const resultado = (await buscar('9')) as { data: unknown[] }
    expect(resultado.data).toHaveLength(2)
    expect(chamadas).toHaveLength(2)
    expect(chamadas[0]).toContain('per_page=100')
  })
})

