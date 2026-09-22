import { z, type ZodType } from 'zod'

import {
  CapacidadeNaoSuportadaError,
  type EscalacaoExterna,
  type FonteNBA,
  type JogadorExterno,
  type JogoExterno,
  type LinhaBoxScore,
  type LinhaBoxScoreTimeExterna,
  type LinhaClassificacaoExterna,
  type TimeExterno,
} from '../porta'

const BASE_URL = 'https://api.balldontlie.io/nba/v1'

const dataIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const textoSchema = z.string().min(1)
const inteiroNaoNegativoSchema = z.number().int().nonnegative()

const timeSchema = z
  .object({
    id: z.number().int().positive(),
    conference: textoSchema.nullable(),
    division: textoSchema.nullable(),
    city: textoSchema,
    name: textoSchema,
    full_name: textoSchema,
    abbreviation: textoSchema,
  })
  .passthrough()

const jogadorSchema = z
  .object({
    id: z.number().int().positive(),
    first_name: textoSchema,
    last_name: textoSchema,
    position: textoSchema.nullable(),
    height: textoSchema.nullable(),
    jersey_number: textoSchema.nullable(),
    team: timeSchema,
  })
  .passthrough()

const jogadorStatsSchema = z
  .object({
    id: z.number().int().positive(),
    first_name: textoSchema,
    last_name: textoSchema,
    position: textoSchema.nullable(),
  })
  .passthrough()

const estadoJogoSchema = z.enum([
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled',
  'delayed',
  'suspended',
  'abandoned',
  'unknown',
])

const jogoSchema = z
  .object({
    id: z.number().int().positive(),
    date: dataIsoSchema,
    season: z.number().int(),
    status: textoSchema,
    status_state: estadoJogoSchema,
    period: inteiroNaoNegativoSchema,
    time: z.string(),
    postseason: z.boolean(),
    home_team_score: inteiroNaoNegativoSchema,
    visitor_team_score: inteiroNaoNegativoSchema,
    datetime: z.string().datetime({ offset: true }),
    home_team: timeSchema,
    visitor_team: timeSchema,
  })
  .passthrough()

const linhaStatsSchema = z
  .object({
    id: z.number().int().positive(),
    min: textoSchema,
    fgm: inteiroNaoNegativoSchema,
    fga: inteiroNaoNegativoSchema,
    fg3m: inteiroNaoNegativoSchema,
    fg3a: inteiroNaoNegativoSchema,
    ftm: inteiroNaoNegativoSchema,
    fta: inteiroNaoNegativoSchema,
    oreb: inteiroNaoNegativoSchema,
    dreb: inteiroNaoNegativoSchema,
    reb: inteiroNaoNegativoSchema,
    ast: inteiroNaoNegativoSchema,
    stl: inteiroNaoNegativoSchema,
    blk: inteiroNaoNegativoSchema,
    turnover: inteiroNaoNegativoSchema,
    pf: inteiroNaoNegativoSchema,
    pts: inteiroNaoNegativoSchema,
    plus_minus: z.number().nullable(),
    player: jogadorStatsSchema,
    team: timeSchema,
    game: z.object({ id: z.number().int().positive() }).passthrough(),
  })
  .superRefine((linha, contexto) => {
    if (linha.fgm > linha.fga) {
      contexto.addIssue({ code: 'custom', message: 'fgm não pode exceder fga', path: ['fgm'] })
    }
    if (linha.fg3m > linha.fg3a || linha.fg3m > linha.fgm || linha.fg3a > linha.fga) {
      contexto.addIssue({
        code: 'custom',
        message: 'estatísticas de três pontos são incompatíveis com os arremessos totais',
        path: ['fg3m'],
      })
    }
    if (linha.ftm > linha.fta) {
      contexto.addIssue({ code: 'custom', message: 'ftm não pode exceder fta', path: ['ftm'] })
    }
  })

