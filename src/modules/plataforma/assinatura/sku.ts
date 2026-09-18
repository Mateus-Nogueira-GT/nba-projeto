import type { Modalidade, NivelDoPlano, NivelPago } from './nivel-do-plano'
import { atende } from './nivel-do-plano'

/**
 * OS QUATRO SKUs — o que está à venda.
 *
 * Um SKU é um par (nível, modalidade); ele não é um conceito novo, é o nome
 * curto do par, porque é isso que um formulário consegue mandar num campo só
 * e o que o provedor mostra na fatura do comprador. Quem decide o que o SKU
 * LIBERA continua sendo `nivel-do-plano.ts`; aqui só se diz o que se vende.
 */
export type Sku = 'MVP_MENSAL' | 'MVP_TEMPORADA' | 'ALL_STAR_MENSAL' | 'ALL_STAR_TEMPORADA'

const COMPOSICAO: Record<Sku, { nivelDoPlano: NivelPago; modalidade: Modalidade }> = {
  MVP_MENSAL: { nivelDoPlano: 'MVP', modalidade: 'MENSAL' },
  MVP_TEMPORADA: { nivelDoPlano: 'MVP', modalidade: 'TEMPORADA' },
  ALL_STAR_MENSAL: { nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' },
  ALL_STAR_TEMPORADA: { nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' },
}

export const SKUS: readonly Sku[] = Object.keys(COMPOSICAO) as Sku[]

/**
 * O nome que o comprador vê na fatura do cartão e no e-mail do Mercado Pago.
 * Sem acento e sem símbolo: é texto que atravessa a API de um terceiro, e
 * uma fatura ilegível vira contestação.
 */
export const NOME_DO_SKU: Record<Sku, string> = {
  MVP_MENSAL: 'NIP MVP mensal',
  MVP_TEMPORADA: 'NIP MVP temporada',
  ALL_STAR_MENSAL: 'NIP All Star mensal',
  ALL_STAR_TEMPORADA: 'NIP All Star temporada',
}

export function composicaoDoSku(sku: Sku): { nivelDoPlano: NivelPago; modalidade: Modalidade } {
  return COMPOSICAO[sku]
}

/**
 * O SKU chega de formulário, então chega como string de fora. `in` sozinho
 * aceitaria `__proto__` e `toString`, que existem na cadeia de protótipo de
 * qualquer objeto — a checagem é contra a lista, não contra o objeto.
 */
export function ehSku(valor: string): valor is Sku {
  return (SKUS as readonly string[]).includes(valor)
}

export type Oferta = {
  sku: Sku
  nivelDoPlano: NivelPago
  modalidade: Modalidade
  /**
   * Comprar isto encerra o plano PAGO de hoje, sem devolução — a tela avisa
   * antes. Cortesia não conta: ela é preservada na revogação (quem concedeu é
   * quem tira), então avisar "o seu plano atual é encerrado" a quem só tem
   * cortesia seria a tela ameaçando algo que o código não faz. É a `modalidade`
   * que separa os dois: cortesia não tem modalidade, porque ninguém pagou.
   */
  substituiPlanoAtual: boolean
}

/**
 * O QUE ESTA PESSOA PODE COMPRAR AGORA (spec §9).
 *
 * Quatro recusas, cada uma por um motivo diferente:
 *
 * 1. Temporada fora da janela. A data vendida é fixa (decisão 4) e, passada
 *    ela, não há o que vender — o seletor esconde sozinho, sem ninguém
 *    lembrar de desligar nada.
 * 2. Temporada → mensal. Quem já pagou a temporada inteira não tem por que
 *    voltar a uma cobrança recorrente; a spec chama essa compra de
 *    inexistente.
 * 3. Nível abaixo do ativo. Downgrade não existe (decisão 12): quem quer
 *    descer cancela e deixa vencer. Vale em QUALQUER modalidade — o texto da
 *    spec §9 fala em "mesma modalidade", mas a decisão 12 é mais ampla e é
 *    ela que manda (ruling R-B5).
 * 4. O mesmo par que já se tem. Comprar de novo o que já se tem só gastaria
 *    dinheiro.
 */
export function ofertasDisponiveis(
  acesso: { nivel: NivelDoPlano; modalidade: Modalidade | null },
  agora: Date,
  fimDaTemporada: Date,
): Oferta[] {
  const temporadaAberta = agora.getTime() < fimDaTemporada.getTime()
  const ofertas: Oferta[] = []
  for (const sku of SKUS) {
    const { nivelDoPlano, modalidade } = COMPOSICAO[sku]
    if (modalidade === 'TEMPORADA' && !temporadaAberta) continue
    if (acesso.modalidade === 'TEMPORADA' && modalidade === 'MENSAL') continue
    if (!atende(nivelDoPlano, acesso.nivel)) continue
    if (nivelDoPlano === acesso.nivel && modalidade === acesso.modalidade) continue
    ofertas.push({
      sku,
      nivelDoPlano,
      modalidade,
      substituiPlanoAtual: acesso.nivel !== 'GRATIS' && acesso.modalidade !== null,
    })
  }
  return ofertas
}
