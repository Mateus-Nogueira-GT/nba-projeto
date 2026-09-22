import { describe, expect, it, vi } from 'vitest'

import jogadoresPagina1 from '../__fixtures__/balldontlie-active-players-page-1.json'
import jogadoresPagina2 from '../__fixtures__/balldontlie-active-players-page-2.json'
import jogos from '../__fixtures__/balldontlie-games.json'
import jogoAoVivo from '../__fixtures__/balldontlie-live-game.json'
import jogadoresPorId from '../__fixtures__/balldontlie-players-by-id.json'
import classificacao from '../__fixtures__/balldontlie-standings.json'
import stats from '../__fixtures__/balldontlie-stats.json'
import times from '../__fixtures__/balldontlie-times.json'
import {
  CapacidadeBalldontlieNaoSuportada,
  FonteBalldontlie,
  mapearJogoBalldontlie,
  mapearLinhaStatsBalldontlie,
} from '../balldontlie'

function json(corpo: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function fetchEmSequencia(respostas: Response[]) {
  const chamadas: { url: string; init: RequestInit | undefined }[] = []
  let indice = 0
  const executar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(entrada), init })
    const resposta = respostas[indice]
    indice += 1
    if (resposta === undefined) throw new Error('fixture HTTP esgotada')
    return resposta
  })

  return { fetch: executar as unknown as typeof fetch, chamadas, executar }
}

function fonteCom(
  respostas: Response[],
  extras: Partial<ConstructorParameters<typeof FonteBalldontlie>[0]> = {},
) {
  const http = fetchEmSequencia(respostas)
  return {
    fonte: new FonteBalldontlie({
      chave: 'chave-de-teste',
      fetch: http.fetch,
      dormir: async () => undefined,
      aleatorio: () => 0,
      ...extras,
    }),
    ...http,
  }
}