const classificacaoSchema = z
  .object({
    team: timeSchema,
    conference_rank: z.number().int().positive(),
    wins: inteiroNaoNegativoSchema,
    losses: inteiroNaoNegativoSchema,
    season: z.number().int(),
  })
  .passthrough()

const metaSchema = z
  .object({
    next_cursor: z.number().int().positive().nullable().optional(),
    per_page: z.number().int().positive().max(100),
  })
  .passthrough()

function respostaListaSchema<T>(item: ZodType<T>) {
  return z
    .object({
      data: z.array(item),
      meta: metaSchema.optional(),
    })
    .passthrough()
}

const respostaJogoSchema = z.object({ data: jogoSchema }).passthrough()

export type ConfigBalldontlie = {
  chave: string
  baseUrl?: string
  timeoutMs?: number
  maxTentativas?: number
  atrasoBaseMs?: number
  fetch?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  aleatorio?: () => number
}

type ConfigNormalizada = {
  chave: string
  baseUrl: string
  timeoutMs: number
  maxTentativas: number
  atrasoBaseMs: number
  fetch: typeof fetch
  dormir: (ms: number) => Promise<void>
  aleatorio: () => number
}

export class ErroBalldontlie extends Error {
  constructor(message: string) {
    super(`balldontlie: ${message}`)
    this.name = 'ErroBalldontlie'
  }
}

export class CapacidadeBalldontlieNaoSuportada extends CapacidadeNaoSuportadaError {
  readonly motivo: string

  constructor(capacidade: string, motivo: string) {
    super('balldontlie', capacidade)
    this.motivo = motivo
    this.message = `${this.message}: ${motivo}`
    this.name = 'CapacidadeBalldontlieNaoSuportada'
  }
}

class ErroHttpBalldontlie extends ErroBalldontlie {
  constructor(
    readonly status: number,
    caminho: string,
  ) {
    super(`HTTP ${status} em ${caminho}`)
  }
}

export const capacidadesBalldontlie = {
  times: 'snapshot',
  jogadoresAtivos: 'snapshot_paginado',
  jogosPorData: 'snapshot_paginado',
  statsJogador: 'snapshot_paginado',
  classificacaoRegular: 'snapshot',
  statsTimePorJogo: 'nao_suportado',
  escalacaoPorJogo: 'nao_suportado',
} as const

function validarConfig(config: ConfigBalldontlie): ConfigNormalizada {
  if (config.chave.trim().length === 0) {
    throw new ErroBalldontlie('chave obrigatória')
  }

  const baseUrl = (config.baseUrl ?? BASE_URL).replace(/\/$/, '')
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' || url.search.length > 0 || url.hash.length > 0) {
    throw new ErroBalldontlie('baseUrl deve ser HTTPS e não pode conter query ou fragmento')
  }

  const timeoutMs = config.timeoutMs ?? 5_000
  const maxTentativas = config.maxTentativas ?? 3
  const atrasoBaseMs = config.atrasoBaseMs ?? 250
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ErroBalldontlie('timeoutMs deve ser um inteiro positivo')
  }
  if (!Number.isInteger(maxTentativas) || maxTentativas <= 0) {
    throw new ErroBalldontlie('maxTentativas deve ser um inteiro positivo')
  }
  if (!Number.isInteger(atrasoBaseMs) || atrasoBaseMs < 0) {
    throw new ErroBalldontlie('atrasoBaseMs deve ser um inteiro não negativo')
  }

  return {
    chave: config.chave,
    baseUrl,
    timeoutMs,
    maxTentativas,
    atrasoBaseMs,
    fetch: config.fetch ?? fetch,
    dormir:
      config.dormir ??
      ((ms) =>
        new Promise<void>((resolver) => {
          setTimeout(resolver, ms)
        })),
    aleatorio: config.aleatorio ?? Math.random,
  }
}

