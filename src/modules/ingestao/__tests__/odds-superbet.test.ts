import { describe, expect, it, vi } from 'vitest'

import type { ConfigSuperbet } from '../odds/fontes'
import { casasSuperbet, censoSuperbet, eventosDoDiaSuperbet } from '../odds/superbet'

/**
 * As formas testadas aqui foram capturadas do feed real em 22/09/2026
 * (`production-superbet-offer-br`, jogo Fenerbahce·Besiktas): envelope,
 * nomes de campo, vocabulário de status e os DOIS formatos de prop.
 */

const CONFIG: ConfigSuperbet = {
  baseUrl: 'https://offer-br.example',
  locale: 'pt-BR',
  sportId: '4',
  champId: null,
  caminhoEventos: '/v3/subscription/{locale}/prematch?sports={sportId}',
  caminhoEvento: '/v3/{locale}/events?events={id}&includeOnly=fixture,markets',
  janelaMs: 200,
  apiKey: null,
  authHeader: 'Authorization',
  authPrefix: 'Bearer',
}

/** A lista é `text/event-stream`: linhas `data:[…]`. */
const sse = (corpo: string) =>
  new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } })

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const evento = (id: number, nome: string, torneio: number, utc = '2026-09-22T17:00:00Z') => ({
  event_id: id,
  fixture: { event_name: nome, utc_date: utc, tournament_id: torneio, sport_id: 4 },
})

/** Prop clássico: os dois lados compartilham `market_line_uuid`. */
const total = (jogador: string, linha: string, lado: 'Mais' | 'Menos', preco: number, uuid: string) => ({
  price: preco,
  status: 1,
  display: true,
  metadata: {
    info: `Terá ${lado === 'Mais' ? 'mais' : 'menos'} de ${linha} pontos (Inc. prorrogação)`,
    name: `${jogador} - ${lado} de ${linha}`,
    market_line_uuid: uuid,
    specifiers: { player: jogador, total: linha },
  },
})

/** Prop "N+": um lado só, e o valor JÁ é a linha do CJ. */
const marco = (jogador: string, n: string, preco: number, uuid: string) => ({
  price: preco,
  status: 1,
  display: true,
  metadata: {
    info: `Marcará ${n} ou mais pontos (Inc. prorrogação)`,
    name: `${jogador} ${n}+`,
    market_line_uuid: uuid,
    specifiers: { milestone: n, player: jogador },
  },
})

const detalhe = (mercados: unknown[]) => json({ events: [{ event_id: 14903349, markets: mercados }] })

const MERCADO_TOTAL = 'Jogador - Total de Pontos (Inc. prorrogação)'
const MERCADO_MARCO = 'Jogador - Pontos (Inc. prorrogação)'
const soPontos = (nome: string) =>
  nome === MERCADO_TOTAL || nome === MERCADO_MARCO ? ('PONTOS' as const) : undefined

