import { decimal } from './formato'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'

type Faixa = NonNullable<ItemFeed['oddFaixa']>

export type OddNaTela = {
  /** "Odd" ou "Odd média" — o rótulo muda com a forma. */
  rotulo: string
  valor: string
  /** "3 casas", quando há mais de uma. */
  apoio: string | null
}

/**
 * QUEM DECIDE A FORMA DA ODD É O RULESET, não a tela.
 *
 * `odds.exibicao` é aplicada na materialização, que manda `unica` (uma casa
 * só), `media` (a média entre casas) ou nenhuma das duas — e aí o que existe é
 * a faixa. Escolher a forma na tela faria virar a chave no YAML deixar de
 * mudar o produto. Sem odd nenhuma, devolve `null`: um "—" onde deveria estar
 * a odd anunciaria defeito, e um número de tabela apresentado como odd de casa
 * seria mentira.
 */
export function oddDaLinha(faixa: Faixa | null | undefined): OddNaTela | null {
  if (!faixa) return null
  const casas = faixa.qtdCasas > 1 ? `${faixa.qtdCasas} casas` : faixa.qtdCasas === 1 ? '1 casa' : null
  if (faixa.unica != null) return { rotulo: 'Odd', valor: decimal(faixa.unica, 2), apoio: null }
  if (faixa.media != null) return { rotulo: 'Odd média', valor: decimal(faixa.media, 2), apoio: casas }
  if (faixa.min === faixa.max) return { rotulo: 'Odd', valor: decimal(faixa.min, 2), apoio: casas }
  return { rotulo: 'Odd', valor: `${decimal(faixa.min, 2)}–${decimal(faixa.max, 2)}`, apoio: casas }
}
