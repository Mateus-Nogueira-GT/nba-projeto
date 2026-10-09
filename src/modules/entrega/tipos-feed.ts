import type { Atributo, MetricaMatchup, Metodo, Nivel, NivelApito } from '../motor/tipos'

/**
 * Tipos do feed materializado — separados de `lista-secreta.ts` para que
 * `narrativa.ts` possa importá-los sem criar dependência circular: a
 * publicação (`lista-secreta.ts`) chama `enriquecerComNarrativas` em tempo de
 * execução, e a narrativa precisa dos tipos de item/conteúdo — se ela os
 * importasse de volta de `lista-secreta.ts`, o grafo de módulos fecharia um
 * ciclo (guarda `sem-dependencia-circular` do dependency-cruiser).
 *
 * `lista-secreta.ts` continua sendo o ponto de importação público: reexporta
 * os dois tipos daqui, então nada fora deste módulo precisa saber que eles
 * moraram aqui.
 */

/**
 * Item já pronto para a tela.
 *
 * O feed é MATERIALIZADO: o motor roda uma vez por evento, não uma vez por
 * usuário. Com 10k conectados, é essa diferença que decide se a conta fecha.
 * Ver docs/01-arquitetura.md > "10.000 simultâneos".
 */
export type ItemFeed = {
  chave: string
  jogoId: string
  jogadorId: string
  nome: string
  timeSigla: string
  timeNome: string
  /** Foto do jogador, quando o provedor tem uma. Ausente em snapshot antigo. */
  fotoUrl: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  turbo: boolean
  modoFire: boolean
  opdOrigemNivel: NivelApito | null
  linha: number | null
  /** Nota de confiança da análise do CJ. Nunca "probabilidade". */
  confianca: number | null
  /**
   * Faixa VISUAL da nota (1..5), calculada UMA vez aqui, na materialização.
   *
   * Não é conveniência: `faixaDaConfianca` é função do MOTOR, e a tela não
   * executa o motor — a avaliação acontece uma vez por evento, não uma vez
   * por usuário (`tela-nao-chama-o-motor`, docs/01-arquitetura.md). O grau
   * viaja no feed pelo mesmo motivo que o resto do item viaja.
   *
   * Calculado sobre o valor ARREDONDADO, que é o que a tela imprime: com 85,5
   * a pílula mostra "86%" e a régua de /como-funciona promete grau 3 para 86.
   * Graduar o valor bruto daria grau 2 e a contradição apareceria em duas
   * telas. Null em snapshot anterior a este campo.
   */
  grauConfianca: 1 | 2 | 3 | 4 | 5 | null
  alvo1Q: number | null
  /**
   * Método que produziu o apito. Viaja no feed porque o documento do CJ pede
   * filtragem por método. Null em snapshot anterior à spec 08.
   */
  metodo: Metodo | null
  /** G/F/C — dado canônico do jogador, usado só como recorte de leitura. */
  posicao: string | null
  /**
   * Últimos 5 jogos conferidos contra a linha do apito, mais recente primeiro
   * — as barrinhas do card. MESMO cálculo do detalhe (historico-na-linha.ts).
   * Vazio em snapshot antigo ou sem linha/alvo para conferir.
   */
  ultimos5: { valor: number; bateu: boolean }[]
  /** Média da temporada que o motor usou — o card mostra sem chamar o motor. */
  mediaTemporada: number | null
  /**
   * A odd da linha do apito, da última coleta. A FORMA é decidida na
   * materialização, lendo `odds.exibicao` do ruleset — a tela só escreve:
   *   `unica` → uma casa só (parceiro, 19/09)
   *   `media` → a média entre casas
   *   nenhuma → a faixa min–max
   * Null sem coleta: o card então omite a odd.
   */
  oddFaixa: {
    min: number
    max: number
    qtdCasas: number
    media?: number
    unica?: number
  } | null
  /**
   * MATCHUP EM ESTRELAS (CJ, 09/10): uma ★ por critério que o adversário do
   * jogo atende (`motivos`) e o aviso de matchup negativo (`aviso`). Não mexe
   * no nível nem no %. Calculado UMA vez, na materialização, pela regra pura
   * do motor. `null` = nenhuma estrela nem aviso; ausente em snapshot anterior
   * a 09/10 — a tela trata os dois como "sem matchup".
   */
  matchup?: MatchupDoItem | null
  /**
   * Frase de análise gerada por LLM a partir DOS FATOS acima. Anexada depois
   * do hash do snapshot (ver `narrativa.ts`) e ausente quando a geração falha
   * ou o validador reprova — o card simplesmente não a mostra.
   */
  narrativa?: string | null
}

/**
 * O critério atendido e a POSIÇÃO que o fez valer, gravados juntos (pente
 * fino de 09/10, achado 9): a frase do painel sai do mesmo fato da estrela.
 */
export type MotivoDoItem = { metrica: MetricaMatchup; posicao: number }

export type MatchupDoItem = {
  estrelas: number
  motivos: MotivoDoItem[]
  aviso: MotivoDoItem[]
}

/**
 * Como o matchup pode estar num snapshot JÁ gravado: até o pente fino de
 * 09/10, `motivos` e `aviso` eram só a métrica, sem a posição.
 */
export type MatchupGravado = {
  estrelas: number
  motivos: (MotivoDoItem | MetricaMatchup)[]
  aviso: (MotivoDoItem | MetricaMatchup)[]
}

/** O motivo lido de qualquer snapshot: `posicao: null` quando não foi gravada. */
export type MotivoLido = { metrica: MetricaMatchup; posicao: number | null }
export type MatchupLido = { estrelas: number; motivos: MotivoLido[]; aviso: MotivoLido[] }

/**
 * Lê o matchup de um item nos DOIS formatos de snapshot. Snapshot antigo não
 * ganha posição inventada — a tela simplesmente não imprime o parêntese.
 */
export function lerMatchupDoItem(
  matchup: MatchupDoItem | MatchupGravado | null | undefined,
): MatchupLido | null {
  if (!matchup) return null
  const lido = (m: MotivoDoItem | MetricaMatchup): MotivoLido =>
    typeof m === 'string' ? { metrica: m, posicao: null } : { metrica: m.metrica, posicao: m.posicao }
  return {
    estrelas: matchup.estrelas,
    motivos: (matchup.motivos ?? []).map(lido),
    aviso: (matchup.aviso ?? []).map(lido),
  }
}

export type ConteudoFeed = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  itens: ItemFeed[]
  /** Parágrafo editorial da rodada. Mesma regra da narrativa: pode faltar. */
  resumoDoDia?: string | null
}