describe('lista de eventos (SSE)', () => {
  it('lê linhas data:, separa os times pelo ponto médio e usa o caminho de assinatura', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      sse(`data:${JSON.stringify([evento(14903349, 'Fenerbahce·Besiktas', 2185)])}\n\n`),
    )

    const eventos = await eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)

    expect(eventos).toEqual([
      {
        idExterno: '14903349',
        nomeCasa: 'Fenerbahce',
        nomeVisitante: 'Besiktas',
        inicioIso: '2026-09-22T17:00:00Z',
      },
    ])
    const url = String(buscar.mock.calls[0]![0])
    expect(url).toBe('https://offer-br.example/v3/subscription/pt-BR/prematch?sports=4')
  })

  it('a assinatura repete o mesmo evento a cada atualização — o primeiro vale', async () => {
    const um = evento(14903349, 'Fenerbahce·Besiktas', 2185)
    const buscar = vi.fn<typeof fetch>(async () =>
      sse(`data:${JSON.stringify([um])}\n\ndata:${JSON.stringify([um])}\n\n`),
    )
    expect(await eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)).toHaveLength(1)
  })

  it('bloco cortado pela janela é ignorado, não vira erro', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      sse(
        `data:${JSON.stringify([evento(1, 'Lakers·Celtics', 2174)])}\n\n` +
          'data:[{"event_id":2,"fixture":{"event_n',
      ),
    )
    const eventos = await eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)
    expect(eventos.map((e) => e.idExterno)).toEqual(['1'])
  })

  it('champId filtra o campeonato; sem ele, passa tudo e o vínculo corta o dia', async () => {
    const corpo = `data:${JSON.stringify([
      evento(1, 'Washington Mystics (F)·Connecticut Sun (F)', 2174),
      evento(2, 'Fenerbahce·Besiktas', 2185),
    ])}\n\n`
    const buscar = vi.fn<typeof fetch>(async () => sse(corpo))

    expect(await eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)).toHaveLength(2)
    const so2174 = await eventosDoDiaSuperbet({ ...CONFIG, champId: '2174' }, '2026-09-22', buscar)
    expect(so2174.map((e) => e.idExterno)).toEqual(['1'])
  })

  it('sem credencial não manda header de autorização — o feed é aberto', async () => {
    const buscar = vi.fn<typeof fetch>(async () => sse('data:[]\n\n'))
    await eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)
    const h = buscar.mock.calls[0]![1]!.headers as Record<string, string>
    expect(h.Authorization).toBeUndefined()
  })

  it('com credencial, ela entra sem mudar código', async () => {
    const buscar = vi.fn<typeof fetch>(async () => sse('data:[]\n\n'))
    await eventosDoDiaSuperbet(
      { ...CONFIG, apiKey: 'k', authHeader: 'X-Api-Key', authPrefix: '' },
      '2026-09-22',
      buscar,
    )
    const h = buscar.mock.calls[0]![1]!.headers as Record<string, string>
    expect(h['X-Api-Key']).toBe('k')
  })

  it('HTTP != 200 é erro da fonte, não silêncio', async () => {
    const buscar = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }))
    await expect(eventosDoDiaSuperbet(CONFIG, '2026-09-22', buscar)).rejects.toThrow(/HTTP 503/)
  })
})

