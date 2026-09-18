/** Camada anticorrupção entre o produto e o provedor de cobrança. */

export type TipoEventoPagamento =
  | 'PAGAMENTO_APROVADO'
  | 'PAGAMENTO_RECUSADO'
  | 'PAGAMENTO_ESTORNADO'
  | 'PAGAMENTO_CONTESTADO'
  | 'ASSINATURA_ATUALIZADA'
  | 'ASSINATURA_CANCELADA'
  | 'OUTRO'

export type EventoPagamento = {
  /** Id do aviso no provedor; é a chave de idempotência do webhook. */
  eventoExternoId: string
  tipo: TipoEventoPagamento
  /** Referência opaca gerada antes da chamada ao provedor. */
  referenciaExterna: string | null
  assinaturaExternaId: string | null
  cobrancaExternaId?: string | null
  recursoTipo?: 'ASSINATURA' | 'COBRANCA' | 'OUTRO'
  plano: string | null
  proximaCobranca: string | null
  ocorridoEm?: string | null
  valorCentavos?: number | null
  moeda?: string | null
  statusExterno?: string | null
  /** Apenas campos sanitizados; nunca cartão, token ou payload integral. */
  bruto: unknown
}

export type AvisoPagamento = {
  corpoBruto: string
  cabecalhos: Record<string, string>
  parametros: Record<string, string>
  /** Obrigatório no fluxo HTTP; opcional apenas para testes unitários diretos. */
  agora?: Date
}

export type PedidoCriacaoAssinatura = {
  referenciaExterna: string
  chaveIdempotencia: string
  emailPagador: string
  nomePlano: string
  valorCentavos: number
  moeda: 'BRL'
  frequencia: number
  tipoFrequencia: 'months'
  urlRetorno: string
}

/**
 * A COMPRA QUE ACONTECE UMA VEZ — a temporada (spec §9).
 *
 * Quase igual ao pedido de assinatura, menos os dois campos que só existem
 * em recorrência (`frequencia`, `tipoFrequencia`). Separar os tipos em vez de
 * tornar os dois campos opcionais é o que faz o compilador cobrar a
 * frequência de quem cria `preapproval` e nunca cobrá-la de quem não tem
 * recorrência nenhuma.
 *
 * Sem `nivelDoPlano` de propósito (ruling R-B1): o provedor não tem conceito
 * de nível da NIP. O nível viaja em `nomePlano`, que é o que o comprador vê
 * na fatura, e canonicamente na `tentativas_checkout`, que é de onde o
 * webhook lê.
 */
export type PedidoPagamentoUnico = {
  referenciaExterna: string
  chaveIdempotencia: string
  emailPagador: string
  nomePlano: string
  valorCentavos: number
  moeda: 'BRL'
  urlRetorno: string
}

/**
 * O que volta de criar uma intenção de pagamento único.
 *
 * `id` é o da PREFERÊNCIA, não o do pagamento: o pagamento só nasce quando
 * alguém paga, e o id dele chega pelo webhook. Por isso não há `status` aqui
 * — preferência não tem estado de cobrança, e um campo `status` convidaria
 * alguém a liberar acesso pela ida em vez de pela confirmação.
 */
export type PagamentoExterno = {
  id: string
  referenciaExterna: string | null
  urlCheckout: string | null
  ocorridoEm: string | null
}

export type AssinaturaExterna = {
  id: string
  referenciaExterna: string | null
  status: string
  nomePlano: string | null
  urlCheckout: string | null
  proximaCobranca: string | null
  ocorridoEm: string | null
}

export type CobrancaExterna = {
  id: string
  assinaturaExternaId: string | null
  referenciaExterna: string | null
  status: string
  valorCentavos: number | null
  moeda: string | null
  ocorridoEm: string | null
  proximaCobranca: string | null
}

export interface PortaPagamento {
  readonly nome: string
  interpretarNotificacao(corpo: unknown, aviso: AvisoPagamento): Promise<EventoPagamento | null>
  verificarAssinatura(aviso: AvisoPagamento): boolean
}

export interface PortaCobranca extends PortaPagamento {
  criarAssinatura(pedido: PedidoCriacaoAssinatura): Promise<AssinaturaExterna>
  consultarAssinatura(id: string): Promise<AssinaturaExterna>
  buscarPorReferencia(referenciaExterna: string): Promise<AssinaturaExterna | null>
  cancelarAssinatura(id: string, chaveIdempotencia: string): Promise<AssinaturaExterna>
  listarCobrancasDaAssinatura(id: string): Promise<CobrancaExterna[]>
  criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno>
  /**
   * A volta do pagamento único. A busca é POR REFERÊNCIA e não por id porque
   * o id que a NIP guardou é o da preferência — o do pagamento ela só vai
   * conhecer pelo webhook, e a reconciliação existe justamente para o caso em
   * que o webhook não chegou.
   */
  buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null>
}
