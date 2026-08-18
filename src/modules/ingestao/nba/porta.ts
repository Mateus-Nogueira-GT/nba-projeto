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
  escalacao(jogoIdExterno: string): Promise<EscalacaoExterna[]>
}
