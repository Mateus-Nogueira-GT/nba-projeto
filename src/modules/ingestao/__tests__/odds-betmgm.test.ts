import { describe, expect, it, vi } from 'vitest'

import { casasBetmgm, eventosDoDiaBetmgm } from '../odds/betmgm'
import type { ConfigBetmgm } from '../odds/fontes'

const CONFIG: ConfigBetmgm = {
  baseUrl: 'https://afiliados.betmgm.example',
  apiKey: 'chave',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  brand: 'marca',
  location: 'BR',
  lang: 'en',
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('eventos do dia (V2, cursor)', () => {
  it('segue o cursor até null e injeta lang/brand/location em TODA chamada', async () => {
    const pagina1 = {
      limit: 100,
      nextCursor: 'c2',
      data: [
        {
          id: 'ev1',
          matchState: 'PREMATCH',
          eventName: null, // o PDF avisa: pode ser nulo
          participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }],
          startTime: '2026-08-28T23:00:00Z',
        },
      ],
    }
    const pagina2 = {
      limit: 100,
      nextCursor: null,
      data: [{ id: 'ev2', matchState: 'ONGOING', participants: [{ name: 'A' }, { name: 'B' }] }],
    }
    const buscar = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(pagina1))
      .mockResolvedValueOnce(json(pagina2))

    const eventos = await eventosDoDiaBetmgm(CONFIG, '2026-08-28', buscar)

    // ev2 está ONGOING: pré-live não coleta — fora, sem erro.
    expect(eventos).toEqual([
      {
        idExterno: 'ev1',
        nomeCasa: 'Los Angeles Lakers',
        nomeVisitante: 'Boston Celtics',
        inicioIso: '2026-08-28T23:00:00Z',
      },
    ])
    expect(buscar).toHaveBeenCalledTimes(2)
    for (const chamada of buscar.mock.calls) {
      const url = String(chamada[0])
      expect(url).toContain('/program/v1/api/aff/v2/events')
      expect(url).toContain('lang=en')
      expect(url).toContain('brand=marca')
      expect(url).toContain('location=BR')
      expect(url).toContain('sportType=BASKETBALL')
      const h = chamada[1]!.headers as Record<string, string>
      expect(h.Authorization).toBe('Bearer chave')
    }
    expect(String(buscar.mock.calls[1]![0])).toContain('cursor=c2')
  })

  it('cursor que nunca acaba não roda para sempre — o loop tem teto', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      json({ limit: 100, nextCursor: 'sempre', data: [] }),
    )
    await eventosDoDiaBetmgm(CONFIG, '2026-08-28', buscar)
    expect(buscar.mock.calls.length).toBeLessThanOrEqual(50)
    expect(buscar.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('odds por evento (V2)', () => {
  const EVENTO_COM_MERCADOS = {
    limit: 100,
    nextCursor: null,
    data: [
      {
        id: 'ev1',
        matchState: 'PREMATCH',
        participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }],
        betMarkets: [
          {
            name: 'Player Points',
            betMarketStatus: 'OPEN',
            specifiers: [
              { name: 'player', value: 'Stephen Curry' },
              { name: 'line', value: '24.5' },
            ],
            outcomes: [
              { name: 'Over', formatDecimal: 1.85, probability: 0.51 },
              { name: 'Under', formatDecimal: 1.95, probability: 0.49 },
            ],
          },
          {
            name: 'Moneyline',
            betMarketStatus: 'OPEN',
            specifiers: [],
            outcomes: [{ name: 'Lakers', formatDecimal: 1.5 }],
          },
          {
            name: 'Player Points',
            betMarketStatus: 'SUSPENDED',
            specifiers: [
              { name: 'player', value: 'Jamal Murray' },
              { name: 'line', value: '18.5' },
            ],
            outcomes: [{ name: 'Over', formatDecimal: 2.0 }],
          },
        ],
      },
    ],
  }

  it('traduz o prop com specifiers, ignora probability, descarta o resto CONTADO', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO_COM_MERCADOS))
    const atributoDoMercado = (nome: string) =>
      nome === 'Player Points' ? ('PONTOS' as const) : undefined
    const [casa] = await casasBetmgm(CONFIG, atributoDoMercado, buscar, 'ev1')
    const cotacoes = await casa!.cotacoes('ev1')

    expect(cotacoes).toHaveLength(1)
    expect(cotacoes[0]).toMatchObject({
      jogadorNomeNaCasa: 'Stephen Curry',
      nomeMercadoNaCasa: 'Player Points',
      linha: 25,
      oddOver: 1.85,
      oddUnder: 1.95,
      atributo: 'PONTOS',
    })
    // O % do produto é score de confiança: probability não atravessa a porta.
    expect(Object.keys(cotacoes[0]!)).not.toContain('probability')
    // Moneyline (sem mapa) + mercado SUSPENDED = 2 descartes.
    expect(casa!.descartadas!()).toBe(2)
    // fields=BETMARKETS na URL — sem ele o evento vem sem mercados.
    expect(String(buscar.mock.calls[0]![0])).toContain('fields=BETMARKETS')
  })

  it('linha em specifier com chave alternativa (total/points/handicap) também resolve', async () => {
    const variante = structuredClone(EVENTO_COM_MERCADOS)
    variante.data[0]!.betMarkets[0]!.specifiers = [
      { name: 'player', value: 'Stephen Curry' },
      { name: 'total', value: '24.5' },
    ]
    const buscar = vi.fn<typeof fetch>(async () => json(variante))
    const [casa] = await casasBetmgm(CONFIG, () => 'PONTOS' as const, buscar, 'ev1')
    const cotacoes = await casa!.cotacoes('ev1')
    expect(cotacoes.some((c) => c.linha === 25)).toBe(true)
  })

  it('sem o lado Over não há cotação — descarta contado', async () => {
    const soUnder = structuredClone(EVENTO_COM_MERCADOS)
    soUnder.data[0]!.betMarkets[0]!.outcomes = [
      { name: 'Under', formatDecimal: 1.95, probability: 0.49 },
    ]
    const buscar = vi.fn<typeof fetch>(async () => json(soUnder))
    const [casa] = await casasBetmgm(CONFIG, () => 'PONTOS' as const, buscar, 'ev1')
    expect(await casa!.cotacoes('ev1')).toHaveLength(0)
  })
})
