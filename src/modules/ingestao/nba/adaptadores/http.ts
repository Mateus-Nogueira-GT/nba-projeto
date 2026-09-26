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

export type ConfigProvedor = {
  nome: string
  baseUrl: string
  chave: string
  timeoutMs: number
}

type Json = Record<string, unknown>

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function inteiro(v: unknown): number {
  return numero(v) ?? 0
}

/**
 * Adapter HTTP genérico para provedores no formato REST v2.
 *
 * Os dois provedores contratados expõem o mesmo desenho de recurso, então um
 * adapter parametrizado atende os dois. Quando o terceiro provedor chegar com
 * outro contrato, ele vira um arquivo novo implementando FonteNBA — nada mais
 * do sistema muda.
 */
export class FonteHttp implements FonteNBA {
  readonly nome: string

  constructor(private readonly config: ConfigProvedor) {
    this.nome = config.nome
  }

  private async buscar(caminho: string): Promise<Json[]> {
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), this.config.timeoutMs)

    try {
      const resposta = await fetch(`${this.config.baseUrl}${caminho}`, {
        headers: { Authorization: `Bearer ${this.config.chave}` },
        signal: controlador.signal,
      })

      if (!resposta.ok) {
        throw new Error(`${this.nome}: HTTP ${resposta.status} em ${caminho}`)
      }

      const corpo: unknown = await resposta.json()
      const dados = (corpo as Json)?.['data'] ?? corpo
      return Array.isArray(dados) ? (dados as Json[]) : []
    } finally {
      clearTimeout(timer)
    }
  }

  // -- TRADUÇÃO ------------------------------------------------------------
  // Tudo abaixo converte o schema do provedor para o canônico. Nenhum nome de
  // campo do provedor escapa destes métodos.

  async listarTimes(): Promise<TimeExterno[]> {
    return (await this.buscar('/teams')).map((t) => ({
      idExterno: String(t['id'] ?? ''),
      sigla: texto(t['abbreviation']) ?? texto(t['tricode']) ?? '',
      nome: texto(t['full_name']) ?? texto(t['name']) ?? '',
      conferencia: texto(t['conference']),
      logoUrl: texto(t['logo']),
    }))
  }

  private mapearJogador(j: Json): JogadorExterno {
    const time = j['team'] as Json | undefined
    return {
      idExterno: String(j['id'] ?? ''),
      nomeCompleto:
        texto(j['full_name']) ??
        [texto(j['first_name']), texto(j['last_name'])].filter(Boolean).join(' '),
      timeSiglaProvedor: texto(time?.['abbreviation']) ?? texto(j['team_abbreviation']),
      posicao: texto(j['position']),
      alturaCm: numero(j['height_cm']),
      numeroCamisa: numero(j['jersey_number']),
      fotoUrl: texto(j['headshot_url']),
      ativo: j['is_active'] !== false,
    }
  }

  async listarJogadores(): Promise<JogadorExterno[]> {
    return (await this.buscar('/players')).map((j) => this.mapearJogador(j))
  }

  async jogadoresPorId(idsExternos: string[]): Promise<JogadorExterno[]> {
    if (idsExternos.length === 0) return []
    const consulta = idsExternos.map((id) => encodeURIComponent(id)).join(',')
    return (await this.buscar(`/players?ids=${consulta}`)).map((j) => this.mapearJogador(j))
  }

  async listarJogos(dataIso: string): Promise<JogoExterno[]> {
    return (await this.buscar(`/games?date=${dataIso}`)).map((g) => ({
      idExterno: String(g['id'] ?? ''),
      dataReferencia: texto(g['date'])?.slice(0, 10) ?? dataIso,
      dataHoraUtc: texto(g['start_time_utc']) ?? texto(g['date']) ?? dataIso,
      timeCasaSigla: texto(g['home_team_abbreviation']) ?? '',
      timeVisitanteSigla: texto(g['visitor_team_abbreviation']) ?? '',
      status: traduzirStatus(texto(g['status'])),
      quartoAtual: numero(g['period']),
      relogio: texto(g['clock']) ?? texto(g['time']),
      intervalo: g['halftime'] === true,
      placarCasa: numero(g['home_team_score']),
      placarVisitante: numero(g['visitor_team_score']),
    }))
  }

  async boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]> {
    return (await this.buscar(`/games/${jogoIdExterno}/stats`)).map((s) => ({
      jogadorIdExterno: String((s['player'] as Json | undefined)?.['id'] ?? s['player_id'] ?? ''),
      // Este adaptador genérico ainda não traduz o time da linha (fora do
      // escopo desta tarefa) — igual a qualquer outro que não preenche o campo.
      timeSiglaExterna: null,
      quarto: numero(s['period']),
      minutos: numero(s['min']),
      pontos: inteiro(s['pts']),
      rebotes: inteiro(s['reb']),
      rebotesOf: inteiro(s['oreb']),
      rebotesDef: inteiro(s['dreb']),
      assistencias: inteiro(s['ast']),
      roubos: inteiro(s['stl']),
      bloqueios: inteiro(s['blk']),
      turnovers: inteiro(s['turnover']),
      faltas: inteiro(s['pf']),
      cestasC: inteiro(s['fgm']),
      cestasT: inteiro(s['fga']),
      doisC: inteiro(s['fgm']) - inteiro(s['fg3m']),
      doisT: inteiro(s['fga']) - inteiro(s['fg3a']),
      tresC: inteiro(s['fg3m']),
      tresT: inteiro(s['fg3a']),
      lanceC: inteiro(s['ftm']),
      lanceT: inteiro(s['fta']),
      saldoQuadra: numero(s['plus_minus']),
    }))
  }

  async boxScoreDoTime(jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]> {
    return (await this.buscar(`/games/${jogoIdExterno}/team-stats`)).map((t) => {
      // O provedor manda os quartos como lista ordenada; posição = quarto.
      const porQuarto = Array.isArray(t['line_scores']) ? (t['line_scores'] as unknown[]) : []
      const quarto = (i: number) => inteiro(porQuarto[i])

      return {
        timeSigla:
          texto((t['team'] as Json | undefined)?.['abbreviation']) ??
          texto(t['team_abbreviation']) ??
          '',
        pontos: inteiro(t['pts']),
        pontosQ1: quarto(0),
        pontosQ2: quarto(1),
        pontosQ3: quarto(2),
        pontosQ4: quarto(3),
        // Tudo além do 4º quarto é prorrogação, somado.
        pontosProrrogacao: porQuarto.slice(4).reduce<number>((a, v) => a + inteiro(v), 0),
        rebotesTotal: inteiro(t['reb']),
        rebotesOf: inteiro(t['oreb']),
        rebotesDef: inteiro(t['dreb']),
        assistencias: inteiro(t['ast']),
        cestasC: inteiro(t['fgm']),
        cestasT: inteiro(t['fga']),
        tresC: inteiro(t['fg3m']),
        tresT: inteiro(t['fg3a']),
        lanceC: inteiro(t['ftm']),
        lanceT: inteiro(t['fta']),
        roubos: inteiro(t['stl']),
        bloqueios: inteiro(t['blk']),
        turnovers: inteiro(t['turnover']),
        faltas: inteiro(t['pf']),
      }
    })
  }

  async escalacao(jogoIdExterno: string): Promise<EscalacaoExterna[]> {
    return (await this.buscar(`/games/${jogoIdExterno}/injuries`)).map((i) => ({
      jogadorIdExterno: String((i['player'] as Json | undefined)?.['id'] ?? i['player_id'] ?? ''),
      status: traduzirEscalacao(texto(i['status'])),
      motivo: texto(i['description']),
    }))
  }

  async classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]> {
    return (await this.buscar(`/standings?season=${encodeURIComponent(temporada)}`)).map((c) => ({
      timeSigla:
        texto((c['team'] as Json | undefined)?.['abbreviation']) ??
        texto(c['team_abbreviation']) ??
        '',
      conferencia: texto(c['conference']),
      vitorias: inteiro(c['wins']),
      derrotas: inteiro(c['losses']),
      posicao: numero(c['conference_rank']) ?? numero(c['rank']),
      aproveitamento: numero(c['win_pct']),
      sequencia: texto(c['streak']),
    }))
  }
}

function traduzirStatus(bruto: string | null): JogoExterno['status'] {
  const s = (bruto ?? '').toLowerCase()
  if (s.includes('final') || s.includes('closed')) return 'ENCERRADO'
  if (s.includes('progress') || s.includes('live') || /^q[1-4]/.test(s)) return 'AO_VIVO'
  return 'AGENDADO'
}

function traduzirEscalacao(bruto: string | null): EscalacaoExterna['status'] {
  const s = (bruto ?? '').toLowerCase()
  if (s.includes('out')) return 'FORA'
  if (s.includes('doubtful') || s.includes('questionable')) return 'DUVIDA'
  if (s.includes('probable')) return 'PROVAVEL'
  return 'ATIVO'
}
