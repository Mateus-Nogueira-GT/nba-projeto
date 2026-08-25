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
}

export interface CasaDeAposta {
  readonly nome: string
  cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]>
}
