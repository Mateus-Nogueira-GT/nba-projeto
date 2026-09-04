import { describe, expect, it, vi } from 'vitest'

import { casasBetmgm, censoBetmgm, eventosDoDiaBetmgm } from '../odds/betmgm'
import type { ConfigBetmgm } from '../odds/fontes'

const CONFIG: ConfigBetmgm = {
  baseUrl: 'https://afiliados.betmgm.example',
  apiKey: 'chave',
  authHeader: 'Authorization',
  authPrefix: 'Bearer',
  brand: 'marca',
  location: 'BR',
  lang: 'en',
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

describe('eventos (V2, cursor)', () => {
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
    const buscar = vi.fn<typeof fetch>().mockResolvedValueOnce(json(pagina1)).mockResolvedValueOnce(json(pagina2))

    const eventos = await eventosDoDiaBetmgm(CONFIG, buscar)

    // ev2 está ONGOING: pré-live não coleta — fora, sem erro.
    expect(eventos).toEqual([
      { idExterno: 'ev1', nomeCasa: 'Los Angeles Lakers', nomeVisitante: 'Boston Celtics', inicioIso: '2026-08-28T23:00:00Z' },
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

  it('cursor REPETIDO é defeito da API e vira erro — não 50 páginas iguais na média', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ limit: 100, nextCursor: 'sempre', data: [] }))
    await expect(eventosDoDiaBetmgm(CONFIG, buscar)).rejects.toThrow(/cursor repetido/)
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('prefixo vazio manda a chave nua — o esquema de credencial é config, não código', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ nextCursor: null, data: null }))
    await eventosDoDiaBetmgm({ ...CONFIG, authHeader: 'X-Api-Key', authPrefix: '' }, buscar)
    const h = buscar.mock.calls[0]![1]!.headers as Record<string, string>
    expect(h['X-Api-Key']).toBe('chave')
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
            specifiers: [{ name: 'player', value: 'Stephen Curry' }, { name: 'line', value: '24.5' }],
            outcomes: [
              { name: 'Over', formatDecimal: 1.85, probability: 0.51 },
              { name: 'Under', formatDecimal: 1.95, probability: 0.49 },
            ],
          },
          { name: 'Moneyline', betMarketStatus: 'OPEN', specifiers: [], outcomes: [{ name: 'Lakers', formatDecimal: 1.5 }] },
          {
            name: 'Player Points',
            betMarketStatus: 'SUSPENDED',
            specifiers: [{ name: 'player', value: 'Jamal Murray' }, { name: 'line', value: '18.5' }],
            outcomes: [{ name: 'Over', formatDecimal: 2.0 }],
          },
        ],
      },
    ],
  }
  const soPontos = (nome: string) => (nome === 'Player Points' ? ('PONTOS' as const) : undefined)

  it('traduz o prop com specifiers, ignora probability, descarta o resto CONTADO', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO_COM_MERCADOS))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', soPontos, buscar)
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
    // Moneyline (sem jogador) + mercado SUSPENDED = 2 descartes.
    expect(casa!.descartadas!()).toBe(2)
    expect(String(buscar.mock.calls[0]![0])).toContain('fields=BETMARKETS')
  })

  it('prop FORA do mapa sai SEM atributo — a coleta conta como aguardandoCuradoria, não como descarte', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO_COM_MERCADOS))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', () => undefined, buscar)
    const cotacoes = await casa!.cotacoes('ev1')
    expect(cotacoes).toHaveLength(1)
    expect('atributo' in cotacoes[0]!).toBe(false)
    expect(casa!.descartadas!()).toBe(2)
  })

  it('evento que saiu de PREMATCH entre o vínculo e a coleta NÃO vira cotação — odd ao vivo não é pré-live', async () => {
    const aoVivo = structuredClone(EVENTO_COM_MERCADOS)
    aoVivo.data[0]!.matchState = 'ONGOING'
    const buscar = vi.fn<typeof fetch>(async () => json(aoVivo))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', soPontos, buscar)
    expect(await casa!.cotacoes('ev1')).toHaveLength(0)
    expect(casa!.descartadas!()).toBe(3)
  })

  it('lados em português também resolvem — `lang` é configurável', async () => {
    const ptBr = structuredClone(EVENTO_COM_MERCADOS)
    ptBr.data[0]!.betMarkets[0]!.outcomes = [
      { name: 'Mais de 24.5', formatDecimal: 1.85, probability: 0.51 },
      { name: 'Menos de 24.5', formatDecimal: 1.95, probability: 0.49 },
    ]
    const buscar = vi.fn<typeof fetch>(async () => json(ptBr))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', soPontos, buscar)
    expect(await casa!.cotacoes('ev1')).toMatchObject([{ oddOver: 1.85, oddUnder: 1.95 }])
  })

  it('linha em specifier com chave alternativa (total/points/handicap) também resolve', async () => {
    const variante = structuredClone(EVENTO_COM_MERCADOS)
    variante.data[0]!.betMarkets[0]!.specifiers = [{ name: 'player', value: 'Stephen Curry' }, { name: 'total', value: '24.5' }]
    const buscar = vi.fn<typeof fetch>(async () => json(variante))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', () => 'PONTOS' as const, buscar)
    expect((await casa!.cotacoes('ev1')).some((c) => c.linha === 25)).toBe(true)
  })

  it('sem o lado Over não há cotação — descarta contado', async () => {
    const soUnder = structuredClone(EVENTO_COM_MERCADOS)
    soUnder.data[0]!.betMarkets[0]!.outcomes = [{ name: 'Under', formatDecimal: 1.95, probability: 0.49 }]
    const buscar = vi.fn<typeof fetch>(async () => json(soUnder))
    const [casa] = await casasBetmgm(CONFIG, 'ev1', () => 'PONTOS' as const, buscar)
    expect(await casa!.cotacoes('ev1')).toHaveLength(0)
  })

  it('o censo lista TUDO — inclusive Moneyline e o mercado suspenso', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO_COM_MERCADOS))
    const censo = await censoBetmgm(CONFIG, 'ev1', buscar)
    expect(censo.mercados).toEqual([
      { nome: 'Player Points', cotacoesAtivas: 3 },
      { nome: 'Moneyline', cotacoesAtivas: 1 },
    ])
    expect(censo.jogadores).toEqual(['Stephen Curry', 'Jamal Murray'])
  })
})