function mensagemZod(contexto: string, erro: z.ZodError): string {
  const questoes = erro.issues
    .map((questao) => `${questao.path.join('.') || '<raiz>'}: ${questao.message}`)
    .join('; ')
  return `${contexto} inválido (${questoes})`
}

function validar<T>(schema: ZodType<T>, valor: unknown, contexto: string): T {
  const resultado = schema.safeParse(valor)
  if (!resultado.success) throw new ErroBalldontlie(mensagemZod(contexto, resultado.error))
  return resultado.data
}

function atrasoRetryAfter(valor: string | null, agora = Date.now()): number | null {
  if (valor === null) return null
  const segundos = Number(valor)
  if (Number.isFinite(segundos) && segundos >= 0) return Math.ceil(segundos * 1_000)

  const data = Date.parse(valor)
  return Number.isNaN(data) ? null : Math.max(0, data - agora)
}

function minutosDecimais(valor: string): number {
  if (/^\d+(?:\.\d+)?$/.test(valor)) return Number(valor)

  const partes = /^(\d+):(\d{2})$/.exec(valor)
  if (partes === null) {
    throw new ErroBalldontlie(`minutos em formato não documentado: ${JSON.stringify(valor)}`)
  }

  const minutos = Number(partes[1])
  const segundos = Number(partes[2])
  if (segundos >= 60) {
    throw new ErroBalldontlie(`minutos em formato inválido: ${JSON.stringify(valor)}`)
  }
  return minutos + segundos / 60
}

function alturaEmCentimetros(valor: string | null): number | null {
  if (valor === null) return null
  const partes = /^(\d+)-(\d+)$/.exec(valor)
  if (partes === null) {
    throw new ErroBalldontlie(`altura em formato não documentado: ${JSON.stringify(valor)}`)
  }
  const pes = Number(partes[1])
  const polegadas = Number(partes[2])
  if (polegadas >= 12) {
    throw new ErroBalldontlie(`altura em formato inválido: ${JSON.stringify(valor)}`)
  }
  return Math.round((pes * 12 + polegadas) * 2.54)
}

function numeroCamisa(valor: string | null): number | null {
  if (valor === null) return null
  if (!/^\d+$/.test(valor)) {
    throw new ErroBalldontlie(
      `número de camisa em formato não documentado: ${JSON.stringify(valor)}`,
    )
  }
  return Number(valor)
}

function traduzirEstadoJogo(estado: z.infer<typeof estadoJogoSchema>): JogoExterno['status'] {
  switch (estado) {
    case 'scheduled':
      return 'AGENDADO'
    case 'in_progress':
      return 'AO_VIVO'
    case 'final':
      return 'ENCERRADO'
    case 'postponed':
    case 'canceled':
    case 'delayed':
    case 'suspended':
    case 'abandoned':
      throw new CapacidadeBalldontlieNaoSuportada(
        `status ${estado}`,
        'a porta FonteNBA atual só representa AGENDADO, AO_VIVO e ENCERRADO',
      )
    case 'unknown':
      throw new ErroBalldontlie('status_state desconhecido recebido da origem')
  }
}

export function mapearTimeBalldontlie(bruto: unknown): TimeExterno {
  const time = validar(timeSchema, bruto, 'time')
  return {
    idExterno: String(time.id),
    sigla: time.abbreviation,
    nome: time.full_name,
    conferencia: time.conference,
    logoUrl: null,
  }
}

export function mapearJogadorBalldontlie(bruto: unknown, ativo = true): JogadorExterno {
  const jogador = validar(jogadorSchema, bruto, 'jogador ativo')
  return {
    idExterno: String(jogador.id),
    nomeCompleto: `${jogador.first_name} ${jogador.last_name}`,
    timeSiglaProvedor: jogador.team.abbreviation,
    posicao: jogador.position,
    alturaCm: alturaEmCentimetros(jogador.height),
    numeroCamisa: numeroCamisa(jogador.jersey_number),
    fotoUrl: null,
    ativo,
  }
}

