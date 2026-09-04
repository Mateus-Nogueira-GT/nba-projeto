import { describe, expect, it, vi } from 'vitest'

import {
  autenticarAltenar,
  casasAltenar,
  censoAltenar,
  eventosDoDiaAltenar,
} from '../odds/altenar'
import type { ConfigAltenar } from '../odds/fontes'

const CONFIG: ConfigAltenar = {
  gatewayBase: 'https://gw.altenar.example',
  origin: 'https://nosso.app',
  integration: 'nossa',
  sportId: '67',
  champId: '3999',
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('autenticação', () => {
  it('manda Origin e x-Integration e aceita o token em qualquer dos campos do guia', async () => {
    for (const corpo of [
      { token: 't1' },
      { apiToken: 't1' },
      { access_token: 't1' },
      { data: { token: 't1' } },
    ]) {
      const buscar = vi.fn<typeof fetch>(async () => json(corpo))
      const token = await autenticarAltenar(CONFIG, buscar)
      expect(token).toBe('t1')
      const [url, init] = buscar.mock.calls[0]!
      expect(String(url)).toBe('https://gw.altenar.example/api/authenticate')
      const h = init!.headers as Record<string, string>
      expect(h.Origin).toBe('https://nosso.app')
      expect(h['x-Integration']).toBe('nossa')
    }
  })

  it('resposta sem token em campo conhecido falha alto — não devolve string vazia', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ mensagem: 'ok' }))
    await expect(autenticarAltenar(CONFIG, buscar)).rejects.toThrow(/sem token/)
  })
})

describe('eventos do dia', () => {
  it('filtra por sportId/champId/datas e normaliza os participantes', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      json({
        data: [{ eventId: 15979600, name: 'Lakers vs Celtics', startDate: '2026-08-28T23:00:00Z' }],
      }),
    )
    const eventos = await eventosDoDiaAltenar(CONFIG, 'tok', '2026-08-28', buscar)
    expect(eventos).toEqual([
      {
        idExterno: '15979600',
        nomeCasa: 'Lakers',
        nomeVisitante: 'Celtics',
        inicioIso: '2026-08-28T23:00:00Z',
      },
    ])
    const url = String(buscar.mock.calls[0]![0])
    expect(url).toContain('/api/v1/events?')
    expect(url).toContain('sportId=67')
    expect(url).toContain('champId=3999')
    const h = buscar.mock.calls[0]![1]!.headers as Record<string, string>
    expect(h['X-ApiToken']).toBe('tok')
  })

  it('nome sem separador reconhecível vira participantes nulos — vínculo decide, não o adapter', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ data: [{ eventId: 1, name: 'All-Star Game' }] }))
    const [e] = await eventosDoDiaAltenar(CONFIG, 'tok', '2026-08-28', buscar)
    expect(e!.nomeCasa).toBeNull()
  })
})

describe('odds por evento', () => {
  const EVENTO = {
    id: 15979600,
    markets: [
      {
        marketId: 1,
        name: 'Total de Pontos - Stephen Curry',
        odds: [
          { id: 10, price: 1.85, oddStatus: 0, name: 'Mais de 24.5' },
          { id: 11, price: 1.95, oddStatus: 0, name: 'Menos de 24.5' },
        ],
      },
      {
        marketId: 2,
        name: 'Vencedor da Partida',
        odds: [{ id: 20, price: 1.5, oddStatus: 0, name: 'Lakers' }],
      },
      {
        marketId: 3,
        name: 'Total de Pontos - Jamal Murray',
        odds: [{ id: 30, price: 2.0, oddStatus: 1, name: 'Mais de 18.5' }],
      },
    ],
  }

  it('traduz mercado mapeado, extrai linha do "Mais de", pareia o under, descarta o resto CONTADO', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO))
    const atributoDoMercado = (nome: string) =>
      nome.startsWith('Total de Pontos') ? ('PONTOS' as const) : undefined
    const [casa] = await casasAltenar(CONFIG, 'tok', atributoDoMercado, buscar, '15979600')
    const cotacoes = await casa!.cotacoes('15979600')

    expect(cotacoes).toHaveLength(1)
    expect(cotacoes[0]).toMatchObject({
      jogadorNomeNaCasa: 'Stephen Curry',
      nomeMercadoNaCasa: 'Total de Pontos - Stephen Curry',
      linha: 25, // 24.5 do lado over → linha inteira do CJ
      oddOver: 1.85,
      oddUnder: 1.95,
      atributo: 'PONTOS',
    })
    // Vencedor da Partida (sem mapa) + Murray (oddStatus 1, suspensa) = 2 descartes.
    expect(casa!.descartadas!()).toBe(2)
  })

  it('linha INTEIRA não atravessa: "Mais de 25" não é a linha 25+ do CJ', async () => {
    const inteira = structuredClone(EVENTO)
    inteira.markets[0]!.odds = [{ id: 10, price: 1.85, oddStatus: 0, name: 'Mais de 25' }]
    const buscar = vi.fn<typeof fetch>(async () => json(inteira))
    const [casa] = await casasAltenar(CONFIG, 'tok', () => 'PONTOS' as const, buscar, '15979600')
    expect(await casa!.cotacoes('15979600')).toHaveLength(0)
  })

  it('o censo lista TUDO — inclusive o mercado que o adapter descartaria', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO))
    const censo = await censoAltenar(CONFIG, 'tok', '15979600', buscar)
    expect(censo.mercados.map((m) => m.nome)).toEqual([
      'Total de Pontos - Stephen Curry',
      'Vencedor da Partida',
      'Total de Pontos - Jamal Murray',
    ])
    // Sem esta linha, "Vencedor da Partida" nunca chegaria à curadoria.
    expect(censo.mercados[1]!.cotacoesAtivas).toBe(1)
    // A suspensa não conta como ativa, mas o mercado aparece.
    expect(censo.mercados[2]!.cotacoesAtivas).toBe(0)
    expect(censo.jogadores).toEqual(['Stephen Curry', 'Jamal Murray'])
  })

  it('pedir outro evento é bug de quem chama', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO))
    const [casa] = await casasAltenar(CONFIG, 'tok', () => undefined, buscar, '15979600')
    await expect(casa!.cotacoes('99')).rejects.toThrow(/fatiada/)
  })
})
