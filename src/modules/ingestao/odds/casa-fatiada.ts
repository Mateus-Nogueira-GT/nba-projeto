import type { CasaDeAposta, CotacaoExterna } from './porta'

/**
 * Uma casa JÁ FATIADA para um único jogo externo.
 *
 * Todo adapter de odds devolve as casas por jogo (balldontlie tira 8 vendors
 * de uma chamada; BetMGM e Altenar, uma casa por evento). Pedir outro jogo a
 * uma casa fatiada é bug de quem chama, não dado ausente — por isso lança.
 */
export class CasaFatiada implements CasaDeAposta {
  constructor(
    readonly nome: string,
    private readonly jogoIdExterno: string,
    private readonly itens: CotacaoExterna[],
    private readonly totalDescartadas: number,
  ) {}

  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    if (jogoIdExterno !== this.jogoIdExterno) {
      throw new Error(
        `${this.nome}: casa fatiada para o jogo ${this.jogoIdExterno}, pedido ${jogoIdExterno}`,
      )
    }
    return this.itens.map((c) => ({ ...c }))
  }

  descartadas(): number {
    return this.totalDescartadas
  }
}
