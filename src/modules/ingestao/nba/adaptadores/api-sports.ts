import { z } from 'zod'

import { CapacidadeNaoSuportadaError } from '../porta'
import type {
  EscalacaoExterna,
  FonteNBA,
  JogadorExterno,
  JogoExterno,
  LinhaBoxScore,
  LinhaBoxScoreTimeExterna,
  LinhaClassificacaoExterna,
  TimeExterno,
} from '../porta'

const BASE_URL_API_NBA = 'https://v2.nba.api-sports.io'

const identificador = z.union([z.number().int().nonnegative(), z.string().min(1)])
const numeroApi = z.union([z.number(), z.string().min(1)]).transform((valor, contexto) => {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(numero)) {
    contexto.addIssue({ code: 'custom', message: 'número inválido' })
    return z.NEVER
  }
  return numero
})
const inteiroApi = numeroApi.pipe(z.number().int())
const textoNulo = z.string().nullable()

const timeResumidoSchema = z
  .object({
    id: identificador,
    name: z.string().min(1),
    nickname: z.string().nullable().optional(),
    code: z.string().min(1),
    logo: z.string().url().nullable(),
  })
  .passthrough()

const timeSchema = z
  .object({
    id: identificador,
    name: z.string().min(1),
    nickname: z.string().nullable().optional(),
    code: z.string().min(1),
    city: z.string().nullable().optional(),
    logo: z.string().url().nullable(),
    allStar: z.boolean(),
    nbaFranchise: z.boolean(),
    leagues: z
      .object({
        standard: z
          .object({
            conference: z.string().nullable(),
            division: z.string().nullable(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough()

const jogadorSchema = z
  .object({
    id: identificador,
    firstname: z.string(),
    lastname: z.string(),
    height: z
      .object({
        feets: z.string().nullable().optional(),
        inches: z.string().nullable().optional(),
        meters: z.string().nullable(),
      })
      .passthrough(),
    leagues: z
      .object({
        standard: z
          .object({
            jersey: z.union([z.number(), z.string()]).nullable(),
            active: z.boolean(),
            pos: z.string().nullable(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough()

const jogoSchema = z
  .object({
    id: identificador,
    date: z
      .object({
        start: z.string().datetime({ offset: true }),
        end: z.string().datetime({ offset: true }).nullable().optional(),
        duration: z.string().nullable().optional(),
      })
      .passthrough(),
    status: z
      .object({
        clock: z.string().nullable(),
        halftime: z.boolean(),
        short: z.number().int(),
        long: z.string().min(1),
      })
      .passthrough(),
    periods: z
      .object({
        current: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        endOfPeriod: z.boolean(),
      })
      .passthrough(),
    teams: z
      .object({
        visitors: timeResumidoSchema,
        home: timeResumidoSchema,
      })
      .passthrough(),
    scores: z
      .object({
        visitors: z
          .object({
            linescore: z.array(z.union([z.number(), z.string()])),
            points: inteiroApi.nullable(),
          })
          .passthrough(),
        home: z
          .object({
            linescore: z.array(z.union([z.number(), z.string()])),
            points: inteiroApi.nullable(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()

const estatisticaJogadorSchema = z
  .object({
    player: z
      .object({ id: identificador, firstname: z.string(), lastname: z.string() })
      .passthrough(),
    team: timeResumidoSchema,
    game: z.object({ id: identificador }).passthrough(),
    min: z.string().nullable(),
    points: inteiroApi,
    fgm: inteiroApi,
    fga: inteiroApi,
    ftm: inteiroApi,
    fta: inteiroApi,
    tpm: inteiroApi,
    tpa: inteiroApi,
    offReb: inteiroApi,
    defReb: inteiroApi,
    totReb: inteiroApi,
    assists: inteiroApi,
    pFouls: inteiroApi,
    steals: inteiroApi,
    turnovers: inteiroApi,
    blocks: inteiroApi,
    plusMinus: numeroApi.nullable(),
    comment: textoNulo.optional(),
  })
  .passthrough()

const estatisticaTimeSchema = z
  .object({
    team: timeResumidoSchema,
    statistics: z.array(
      z
        .object({
          points: inteiroApi,
          fgm: inteiroApi,
          fga: inteiroApi,
          ftm: inteiroApi,
          fta: inteiroApi,
          tpm: inteiroApi,
          tpa: inteiroApi,
          offReb: inteiroApi,
          defReb: inteiroApi,
          totReb: inteiroApi,
          assists: inteiroApi,
          pFouls: inteiroApi,
          steals: inteiroApi,
          turnovers: inteiroApi,
          blocks: inteiroApi,
        })
        .passthrough(),
    ),
  })
  .passthrough()

const classificacaoSchema = z
  .object({
    league: z.string().min(1),
    season: z.number().int(),
    team: timeResumidoSchema,
    conference: z
      .object({
        name: z.string().nullable(),
        rank: inteiroApi.nullable(),
      })
      .passthrough(),
    win: z
      .object({
        total: inteiroApi,
        percentage: numeroApi.nullable(),
      })
      .passthrough(),
    loss: z.object({ total: inteiroApi }).passthrough(),
    streak: inteiroApi.nullable(),
    winStreak: z.boolean(),
  })
  .passthrough()

const parametrosSchema = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
const errosSchema = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())])

export type ConfigApiSports = {
  chave: string
  nome?: string
  baseUrl?: string
  timeoutMs?: number
  tentativasExtras?: number
  esperaBaseMs?: number
  fetch?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  aleatorio?: () => number
}

export class ErroApiSports extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ErroApiSports'
  }
}

/** Adapter homologado para o produto API-NBA v2 da API-SPORTS. */
export class FonteApiSports implements FonteNBA {
  readonly nome: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly tentativasExtras: number
  private readonly esperaBaseMs: number
  private readonly fetchImpl: typeof fetch
  private readonly dormir: (ms: number) => Promise<void>
  private readonly aleatorio: () => number

  constructor(private readonly config: ConfigApiSports) {
    if (!config.chave.trim()) throw new Error('API-SPORTS: chave ausente')

    this.nome = config.nome ?? 'api-sports'
    this.baseUrl = (config.baseUrl ?? BASE_URL_API_NBA).replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? 8000
    this.tentativasExtras = config.tentativasExtras ?? 2
    this.esperaBaseMs = config.esperaBaseMs ?? 500
    this.fetchImpl = config.fetch ?? fetch
    this.dormir = config.dormir ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.aleatorio = config.aleatorio ?? Math.random
  }

  async listarTimes(): Promise<TimeExterno[]> {
    const times = await this.buscar('/teams', { league: 'standard' }, timeSchema)
    return times.filter((time) => time.nbaFranchise && !time.allStar).map(mapearTimeApiSports)
  }

  async listarJogadores(): Promise<JogadorExterno[]> {
    const jogadores = await this.buscar('/players', {}, jogadorSchema)
    return jogadores.map(mapearJogadorApiSports)
  }

  /**
   * O plano não documenta busca de jogador por id incluindo quem saiu da liga.
   * Inventar um endpoint na reserva é pior que não ter a capacidade: quem
   * chama trata a ausência (`sincronizar/partida.ts`).
   */
  async jogadoresPorId(_idsExternos: string[]): Promise<JogadorExterno[]> {
    throw new CapacidadeNaoSuportadaError(this.nome, 'busca de jogador por id no API-NBA v2')
  }

  async listarJogos(dataIso: string): Promise<JogoExterno[]> {
    const data = z.iso.date().parse(dataIso)
    const jogos = await this.buscar('/games', { date: data }, jogoSchema)
    return jogos.map((jogo) => mapearJogoApiSports(jogo, data))
  }

  async boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]> {
    const estatisticas = await this.buscar(
      '/players/statistics',
      { game: validarId(jogoIdExterno) },
      estatisticaJogadorSchema,
    )
    return estatisticas.map(mapearEstatisticaJogadorApiSports)
  }

  async boxScoreDoTime(jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]> {
    const id = validarId(jogoIdExterno)
    const [estatisticas, jogos] = await Promise.all([
      this.buscar('/games/statistics', { id }, estatisticaTimeSchema),
      this.buscar('/games', { id }, jogoSchema),
    ])

    if (jogos.length !== 1) {
      throw new ErroApiSports(`${this.nome}: jogo ${id} não retornou identidade única`)
    }
    return mapearEstatisticaTimeApiSports(estatisticas, jogos[0]!)
  }

  async escalacao(_jogoIdExterno: string): Promise<EscalacaoExterna[]> {
    throw new CapacidadeNaoSuportadaError(this.nome, 'escalação/lesões no API-NBA v2')
  }

  async classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]> {
    const ano = normalizarTemporada(temporada)
    const linhas = await this.buscar(
      '/standings',
      { league: 'standard', season: ano },
      classificacaoSchema,
    )
    return linhas.map(mapearClassificacaoApiSports)
  }

  private async buscar<T>(
    caminho: string,
    parametros: Record<string, string | number>,
    itemSchema: z.ZodType<T>,
  ): Promise<T[]> {
    const query = new URLSearchParams(
      Object.entries(parametros).map(([chave, valor]) => [chave, String(valor)]),
    )
    const url = `${this.baseUrl}${caminho}${query.size ? `?${query}` : ''}`
    const totalTentativas = this.tentativasExtras + 1

    for (let tentativa = 0; tentativa < totalTentativas; tentativa += 1) {
      let resposta: Response
      const controlador = new AbortController()
      const timer = setTimeout(() => controlador.abort(), this.timeoutMs)

      try {
        resposta = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'x-apisports-key': this.config.chave },
          signal: controlador.signal,
        })
      } catch (causa) {
        if (tentativa + 1 >= totalTentativas) {
          const motivo = causa instanceof Error && causa.name === 'AbortError' ? 'timeout' : 'rede'
          throw new ErroApiSports(`${this.nome}: falha de ${motivo} em ${caminho}`)
        }
        await this.esperarRetry(tentativa, null)
        continue
      } finally {
        clearTimeout(timer)
      }

      if (resposta.status === 429 || resposta.status >= 500) {
        await resposta.body?.cancel()
        if (tentativa + 1 >= totalTentativas) {
          throw new ErroApiSports(
            `${this.nome}: HTTP ${resposta.status} em ${caminho}`,
            resposta.status,
          )
        }
        await this.esperarRetry(tentativa, resposta.headers.get('retry-after'))
        continue
      }

      if (!resposta.ok) {
        throw new ErroApiSports(
          `${this.nome}: HTTP ${resposta.status} em ${caminho}`,
          resposta.status,
        )
      }

      let corpo: unknown
      try {
        corpo = await resposta.json()
      } catch {
        throw new ErroApiSports(`${this.nome}: JSON inválido em ${caminho}`)
      }

      const envelopeSchema = z
        .object({
          get: z.string(),
          parameters: parametrosSchema,
          errors: errosSchema,
          results: z.number().int().nonnegative(),
          paging: z.object({
            current: z.number().int().positive(),
            total: z.number().int().positive(),
          }),
          response: z.array(itemSchema),
        })
        .strict()
      const analisado = envelopeSchema.safeParse(corpo)
      if (!analisado.success) {
        throw new ErroApiSports(`${this.nome}: payload inválido em ${caminho}`)
      }

      const envelope = analisado.data
      if (temErros(envelope.errors)) {
        throw new ErroApiSports(`${this.nome}: API retornou erro lógico em ${caminho}`)
      }
      if (envelope.get !== caminho.slice(1)) {
        throw new ErroApiSports(`${this.nome}: endpoint divergente no payload de ${caminho}`)
      }
      if (envelope.results !== envelope.response.length) {
        throw new ErroApiSports(`${this.nome}: contagem divergente em ${caminho}`)
      }
      if (envelope.paging.current !== 1 || envelope.paging.total !== 1) {
        throw new ErroApiSports(
          `${this.nome}: paginação não homologada em ${caminho} (${envelope.paging.current}/${envelope.paging.total})`,
        )
      }
      return envelope.response
    }

    throw new ErroApiSports(`${this.nome}: tentativas esgotadas em ${caminho}`)
  }

  private async esperarRetry(tentativa: number, retryAfter: string | null): Promise<void> {
    const recomendado = retryAfterMs(retryAfter)
    const exponencial = this.esperaBaseMs * 2 ** tentativa
    const jitter = Math.floor(this.aleatorio() * Math.max(1, this.esperaBaseMs))
    await this.dormir(Math.min(60_000, recomendado ?? exponencial + jitter))
  }
}

export function criarFonteApiSports(config: ConfigApiSports): FonteApiSports {
  return new FonteApiSports(config)
}

export function mapearTimeApiSports(time: z.infer<typeof timeSchema>): TimeExterno {
  return {
    idExterno: String(time.id),
    sigla: time.code,
    nome: time.name,
    conferencia: time.leagues.standard?.conference ?? null,
    logoUrl: time.logo,
  }
}

export function mapearJogadorApiSports(jogador: z.infer<typeof jogadorSchema>): JogadorExterno {
  const liga = jogador.leagues.standard
  const alturaMetros = jogador.height.meters === null ? null : Number(jogador.height.meters)
  const alturaCm =
    alturaMetros !== null && Number.isFinite(alturaMetros) ? alturaMetros * 100 : null
  const camisa = liga?.jersey === null || liga?.jersey === undefined ? null : Number(liga.jersey)

  return {
    idExterno: String(jogador.id),
    nomeCompleto: `${jogador.firstname} ${jogador.lastname}`.trim(),
    timeSiglaProvedor: null,
    posicao: liga?.pos ?? null,
    alturaCm,
    numeroCamisa: camisa !== null && Number.isInteger(camisa) ? camisa : null,
    fotoUrl: null,
    ativo: liga?.active ?? false,
  }
}

export function mapearJogoApiSports(
  jogo: z.infer<typeof jogoSchema>,
  dataReferencia: string,
): JogoExterno {
  const status = mapearStatus(jogo.status.short)
  return {
    idExterno: String(jogo.id),
    dataReferencia: z.iso.date().parse(dataReferencia),
    dataHoraUtc: new Date(jogo.date.start).toISOString(),
    timeCasaSigla: jogo.teams.home.code,
    timeVisitanteSigla: jogo.teams.visitors.code,
    status,
    quartoAtual: status === 'AGENDADO' ? null : jogo.periods.current,
    relogio: jogo.status.clock,
    intervalo: jogo.status.halftime,
    placarCasa: jogo.scores.home.points,
    placarVisitante: jogo.scores.visitors.points,
  }
}

export function mapearEstatisticaJogadorApiSports(
  linha: z.infer<typeof estatisticaJogadorSchema>,
): LinhaBoxScore {
  const minutos = linha.min === null ? null : minutosDecimais(linha.min)
  const doisC = linha.fgm - linha.tpm
  const doisT = linha.fga - linha.tpa
  if (doisC < 0 || doisT < 0) throw new ErroApiSports('api-sports: arremessos inconsistentes')

  return {
    jogadorIdExterno: String(linha.player.id),
    // Api-sports ainda não traduz o time da linha aqui (fora do escopo desta
    // tarefa) — igual a qualquer outro adaptador que não preenche o campo.
    timeSiglaExterna: null,
    quarto: null,
    minutos,
    pontos: linha.points,
    rebotes: linha.totReb,
    rebotesOf: linha.offReb,
    rebotesDef: linha.defReb,
    assistencias: linha.assists,
    roubos: linha.steals,
    bloqueios: linha.blocks,
    turnovers: linha.turnovers,
    faltas: linha.pFouls,
    cestasC: linha.fgm,
    cestasT: linha.fga,
    doisC,
    doisT,
    tresC: linha.tpm,
    tresT: linha.tpa,
    lanceC: linha.ftm,
    lanceT: linha.fta,
    saldoQuadra: linha.plusMinus,
  }
}

export function mapearEstatisticaTimeApiSports(
  linhas: z.infer<typeof estatisticaTimeSchema>[],
  jogo: z.infer<typeof jogoSchema>,
): LinhaBoxScoreTimeExterna[] {
  const placares = new Map([
    [String(jogo.teams.home.id), jogo.scores.home.linescore],
    [String(jogo.teams.visitors.id), jogo.scores.visitors.linescore],
  ])

  return linhas.map((linha) => {
    if (linha.statistics.length !== 1) {
      throw new ErroApiSports(
        `api-sports: estatística do time ${linha.team.id} não retornou bloco único`,
      )
    }
    const estatistica = linha.statistics[0]!
    const porQuarto = placares.get(String(linha.team.id))
    if (!porQuarto) throw new ErroApiSports(`api-sports: time ${linha.team.id} fora do jogo`)
    const pontos = porQuarto.map((valor) => inteiroSeguro(valor, 'placar por quarto'))
    if (pontos.length < 4) {
      throw new ErroApiSports(`api-sports: linescore incompleto para o time ${linha.team.id}`)
    }

    return {
      timeSigla: linha.team.code,
      pontos: estatistica.points,
      pontosQ1: pontos[0]!,
      pontosQ2: pontos[1]!,
      pontosQ3: pontos[2]!,
      pontosQ4: pontos[3]!,
      pontosProrrogacao: pontos.slice(4).reduce((total, valor) => total + valor, 0),
      rebotesTotal: estatistica.totReb,
      rebotesOf: estatistica.offReb,
      rebotesDef: estatistica.defReb,
      assistencias: estatistica.assists,
      cestasC: estatistica.fgm,
      cestasT: estatistica.fga,
      tresC: estatistica.tpm,
      tresT: estatistica.tpa,
      lanceC: estatistica.ftm,
      lanceT: estatistica.fta,
      roubos: estatistica.steals,
      bloqueios: estatistica.blocks,
      turnovers: estatistica.turnovers,
      faltas: estatistica.pFouls,
    }
  })
}

export function mapearClassificacaoApiSports(
  linha: z.infer<typeof classificacaoSchema>,
): LinhaClassificacaoExterna {
  return {
    timeSigla: linha.team.code,
    conferencia: linha.conference.name,
    vitorias: linha.win.total,
    derrotas: linha.loss.total,
    posicao: linha.conference.rank,
    aproveitamento: linha.win.percentage,
    sequencia:
      linha.streak === null ? null : `${linha.winStreak ? 'V' : 'D'}${Math.abs(linha.streak)}`,
  }
}

function mapearStatus(status: number): JogoExterno['status'] {
  if (status === 1) return 'AGENDADO'
  if (status === 2) return 'AO_VIVO'
  if (status === 3) return 'ENCERRADO'
  throw new ErroApiSports(`api-sports: status desconhecido (${status})`)
}

function minutosDecimais(valor: string): number {
  const partes = /^(\d+):(\d{2})$/.exec(valor)
  if (!partes) throw new ErroApiSports(`api-sports: minutos inválidos (${valor})`)
  const minutos = Number(partes[1])
  const segundos = Number(partes[2])
  if (segundos > 59) throw new ErroApiSports(`api-sports: minutos inválidos (${valor})`)
  return minutos + segundos / 60
}

function normalizarTemporada(temporada: string): number {
  const correspondencia = /^(\d{4})(?:-\d{2,4})?$/.exec(temporada)
  if (!correspondencia) throw new ErroApiSports(`api-sports: temporada inválida (${temporada})`)
  return Number(correspondencia[1])
}

function validarId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new ErroApiSports('api-sports: id externo inválido')
  return id
}

function inteiroSeguro(valor: string | number, campo: string): number {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isInteger(numero)) throw new ErroApiSports(`api-sports: ${campo} inválido`)
  return numero
}

function temErros(erros: z.infer<typeof errosSchema>): boolean {
  return Array.isArray(erros) ? erros.length > 0 : Object.keys(erros).length > 0
}

function retryAfterMs(valor: string | null): number | null {
  if (!valor) return null
  const segundos = Number(valor)
  if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000
  const data = Date.parse(valor)
  if (!Number.isFinite(data)) return null
  return Math.max(0, data - Date.now())
}