export function mapearJogoBalldontlie(bruto: unknown): JogoExterno {
  const jogo = validar(jogoSchema, bruto, 'jogo')
  return {
    idExterno: String(jogo.id),
    dataReferencia: jogo.date,
    dataHoraUtc: jogo.datetime,
    timeCasaSigla: jogo.home_team.abbreviation,
    timeVisitanteSigla: jogo.visitor_team.abbreviation,
    status: traduzirEstadoJogo(jogo.status_state),
    quartoAtual: jogo.period === 0 ? null : jogo.period,
    relogio: jogo.time.trim().length === 0 ? null : jogo.time,
    intervalo: jogo.status.trim().toLowerCase() === 'halftime',
    placarCasa: jogo.home_team_score,
    placarVisitante: jogo.visitor_team_score,
  }
}

export function mapearLinhaStatsBalldontlie(bruto: unknown, quarto: number | null): LinhaBoxScore {
  const linha = validar(linhaStatsSchema, bruto, 'linha de stats')
  return {
    jogadorIdExterno: String(linha.player.id),
    quarto,
    minutos: minutosDecimais(linha.min),
    pontos: linha.pts,
    rebotes: linha.reb,
    rebotesOf: linha.oreb,
    rebotesDef: linha.dreb,
    assistencias: linha.ast,
    roubos: linha.stl,
    bloqueios: linha.blk,
    turnovers: linha.turnover,
    faltas: linha.pf,
    cestasC: linha.fgm,
    cestasT: linha.fga,
    doisC: linha.fgm - linha.fg3m,
    doisT: linha.fga - linha.fg3a,
    tresC: linha.fg3m,
    tresT: linha.fg3a,
    lanceC: linha.ftm,
    lanceT: linha.fta,
    saldoQuadra: linha.plus_minus,
  }
}

export function mapearClassificacaoBalldontlie(bruto: unknown): LinhaClassificacaoExterna {
  const linha = validar(classificacaoSchema, bruto, 'classificação')
  const jogos = linha.wins + linha.losses
  return {
    timeSigla: linha.team.abbreviation,
    conferencia: linha.team.conference,
    vitorias: linha.wins,
    derrotas: linha.losses,
    posicao: linha.conference_rank,
    aproveitamento: jogos === 0 ? null : linha.wins / jogos,
    sequencia: null,
  }
}

function anoInicialDaTemporada(temporada: string): number {
  const correspondencia = /^(\d{4})(?:-\d{2})?$/.exec(temporada)
  if (correspondencia === null) {
    throw new ErroBalldontlie(`temporada inválida: ${JSON.stringify(temporada)}`)
  }
  return Number(correspondencia[1])
}

export class FonteBalldontlie implements FonteNBA {
  readonly nome = 'balldontlie'
  private readonly config: ConfigNormalizada

  constructor(config: ConfigBalldontlie) {
    this.config = validarConfig(config)
  }

  private async requisitar(caminho: string): Promise<unknown> {
    for (let tentativa = 1; tentativa <= this.config.maxTentativas; tentativa += 1) {
      const controlador = new AbortController()
      const timer = setTimeout(() => controlador.abort(), this.config.timeoutMs)

      try {
        const resposta = await this.config.fetch(`${this.config.baseUrl}${caminho}`, {
          headers: { Authorization: this.config.chave },
          signal: controlador.signal,
        })

        if (resposta.ok) {
          try {
            const corpo: unknown = await resposta.json()
            return corpo
          } catch {
            throw new ErroBalldontlie(`JSON inválido em ${caminho}`)
          }
        }

        const erro = new ErroHttpBalldontlie(resposta.status, caminho)
        const repetivel = resposta.status === 429 || resposta.status >= 500
        if (!repetivel || tentativa === this.config.maxTentativas) throw erro

        const doCabecalho = atrasoRetryAfter(resposta.headers.get('retry-after'))
        const exponencial = this.config.atrasoBaseMs * 2 ** (tentativa - 1)
        const jitter = Math.floor(this.config.aleatorio() * this.config.atrasoBaseMs)
        await this.config.dormir(doCabecalho ?? exponencial + jitter)
      } catch (erro) {
        if (erro instanceof ErroHttpBalldontlie || erro instanceof ErroBalldontlie) throw erro
        if (tentativa === this.config.maxTentativas) {
          const timeout = controlador.signal.aborted ? 'timeout' : 'erro de rede'
          throw new ErroBalldontlie(`${timeout} em ${caminho}`)
        }
        const exponencial = this.config.atrasoBaseMs * 2 ** (tentativa - 1)
        const jitter = Math.floor(this.config.aleatorio() * this.config.atrasoBaseMs)
        await this.config.dormir(exponencial + jitter)
      } finally {
        clearTimeout(timer)
      }
    }

    throw new ErroBalldontlie(`tentativas esgotadas em ${caminho}`)
  }

