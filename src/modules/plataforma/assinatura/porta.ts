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
}
