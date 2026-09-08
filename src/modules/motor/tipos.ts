/**
 * Tipos do motor de estratégias.
 *
 * `Fatos` é a ÚNICA entrada de mundo externo. Inclui a data de referência:
 * o motor nunca consulta relógio, banco ou rede. Ver CLAUDE.md, regra 2.
 */

export const NIVEIS = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'] as const
export type Nivel = (typeof NIVEIS)[number]

export const ATRIBUTOS = ['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const
export type Atributo = (typeof ATRIBUTOS)[number]

/**
 * 1 = amarelo · 2 = laranja · 3 = verde. Turbo é sinalizado à parte.
 *
 * É enumeração de domínio, como NIVEIS e ATRIBUTOS — não parâmetro de
 * estratégia. Por isso vive aqui e não no ruleset.
 */
export const NIVEIS_APITO = [1, 2, 3] as const
export type NivelApito = (typeof NIVEIS_APITO)[number]

export type Estrategia = 'LISTA_SECRETA' | 'FIRE_LIVE'
export type Metodo = 'OSCILACAO' | 'OPD'

export type StatusEscalacao = 'ATIVO' | 'FORA' | 'DUVIDA' | 'PROVAVEL'

// ---------------------------------------------------------------------------
// FATOS
// ---------------------------------------------------------------------------

/** Um jogo já disputado no histórico do jogador. */
export type JogoHistorico = {
  jogoId: string
  data: string
  /** false = DNP. Afeta a contagem de sequência conforme `oscilacao.dnp`. */
  jogou: boolean
  pontos: number
  rebotes: number
  assistencias: number
}

export type JogadorFato = {
  id: string
  nome: string
  timeId: string
  /** 1..N dentro do time. Usado SOMENTE pela OPD. */
  posicaoHierarquia: number
  /** A ordem editorial pode ser diferente em pontos, rebotes e assistências. */
  posicaoHierarquiaPorAtributo?: Partial<Record<Atributo, number>>
  /** Identidade editorial reconciliada; permite exceções sem depender do UUID. */
  chaveEstrategia?: string
  /** Todos os nomes reconciliados: um alias de casa não apaga a identidade editorial. */
  chavesEstrategia?: string[]
  /**
   * Classificação do CJ, por atributo. Ausência do atributo aqui significa
   * "não classificado pela plataforma" — o que muda o multiplicador do Fire Live.
   */
  classificacoes: Partial<Record<Atributo, Nivel>>
  /** Média por jogo, por atributo. */
  medias: Partial<Record<Atributo, number>>
  /** Ordenado do mais recente para o mais antigo. */
  historico: JogoHistorico[]
}

export type TimeFato = {
  id: string
  sigla: string
  /** Hierarquia editorial projetada. Governa Lista Secreta, OPD e bloco de topo. */
  jogadores: JogadorFato[]
  /** Elenco canônico observado no jogo. Governa exclusivamente o Fire Live. */
  elencoCanonico?: JogadorFato[]
}

export type EstatisticaQuarto = {
  jogadorId: string
  quarto: number
  pontos: number
  rebotes: number
  assistencias: number
}

export type JogoFato = {
  id: string
  timeCasaId: string
  timeVisitanteId: string
  /** null = ainda não começou. O Fire Live só age quando === ruleset.fire_live.quarto */
  quartoAtual: number | null
  escalacao: Record<string, StatusEscalacao>
  estatisticasQuarto: EstatisticaQuarto[]
}

export type Fatos = {
  /** ISO. O "hoje" entra como dado — nunca `Date.now()`. */
  dataReferencia: string
  times: TimeFato[]
  jogos: JogoFato[]
}

// ---------------------------------------------------------------------------
// SAÍDA
// ---------------------------------------------------------------------------

export type Apito = {
  /**
   * (jogo, jogador, atributo, estrategia, linha) — estável e determinística.
   * Espelha o UNIQUE da tabela `apitos`, que é quem de fato garante
   * idempotência de push. O motor apenas produz a chave.
   */
  chaveDeduplicacao: string
  jogoId: string
  jogadorId: string
  atributo: Atributo
  estrategia: Estrategia
  metodo: Metodo | null
  nivelJogador: Nivel
  nivelApito: NivelApito
  turbo: boolean
  modoFire: boolean
  /** Cruzamento: jogador já apitado em OPD pré-live que também apita no Fire Live. */
  opdOrigemNivel: NivelApito | null
  /** Linha de pontos (Lista Secreta). null no Fire Live. */
  linha: number | null
  /** Nota de confiança da análise do CJ. NUNCA chamar de probabilidade. */
  confianca: number | null
  alvo1Q: number | null
}

export function montarChave(
  jogoId: string,
  jogadorId: string,
  atributo: Atributo,
  estrategia: Estrategia,
  linha: number | null,
): string {
  return [jogoId, jogadorId, atributo, estrategia, linha ?? ''].join('|')
}

export function valorDoAtributo(
  jogo: JogoHistorico | EstatisticaQuarto,
  atributo: Atributo,
): number {
  switch (atributo) {
    case 'PONTOS':
      return jogo.pontos
    case 'REBOTES':
      return jogo.rebotes
    case 'ASSISTENCIAS':
      return jogo.assistencias
  }
}