  private async buscarLista<T>(
    caminho: string,
    schema: ZodType<T>,
    opcoes: { paginado: boolean },
  ): Promise<T[]> {
    const dados: T[] = []
    const cursores = new Set<number>()
    let cursor: number | null = null

    do {
      const separador = caminho.includes('?') ? '&' : '?'
      const caminhoDaPagina: string =
        cursor === null ? caminho : `${caminho}${separador}cursor=${encodeURIComponent(cursor)}`
      const bruto = await this.requisitar(caminhoDaPagina)
      const resposta: { data: T[]; meta?: z.infer<typeof metaSchema> } = validar(
        respostaListaSchema(schema),
        bruto,
        `resposta de ${caminhoDaPagina}`,
      )
      dados.push(...resposta.data)

      const seguinte: number | null = opcoes.paginado ? (resposta.meta?.next_cursor ?? null) : null
      if (seguinte !== null && cursores.has(seguinte)) {
        throw new ErroBalldontlie(`cursor repetido em ${caminho}: ${seguinte}`)
      }
      if (seguinte !== null) cursores.add(seguinte)
      cursor = seguinte
    } while (cursor !== null)

    return dados
  }

  private async buscarJogo(jogoIdExterno: string) {
    if (!/^\d+$/.test(jogoIdExterno)) {
      throw new ErroBalldontlie(`ID de jogo inválido: ${JSON.stringify(jogoIdExterno)}`)
    }
    const caminho = `/games/${encodeURIComponent(jogoIdExterno)}`
    const bruto = await this.requisitar(caminho)
    const jogo = validar(respostaJogoSchema, bruto, `resposta de ${caminho}`).data
    if (String(jogo.id) !== jogoIdExterno) {
      throw new ErroBalldontlie(
        `jogo ${jogoIdExterno} respondeu com ID incompatível ${String(jogo.id)}`,
      )
    }
    return jogo
  }

  async listarTimes(): Promise<TimeExterno[]> {
    const times = await this.buscarLista('/teams', timeSchema, { paginado: false })
    return times.map(mapearTimeBalldontlie)
  }

  async listarJogadores(): Promise<JogadorExterno[]> {
    const jogadores = await this.buscarLista('/players/active?per_page=100', jogadorSchema, {
      paginado: true,
    })
    return jogadores.map((j) => mapearJogadorBalldontlie(j))
  }