describe('props de jogador (detalhe JSON)', () => {
  it('remonta o par Mais de/Menos de pelo market_line_uuid', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        {
          id: 239934,
          name: MERCADO_TOTAL,
          odds: [
            total('Anthony Brown', '9.5', 'Mais', 1.92, 'linha-a'),
            total('Anthony Brown', '9.5', 'Menos', 1.78, 'linha-a'),
          ],
        },
      ]),
    )

    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    expect(await casa!.cotacoes('14903349')).toEqual([
      {
        jogadorNomeNaCasa: 'Anthony Brown',
        nomeMercadoNaCasa: MERCADO_TOTAL,
        linha: 10, // 9.5 no lado over É a linha "10+" do CJ
        oddOver: 1.92,
        oddUnder: 1.78,
        atributo: 'PONTOS',
      },
    ])
    expect(casa!.descartadas!()).toBe(0)
    expect(String(buscar.mock.calls[0]![0])).toContain('/v3/pt-BR/events?events=14903349')
  })

  it('o mercado "N+" da casa JÁ é a linha do CJ — sem conversão, e sem lado under', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([{ id: 238440, name: MERCADO_MARCO, odds: [marco('Braxton Key', '5', 1.32, 'marco-a')] }]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    expect(await casa!.cotacoes('14903349')).toEqual([
      {
        jogadorNomeNaCasa: 'Braxton Key',
        nomeMercadoNaCasa: MERCADO_MARCO,
        linha: 5,
        oddOver: 1.32,
        oddUnder: null,
        atributo: 'PONTOS',
      },
    ])
  })

  it('os dois formatos convivem no mesmo evento, cada um com sua linha', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        {
          id: 239934,
          name: MERCADO_TOTAL,
          odds: [
            total('Anthony Brown', '9.5', 'Mais', 1.92, 'linha-a'),
            total('Anthony Brown', '9.5', 'Menos', 1.78, 'linha-a'),
            total('DaQuan Jeffries', '10.5', 'Mais', 1.92, 'linha-b'),
          ],
        },
        { id: 238440, name: MERCADO_MARCO, odds: [marco('Anthony Brown', '5', 1.16, 'marco-a')] },
      ]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    const cotacoes = await casa!.cotacoes('14903349')
    expect(cotacoes.map((c) => [c.jogadorNomeNaCasa, c.linha, c.oddOver, c.oddUnder])).toEqual([
      ['Anthony Brown', 10, 1.92, 1.78],
      ['DaQuan Jeffries', 11, 1.92, null],
      ['Anthony Brown', 5, 1.16, null],
    ])
  })

  it('status 2 é suspenso e display:false não exibe — nenhum dos dois atravessa', async () => {
    const suspensa = { ...total('David DeJulius', '8.5', 'Mais', 1, 'x'), status: 2 }
    const escondida = { ...total('Jaylen Nowell', '7.5', 'Mais', 1.9, 'y'), display: false }
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([{ id: 239934, name: MERCADO_TOTAL, odds: [suspensa, escondida] }]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    expect(await casa!.cotacoes('14903349')).toEqual([])
    expect(casa!.descartadas!()).toBe(2)
  })

  it('mercado de time ou de partida não é prop de jogador — descarte', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        {
          id: 759,
          name: 'Vencedor (Inc. prorrogação)',
          odds: [
            { price: 1.16, status: 1, display: true, metadata: { name: '1', info: 'Fenerbahce vence' } },
          ],
        },
        {
          id: 753,
          name: 'Total de Pontos (Inc. prorrogação)',
          odds: [
            {
              price: 1.3,
              status: 1,
              display: true,
              metadata: { name: 'Mais de 156.5', info: 'Mais de 156.5 pontos marcados', market_line_uuid: 'z' },
            },
          ],
        },
      ]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    expect(await casa!.cotacoes('14903349')).toEqual([])
    expect(casa!.descartadas!()).toBe(2)
  })

  it('linha INTEIRA em mercado de total não atravessa: over de 25 não é "25+"', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        { id: 239934, name: MERCADO_TOTAL, odds: [total('Eugene Omoruyi', '25', 'Mais', 1.9, 'inteira')] },
      ]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    expect(await casa!.cotacoes('14903349')).toEqual([])
    expect(casa!.descartadas!()).toBe(1)
  })

  it('prop FORA do mapa sai sem atributo — é curadoria pendente, não descarte', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        {
          id: 240001,
          name: 'Jogador - Total de Rebotes (Inc. prorrogação)',
          odds: [total('Nikola Jokic', '7.5', 'Mais', 1.7, 'reb-a')],
        },
      ]),
    )
    const [casa] = await casasSuperbet(CONFIG, '14903349', soPontos, buscar)
    const cotacoes = await casa!.cotacoes('14903349')
    expect(cotacoes).toHaveLength(1)
    expect(cotacoes[0]!.nomeMercadoNaCasa).toBe('Jogador - Total de Rebotes (Inc. prorrogação)')
    expect(cotacoes[0]!.atributo).toBeUndefined()
    expect(casa!.descartadas!()).toBe(0)
  })

  it('evento que a casa não devolve não derruba nada — casa vazia', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ events: [] }))
    const [casa] = await casasSuperbet(CONFIG, 'ev404', soPontos, buscar)
    expect(await casa!.cotacoes('ev404')).toEqual([])
  })
})

describe('censo', () => {
  it('lista o nome do mercado com cotações ativas e os jogadores, sem mapa', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      detalhe([
        {
          id: 239934,
          name: MERCADO_TOTAL,
          odds: [
            total('Anthony Brown', '9.5', 'Mais', 1.92, 'linha-a'),
            total('Anthony Brown', '9.5', 'Menos', 1.78, 'linha-a'),
            { ...total('David DeJulius', '8.5', 'Mais', 1, 'x'), status: 2 },
          ],
        },
        { id: 238440, name: MERCADO_MARCO, odds: [marco('Braxton Key', '5', 1.32, 'marco-a')] },
      ]),
    )
    const censo = await censoSuperbet(CONFIG, '14903349', buscar)
    expect(censo.mercados).toEqual([
      { nome: MERCADO_TOTAL, cotacoesAtivas: 2 },
      { nome: MERCADO_MARCO, cotacoesAtivas: 1 },
    ])
    expect(censo.jogadores.sort()).toEqual(['Anthony Brown', 'Braxton Key'])
  })
})
