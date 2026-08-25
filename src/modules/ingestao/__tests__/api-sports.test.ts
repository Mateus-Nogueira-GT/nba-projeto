import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ErroApiSports, FonteApiSports } from '../nba/adaptadores/api-sports'

type Envelope = {
  get: string
  parameters: unknown[] | Record<string, unknown>
  errors: unknown[] | Record<string, unknown>
  results: number
  paging: { current: number; total: number }
  response: unknown[]
}

function fixture(nome: string): Envelope {
  const caminho = resolve(
    process.cwd(),
    'src/modules/ingestao/__tests__/fixtures/api-sports',
    `${nome}.json`,
  )
  return JSON.parse(readFileSync(caminho, 'utf8')) as Envelope
}

function resposta(corpo: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function fonteComRotas(
  rotas: Record<string, Envelope>,
  observar?: (url: URL, init?: RequestInit) => void,
): FonteApiSports {
  return new FonteApiSports({
    chave: 'chave-de-teste',
    tentativasExtras: 0,
    fetch: vi.fn(async (entrada, init) => {
      const url = new URL(String(entrada))
      observar?.(url, init)
      const corpo = rotas[url.pathname]
      if (!corpo) return resposta({}, 404)
      return resposta(corpo)
    }),
  })
}

describe('adapter API-SPORTS — API-NBA v2', () => {
  it('usa o host e o header oficiais sem expor a chave na URL', async () => {
    let chamada: { url: URL; init?: RequestInit } | undefined
    const fonte = fonteComRotas({ '/teams': fixture('teams') }, (url, init) => {
      chamada = { url, init }
    })

    await expect(fonte.listarTimes()).resolves.toEqual([
      {
        idExterno: '17',
        sigla: 'LAL',
        nome: 'Los Angeles Lakers',
        conferencia: 'West',
        logoUrl: 'https://media.api-sports.io/basketball/teams/17.png',
      },
    ])

    expect(chamada?.url.origin).toBe('https://v2.nba.api-sports.io')
    expect(chamada?.url.searchParams.get('league')).toBe('standard')
    expect(chamada?.url.href).not.toContain('chave-de-teste')
    expect(new Headers(chamada?.init?.headers).get('x-apisports-key')).toBe('chave-de-teste')
  })

  it('traduz jogadores sem inventar time ou foto ausentes no contrato', async () => {
    const fonte = fonteComRotas({ '/players': fixture('players') })

    await expect(fonte.listarJogadores()).resolves.toEqual([
      {
        idExterno: '265',
        nomeCompleto: 'LeBron James',
        timeSiglaProvedor: null,
        posicao: 'F',
        alturaCm: 206,
        numeroCamisa: 23,
        fotoUrl: null,
        ativo: true,
      },
    ])
  })

  it('mapeia instante UTC, status e placar do snapshot do jogo', async () => {
    const fonte = fonteComRotas({ '/games': fixture('games') })

    await expect(fonte.listarJogos('2026-01-15')).resolves.toEqual([
      {
        idExterno: '10403',
        dataReferencia: '2026-01-15',
        dataHoraUtc: '2026-01-16T00:30:00.000Z',
        timeCasaSigla: 'LAL',
        timeVisitanteSigla: 'BOS',
        status: 'AO_VIVO',
        quartoAtual: 1,
        relogio: '04:22',
        intervalo: false,
        placarCasa: 24,
        placarVisitante: 21,
      },
    ])
  })

  it('mapeia box score integral sem inventar split por quarto ou regra de DNP', async () => {
    const corpo = structuredClone(fixture('player-statistics'))
    const fonte = fonteComRotas({ '/players/statistics': corpo })

    await expect(fonte.boxScore('10403')).resolves.toEqual([
      {
        jogadorIdExterno: '265',
        quarto: null,
        minutos: 8.5,
        pontos: 12,
        rebotes: 3,
        rebotesOf: 1,
        rebotesDef: 2,
        assistencias: 4,
        roubos: 1,
        bloqueios: 0,
        turnovers: 2,
        faltas: 1,
        cestasC: 5,
        cestasT: 7,
        doisC: 3,
        doisT: 4,
        tresC: 2,
        tresT: 3,
        lanceC: 0,
        lanceT: 0,
        saldoQuadra: 5,
      },
    ])

    const dnp = structuredClone(fixture('player-statistics'))
    const linha = dnp.response[0] as Record<string, unknown>
    linha.min = null
    linha.comment = "DNP - Coach's Decision"
    const fonteDnp = fonteComRotas({ '/players/statistics': dnp })
    expect((await fonteDnp.boxScore('10403'))[0]?.minutos).toBeNull()
  })

  it('combina estatística do time com o linescore oficial do jogo', async () => {
    const jogo = structuredClone(fixture('games'))
    const respostaJogo = jogo.response[0] as {
      scores: { home: { linescore: string[] } }
    }
    respostaJogo.scores.home.linescore = ['24', '30', '25', '27', '12', '8']
    const stats = structuredClone(fixture('game-statistics'))
    const estatistica = (stats.response[0] as { statistics: Array<Record<string, unknown>> })
      .statistics[0]!
    estatistica.points = 126

    const fonte = fonteComRotas({
      '/games/statistics': stats,
      '/games': jogo,
    })

    const [linha] = await fonte.boxScoreDoTime('10403')
    expect(linha).toMatchObject({
      timeSigla: 'LAL',
      pontos: 126,
      pontosQ1: 24,
      pontosQ2: 30,
      pontosQ3: 25,
      pontosQ4: 27,
      pontosProrrogacao: 20,
      rebotesTotal: 10,
    })
  })

  it('traduz classificação usando o ano inicial da temporada', async () => {
    let chamada: URL | undefined
    const fonte = fonteComRotas({ '/standings': fixture('standings') }, (url) => {
      chamada = url
    })

    await expect(fonte.classificacao('2025-26')).resolves.toEqual([
      {
        timeSigla: 'LAL',
        conferencia: 'west',
        vitorias: 29,
        derrotas: 16,
        posicao: 4,
        aproveitamento: 0.644,
        sequencia: 'V3',
      },
    ])
    expect(chamada?.searchParams.get('season')).toBe('2025')
    expect(chamada?.searchParams.get('league')).toBe('standard')
  })

  it('declara escalação como não suportada sem fazer chamada HTTP', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const fonte = new FonteApiSports({ chave: 'teste', fetch: fetchMock })

    await expect(fonte.escalacao('10403')).rejects.toThrow(/não documenta a capacidade/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejeita payload malformado e nunca converte ausência em zero válido', async () => {
    const corpo = structuredClone(fixture('player-statistics'))
    delete (corpo.response[0] as Record<string, unknown>).points
    const fonte = fonteComRotas({ '/players/statistics': corpo })

    await expect(fonte.boxScore('10403')).rejects.toThrow(/payload inválido/)
  })

  it('falha quando o provedor anuncia mais páginas sem paginação homologada', async () => {
    const corpo = structuredClone(fixture('players'))
    corpo.paging.total = 2
    const fonte = fonteComRotas({ '/players': corpo })

    await expect(fonte.listarJogadores()).rejects.toThrow(/paginação não homologada/)
  })

  it('rejeita status desconhecido em vez de classificá-lo como agendado', async () => {
    const corpo = structuredClone(fixture('games'))
    ;(corpo.response[0] as { status: { short: number } }).status.short = 9
    const fonte = fonteComRotas({ '/games': corpo })

    await expect(fonte.listarJogos('2026-01-15')).rejects.toThrow(/status desconhecido/)
  })

  it('respeita Retry-After no 429 e repete somente o limite configurado', async () => {
    const esperas: number[] = []
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        resposta({ errors: { rateLimit: 'Too many requests' } }, 429, { 'retry-after': '2' }),
      )
      .mockResolvedValueOnce(resposta(fixture('teams')))
    const fonte = new FonteApiSports({
      chave: 'teste',
      fetch: fetchMock,
      tentativasExtras: 1,
      dormir: async (ms) => {
        esperas.push(ms)
      },
    })

    await expect(fonte.listarTimes()).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(esperas).toEqual([2000])
  })

  it('repete 5xx com backoff limitado antes de aceitar o snapshot', async () => {
    const esperas: number[] = []
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resposta({}, 500))
      .mockResolvedValueOnce(resposta({}, 503))
      .mockResolvedValueOnce(resposta(fixture('players')))
    const fonte = new FonteApiSports({
      chave: 'teste',
      fetch: fetchMock,
      tentativasExtras: 2,
      esperaBaseMs: 100,
      aleatorio: () => 0,
      dormir: async (ms) => {
        esperas.push(ms)
      },
    })

    await expect(fonte.listarJogadores()).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(esperas).toEqual([100, 200])
  })

  it('aborta uma chamada que ultrapassa o timeout configurado', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_entrada, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Abortado', 'AbortError'))
        })
      })
    })
    const fonte = new FonteApiSports({
      chave: 'teste',
      fetch: fetchMock,
      timeoutMs: 5,
      tentativasExtras: 0,
    })

    await expect(fonte.listarTimes()).rejects.toThrow(/falha de timeout/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('não repete 401/403 e não inclui corpo externo no erro', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(resposta({ segredo: 'não pode vazar' }, 403))
    const fonte = new FonteApiSports({ chave: 'teste', fetch: fetchMock, tentativasExtras: 2 })

    let erro: unknown
    try {
      await fonte.listarTimes()
    } catch (causa) {
      erro = causa
    }

    expect(erro).toBeInstanceOf(ErroApiSports)
    expect(String(erro)).toContain('HTTP 403')
    expect(String(erro)).not.toContain('não pode vazar')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