describe('FonteBalldontlie — contrato oficial GOAT', () => {
  it('usa o namespace formal /nba/v1 e autentica sem Bearer', async () => {
    const { fonte, chamadas } = fonteCom([json(times)])

    await expect(fonte.listarTimes()).resolves.toEqual([
      {
        idExterno: '1',
        sigla: 'ATL',
        nome: 'Atlanta Hawks',
        conferencia: 'East',
        logoUrl: null,
      },
    ])

    expect(chamadas[0]?.url).toBe('https://api.balldontlie.io/nba/v1/teams')
    expect(new Headers(chamadas[0]?.init?.headers).get('authorization')).toBe('chave-de-teste')
  })

  it('percorre next_cursor e converte elenco ativo sem inventar foto', async () => {
    const { fonte, chamadas } = fonteCom([json(jogadoresPagina1), json(jogadoresPagina2)])

    const jogadores = await fonte.listarJogadores()

    expect(jogadores).toHaveLength(2)
    expect(jogadores[0]).toMatchObject({
      idExterno: '115',
      nomeCompleto: 'Stephen Curry',
      timeSiglaProvedor: 'GSW',
      alturaCm: 188,
      numeroCamisa: 30,
      fotoUrl: null,
      ativo: true,
    })
    expect(jogadores[1]).toMatchObject({ idExterno: '246', alturaCm: 211 })
    expect(chamadas[1]?.url).toContain('per_page=100&cursor=115')
  })

  it('preserva rodada, instante, relógio e status normalizado do jogo', async () => {
    const { fonte } = fonteCom([json(jogos)])

    await expect(fonte.listarJogos('2025-01-05')).resolves.toEqual([
      {
        idExterno: '15907925',
        dataReferencia: '2025-01-05',
        dataHoraUtc: '2025-01-05T23:00:00.000Z',
        timeCasaSigla: 'CLE',
        timeVisitanteSigla: 'CHA',
        status: 'ENCERRADO',
        quartoAtual: 4,
        relogio: 'Final',
        intervalo: false,
        placarCasa: 115,
        placarVisitante: 105,
      },
    ])
  })

  it('marca intervalo sem inferir um estado diferente de AO_VIVO', () => {
    const bruto = structuredClone(jogoAoVivo.data)
    bruto.status = 'Halftime'
    bruto.time = ' '

    expect(mapearJogoBalldontlie(bruto)).toMatchObject({
      status: 'AO_VIVO',
      relogio: null,
      intervalo: true,
    })
  })

  it('rejeita status desconhecido em vez de tratá-lo como agendado', () => {
    const bruto = { ...structuredClone(jogoAoVivo.data), status_state: 'unknown' }

    expect(() => mapearJogoBalldontlie(bruto)).toThrow(/status_state desconhecido/)
  })

  it('valida relações aritméticas no payload de stats', () => {
    const bruto = { ...structuredClone(stats.data[0]), fg3m: 8, fgm: 7 }

    expect(() => mapearLinhaStatsBalldontlie(bruto, null)).toThrow(/três pontos/)
  })

  it('durante o Q1 materializa total e split a partir do mesmo acumulado oficial', async () => {
    const { fonte, chamadas } = fonteCom([json(jogoAoVivo), json(stats)])

    const linhas = await fonte.boxScore('18446820')

    expect(linhas).toHaveLength(2)
    expect(linhas.map((linha) => linha.quarto)).toEqual([null, 1])
    expect(linhas[0]).toMatchObject({
      jogadorIdExterno: '70',
      minutos: 30,
      pontos: 23,
      doisC: 2,
      doisT: 9,
      tresC: 5,
      saldoQuadra: 23,
    })
    expect(chamadas[1]?.url).toContain('/stats?game_ids[]=18446820&period=0&per_page=100')
  })

  it('rejeita stats que atravessem o namespace do ID de jogo solicitado', async () => {
    const statsDeOutroJogo = structuredClone(stats)
    statsDeOutroJogo.data[0]!.game.id = 999
    const { fonte } = fonteCom([json(jogoAoVivo), json(statsDeOutroJogo)])

    await expect(fonte.boxScore('18446820')).rejects.toThrow(/ID incompatível 999/)
  })

  it('converte o rótulo canônico 2024-25 no ano inicial exigido pelo provedor', async () => {
    const { fonte, chamadas } = fonteCom([json(classificacao)])

    await expect(fonte.classificacao('2024-25')).resolves.toEqual([
      {
        timeSigla: 'CLE',
        conferencia: 'East',
        vitorias: 64,
        derrotas: 18,
        posicao: 1,
        aproveitamento: 64 / 82,
        sequencia: null,
      },
    ])
    expect(chamadas[0]?.url.endsWith('/standings?season=2024')).toBe(true)
  })

  it('respeita Retry-After no 429 e usa backoff no 5xx', async () => {
    const dormir = vi.fn(async (_ms: number) => undefined)
    const { fonte, executar } = fonteCom(
      [
        json({}, { status: 429, headers: { 'retry-after': '2' } }),
        json({}, { status: 503 }),
        json(times),
      ],
      { dormir, atrasoBaseMs: 300, maxTentativas: 3 },
    )

    await expect(fonte.listarTimes()).resolves.toHaveLength(1)
    expect(executar).toHaveBeenCalledTimes(3)
    expect(dormir.mock.calls).toEqual([[2_000], [600]])
  })

  it('não repete erro de autenticação', async () => {
    const dormir = vi.fn(async (_ms: number) => undefined)
    const { fonte, executar } = fonteCom([json({}, { status: 401 })], { dormir })

    await expect(fonte.listarTimes()).rejects.toThrow(/HTTP 401/)
    expect(executar).toHaveBeenCalledTimes(1)
    expect(dormir).not.toHaveBeenCalled()
  })

  it('repete timeout de forma limitada e não expõe a chave no erro', async () => {
    const executar = vi.fn(
      async (_entrada: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolver, rejeitar) => {
          init?.signal?.addEventListener('abort', () =>
            rejeitar(new DOMException('Abort', 'AbortError')),
          )
        }),
    )
    const fonte = new FonteBalldontlie({
      chave: 'segredo-que-nao-pode-vazar',
      fetch: executar as unknown as typeof fetch,
      timeoutMs: 5,
      maxTentativas: 2,
      dormir: async () => undefined,
    })

    const erro = await fonte.listarTimes().catch((causa: unknown) => causa)

    expect(executar).toHaveBeenCalledTimes(2)
    expect(erro).toBeInstanceOf(Error)
    expect(String(erro)).toContain('timeout')
    expect(String(erro)).not.toContain('segredo-que-nao-pode-vazar')
  })

  it('payload ausente ou malformado nunca vira lista vazia', async () => {
    const { fonte } = fonteCom([json({ meta: { per_page: 25 } })])

    await expect(fonte.listarTimes()).rejects.toThrow(/resposta.*inválido/)
  })

  it('resolve jogadores por id e os marca como fora da liga', async () => {
    const { fonte, chamadas } = fonteCom([json(jogadoresPorId)])

    const resolvidos = await fonte.jogadoresPorId(['666969', '38017703'])

    expect(resolvidos).toHaveLength(2)
    expect(resolvidos[0]).toMatchObject({
      idExterno: '666969',
      nomeCompleto: 'Dennis Schroder',
      timeSiglaProvedor: 'CHA',
      numeroCamisa: 17,
      // Foi preciso buscar por id justamente porque /players/active não o trouxe.
      ativo: false,
    })
    expect(chamadas[0]?.url).toContain('player_ids[]=666969')
    expect(chamadas[0]?.url).toContain('player_ids[]=38017703')
  })

  it('id que o provedor também não conhece some da resposta, sem lançar', async () => {
    const { fonte } = fonteCom([json({ data: [], meta: { next_cursor: null, per_page: 100 } })])

    await expect(fonte.jogadoresPorId(['999999999'])).resolves.toEqual([])
  })

  it('parte lote grande em páginas de 100 ids', async () => {
    const vazio = { data: [], meta: { next_cursor: null, per_page: 100 } }
    const { fonte, chamadas } = fonteCom([json(jogadoresPorId), json(vazio), json(vazio)])

    const ids = Array.from({ length: 250 }, (_, i) => String(i + 1))
    await fonte.jogadoresPorId(ids)

    expect(chamadas).toHaveLength(3)
    expect(chamadas[0]?.url.match(/player_ids\[\]=/g)).toHaveLength(100)
    expect(chamadas[2]?.url.match(/player_ids\[\]=/g)).toHaveLength(50)
  })

  it('lista vazia não faz requisição nenhuma', async () => {
    const { fonte, chamadas } = fonteCom([])

    await expect(fonte.jogadoresPorId([])).resolves.toEqual([])
    expect(chamadas).toHaveLength(0)
  })

  it('falha explicitamente nas duas capacidades que o contrato oficial não cobre', async () => {
    const { fonte } = fonteCom([])

    await expect(fonte.boxScoreDoTime('1')).rejects.toBeInstanceOf(
      CapacidadeBalldontlieNaoSuportada,
    )
    await expect(fonte.escalacao('1')).rejects.toBeInstanceOf(CapacidadeBalldontlieNaoSuportada)
  })
})