  /**
   * Resolve jogadores pelo id, incluindo quem não está mais na liga.
   *
   * `/players` cobre a história inteira; `/players/active` só o elenco de hoje.
   * Chegar aqui significa que o cadastro — alimentado pelo segundo — não
   * conhece o id, então o jogador está fora da liga: é o que `ativo: false`
   * registra. Se ele voltar a aparecer em `/players/active`, a sincronização
   * de elenco em modo SNAPSHOT corrige o estado (`sincronizar/elenco.ts`).
   *
   * Em lotes de 100 — o `per_page` máximo do provedor — para não montar uma
   * URL de 300 ids que o servidor recusa.
   */
  async jogadoresPorId(idsExternos: string[]): Promise<JogadorExterno[]> {
    if (idsExternos.length === 0) return []

    const unicos = [...new Set(idsExternos)]
    const resolvidos: JogadorExterno[] = []

    for (let inicio = 0; inicio < unicos.length; inicio += 100) {
      const lote = unicos.slice(inicio, inicio + 100)
      const consulta = lote
        .map((id) => `player_ids[]=${encodeURIComponent(id)}`)
        .join('&')
      const jogadores = await this.buscarLista(
        `/players?${consulta}&per_page=100`,
        jogadorSchema,
        { paginado: true },
      )
      // Id que o provedor não conhece simplesmente não volta na lista. Quem
      // decide o que fazer com a ausência é a sincronização, não o adapter.
      resolvidos.push(...jogadores.map((j) => mapearJogadorBalldontlie(j, false)))
    }

    return resolvidos
  }

  async listarJogos(dataIso: string): Promise<JogoExterno[]> {
    validar(dataIsoSchema, dataIso, 'data da rodada')
    const jogos = await this.buscarLista(
      `/games?dates[]=${encodeURIComponent(dataIso)}&per_page=100`,
      jogoSchema,
      { paginado: true },
    )
    return jogos.map(mapearJogoBalldontlie)
  }

  private async buscarStats(jogoIdExterno: string, quarto: number): Promise<LinhaBoxScore[]> {
    const linhas = await this.buscarLista(
      `/stats?game_ids[]=${encodeURIComponent(jogoIdExterno)}&period=${quarto}&per_page=100`,
      linhaStatsSchema,
      { paginado: true },
    )
    const idIncompativel = linhas.find((linha) => String(linha.game.id) !== jogoIdExterno)
    if (idIncompativel !== undefined) {
      throw new ErroBalldontlie(
        `stats do jogo ${jogoIdExterno} contêm ID incompatível ${String(idIncompativel.game.id)}`,
      )
    }
    return linhas.map((linha) => mapearLinhaStatsBalldontlie(linha, quarto === 0 ? null : quarto))
  }

  async boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]> {
    const jogo = await this.buscarJogo(jogoIdExterno)
    const totais = await this.buscarStats(jogoIdExterno, 0)

    if (jogo.status_state === 'in_progress' && jogo.period === 1) {
      // Durante o Q1 o acumulado do jogo é exatamente o split do primeiro
      // quarto. O endpoint `period=1` só é aceito depois do encerramento.
      return [...totais, ...totais.map((linha) => ({ ...linha, quarto: 1 }))]
    }

    if (jogo.status_state !== 'final') return totais

    const periodos: LinhaBoxScore[] = []
    for (let quarto = 1; quarto <= jogo.period; quarto += 1) {
      periodos.push(...(await this.buscarStats(jogoIdExterno, quarto)))
    }
    return [...totais, ...periodos]
  }

  async boxScoreDoTime(_jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]> {
    throw new CapacidadeBalldontlieNaoSuportada(
      'boxScoreDoTime',
      'a API não documenta estatísticas agregadas do time por jogo; somar atletas perderia team rebounds',
    )
  }

  async escalacao(_jogoIdExterno: string): Promise<EscalacaoExterna[]> {
    throw new CapacidadeBalldontlieNaoSuportada(
      'escalacao',
      'lineups só existem após o início e injuries não possui game_id nem semântica documentada de remoção',
    )
  }

  async classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]> {
    const ano = anoInicialDaTemporada(temporada)
    const linhas = await this.buscarLista(`/standings?season=${ano}`, classificacaoSchema, {
      paginado: false,
    })
    return linhas.map(mapearClassificacaoBalldontlie)
  }
}

export function criarFonteBalldontlie(config: ConfigBalldontlie): FonteBalldontlie {
  return new FonteBalldontlie(config)
}
