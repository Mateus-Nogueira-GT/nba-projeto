import fixtures from './__fixtures__/cotacoes.json'
import type { CasaDeAposta, CotacaoExterna } from './porta'

type Fixtures = Record<string, Record<string, CotacaoExterna[]>>

/**
 * Casa de fixture — determinística, sem rede. Enquanto o contrato comercial
 * com as casas não existe (G4), é ela que exercita reconciliação e agregação.
 * As duas casas grafam o mesmo jogador de formas diferentes DE PROPÓSITO:
 * essa é a matéria-prima da curadoria (fatia 4).
 */
export class CasaFake implements CasaDeAposta {
  constructor(readonly nome: string) {}

  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    const daCasa = (fixtures as Fixtures)[this.nome] ?? {}
    return (daCasa[jogoIdExterno] ?? []).map((c) => ({ ...c }))
  }
}
