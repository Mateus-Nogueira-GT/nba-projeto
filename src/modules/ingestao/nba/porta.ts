/**
 * PORTA DA FONTE NBA — camada anticorrupção (L0).
 *
 * Nenhum campo com nome de provedor atravessa esta porta. Se o provedor chama
 * de `pts`, `PLAYER_ID` ou `teamTricode`, o adapter traduz aqui. O resto do
 * sistema nunca vê o schema deles.
 *
 * Isso não é purismo: são duas fontes NBA com failover automático e casas de
 * aposta chegando com contratos diferentes. Sem esta porta, trocar de provedor
 * é reescrever o sistema; com ela, é escrever um arquivo novo.
 */

export type TimeExterno = {
  idExterno: string
  sigla: string
  nome: string
  conferencia: string | null
  logoUrl: string | null
}

export type JogadorExterno = {
  idExterno: string
  nomeCompleto: string
  /**
   * O time SEGUNDO O PROVEDOR — que é a NBA real.
   *
   * ATENÇÃO: não é o vínculo que o sistema usa. Os elencos da lista do CJ são
   * PROJETADOS (Giannis no Miami, LeBron no Philadelphia, Harden no Cleveland).
   * O vínculo jogador↔time vem da lista, jamais daqui. Este campo serve só
   * para ajudar o humano a desambiguar no mapeamento.
   */
  timeSiglaProvedor: string | null
  posicao: string | null
  alturaCm: number | null
  numeroCamisa: number | null
  fotoUrl: string | null
  /** false quando o provedor indica que o jogador não está mais na liga. */
  ativo: boolean
}

export type JogoExterno = {
  idExterno: string
  dataHoraUtc: string
  timeCasaSigla: string
  timeVisitanteSigla: string
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
  quartoAtual: number | null
  placarCasa: number | null
  placarVisitante: number | null
}

export type LinhaBoxScore = {
  jogadorIdExterno: string
  /** null = linha do jogo inteiro; 1..4+ = split por quarto. */
  quarto: number | null
  minutos: number | null
  pontos: number
  rebotes: number
  rebotesOf: number
  rebotesDef: number
  assistencias: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
  /**
   * ARREMESSOS — convertidos e tentados.
   *
   * Sem eles as colunas FG% e 3P% da tela do jogador nunca saem de "—":
   * `estatisticas_jogo` tem as colunas e nada as preencheria. Percentual sem
   * tentativa continua sendo null, nunca 0% — a tela já trata assim.
   */
  cestasC: number
  cestasT: number
  doisC: number
  doisT: number
  tresC: number
  tresT: number
  lanceC: number
  lanceT: number
  /** Saldo em quadra (+/-). Null quando o provedor não calcula. */
  saldoQuadra: number | null
}

/**
 * Box score do TIME, com pontos por quarto.
 *
 * Não sai da soma das linhas de jogador: a lista do CJ não cobre o elenco
 * inteiro, então somar os classificados daria um total menor que o placar.
 * Precisa vir do provedor.
 */
export type LinhaBoxScoreTimeExterna = {
  timeSigla: string
  pontos: number
  pontosQ1: number
  pontosQ2: number
  pontosQ3: number
  pontosQ4: number
  pontosProrrogacao: number
  rebotesTotal: number
  rebotesOf: number
  rebotesDef: number
  assistencias: number
  cestasC: number
  cestasT: number
  tresC: number
  tresT: number
  lanceC: number
  lanceT: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
}

/** Campanha do time na temporada — alimenta a tela do time e o menu. */
export type LinhaClassificacaoExterna = {
  timeSigla: string
  conferencia: string | null
  vitorias: number
  derrotas: number
  posicao: number | null
  /** 0..1. O provedor costuma mandar como "win percentage". */
  aproveitamento: number | null
  /** Ex.: "V3", "D2". Texto do provedor, exibido como veio. */
  sequencia: string | null
}

export type EscalacaoExterna = {
  jogadorIdExterno: string
  status: 'ATIVO' | 'FORA' | 'DUVIDA' | 'PROVAVEL'
  motivo: string | null
}

export interface FonteNBA {
  readonly nome: string
  listarTimes(): Promise<TimeExterno[]>
  listarJogadores(): Promise<JogadorExterno[]>
  listarJogos(dataIso: string): Promise<JogoExterno[]>
  boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]>
  boxScoreDoTime(jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]>
  escalacao(jogoIdExterno: string): Promise<EscalacaoExterna[]>
  classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]>
}
