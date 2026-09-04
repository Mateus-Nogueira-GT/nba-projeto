/**
 * Porta anticorrupção das casas de aposta — o mesmo princípio da porta da NBA:
 * NENHUM schema de casa atravessa para dentro. E, acima de tudo, o ADR-0004:
 * somente leitura. Sem envio de aposta, sem credencial de usuário em casa,
 * sem movimentação de dinheiro. Esta porta LÊ cotação pública, e só.
 */
export type CotacaoExterna = {
  /** Nome como a casa grafia — reconciliação humana antes de virar vínculo. */
  jogadorNomeNaCasa: string
  /** "Player Points", "Pontos do Jogador"... — casado via mapa_mercados. */
  nomeMercadoNaCasa: string
  linha: number
  oddOver: number | null
  oddUnder: number | null
  /**
   * Id do jogador NO PROVEDOR, quando a casa é servida por um provedor que a
   * ingestão NBA já conhece (balldontlie). Permite vínculo direto por
   * identidades_jogador, sem curadoria de nome. Ausente nas casas por scraping.
   */
  jogadorIdExternoProvedor?: string
  /** Atributo já traduzido na fronteira, quando o provedor o declara. */
  atributo?: import('../../motor/tipos').Atributo
}

/**
 * EVENTO como a casa o publica — o que o vínculo evento↔jogo consome. As três
 * fontes devolvem exatamente esta forma; o casador não sabe de qual veio.
 */
export type EventoDaCasa = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  /** Início em ISO quando a casa informa — é o que corta o DIA no vínculo. */
  inicioIso: string | null
}

/**
 * CENSO de um evento — o retrato CRU do que a casa publica, para a curadoria.
 *
 * Existe porque nenhuma das documentações mostra como a casa grafia os props
 * de NBA. Sem ele, a única forma de descobrir os nomes seria adivinhar — e
 * mercado adivinhado é linha errada no card. Diferente de `CotacaoExterna`,
 * o censo NÃO é traduzido: lista o que veio, com contagem, e para por aí.
 */
export type CensoDaCasa = {
  mercados: { nome: string; cotacoesAtivas: number }[]
  jogadores: string[]
}

export interface CasaDeAposta {
  readonly nome: string
  cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]>
  /** Quantas cotações a tradução da fronteira descartou — o job loga, nunca silencia. */
  descartadas?(): number
}
