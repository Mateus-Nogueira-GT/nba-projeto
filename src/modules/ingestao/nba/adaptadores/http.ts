import type {
  EscalacaoExterna,
  FonteNBA,
  JogadorExterno,
  JogoExterno,
  LinhaBoxScore,
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

  async listarJogadores(): Promise<JogadorExterno[]> {
    return (await this.buscar('/players')).map((j) => {
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
    })
  }

  async listarJogos(dataIso: string): Promise<JogoExterno[]> {
    return (await this.buscar(`/games?date=${dataIso}`)).map((g) => ({
      idExterno: String(g['id'] ?? ''),
      dataHoraUtc: texto(g['start_time_utc']) ?? texto(g['date']) ?? dataIso,
      timeCasaSigla: texto(g['home_team_abbreviation']) ?? '',
      timeVisitanteSigla: texto(g['visitor_team_abbreviation']) ?? '',
      status: traduzirStatus(texto(g['status'])),
      quartoAtual: numero(g['period']),
      placarCasa: numero(g['home_team_score']),
      placarVisitante: numero(g['visitor_team_score']),
    }))
  }

  async boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]> {
    return (await this.buscar(`/games/${jogoIdExterno}/stats`)).map((s) => ({
      jogadorIdExterno: String((s['player'] as Json | undefined)?.['id'] ?? s['player_id'] ?? ''),
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
    }))
  }

  async escalacao(jogoIdExterno: string): Promise<EscalacaoExterna[]> {
    return (await this.buscar(`/games/${jogoIdExterno}/injuries`)).map((i) => ({
      jogadorIdExterno: String((i['player'] as Json | undefined)?.['id'] ?? i['player_id'] ?? ''),
      status: traduzirEscalacao(texto(i['status'])),
      motivo: texto(i['description']),
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
