import type { Atributo, Metodo, Nivel, NivelApito } from '../motor/tipos'

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
   * Faixa de odds entre casas para a linha do apito, da última coleta.
   * `media` chega com a spec da lógica de dados; o card já sabe renderizar os
   * dois estados. Null sem coleta — o rodapé então omite a odd.
   */
  oddFaixa: { min: number; max: number; qtdCasas: number; media?: number } | null
  /**
   * Frase de análise gerada por LLM a partir DOS FATOS acima. Anexada depois
   * do hash do snapshot (ver `narrativa.ts`) e ausente quando a geração falha
   * ou o validador reprova — o card simplesmente não a mostra.
   */
  narrativa?: string | null
}

export type ConteudoFeed = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  itens: ItemFeed[]
  /** Parágrafo editorial da rodada. Mesma regra da narrativa: pode faltar. */
  resumoDoDia?: string | null
}
