/**
 * PORTA DE PAGAMENTO — camada anticorrupção.
 *
 * Mesma disciplina da ingestão: nenhum campo com nome de provedor atravessa.
 * O Mercado Pago chama de `preapproval`, `payer_id`, `external_reference`;
 * daqui pra dentro é assinatura, usuário e referência.
 */

export type EventoPagamento = {
  /** Id do EVENTO no provedor. É a chave de idempotência. */
  eventoExternoId: string
  tipo: 'PAGAMENTO_APROVADO' | 'PAGAMENTO_RECUSADO' | 'ASSINATURA_CANCELADA' | 'OUTRO'
  /** Referência que ligamos ao usuário na criação da cobrança. */
  referenciaExterna: string | null
  assinaturaExternaId: string | null
  plano: string | null
  proximaCobranca: string | null
  bruto: unknown
}

export interface PortaPagamento {
  readonly nome: string
  /** Traduz a notificação crua do provedor para o evento canônico. */
  interpretarNotificacao(corpo: unknown, cabecalhos: Record<string, string>): Promise<EventoPagamento | null>
  /** Valida a assinatura criptográfica da notificação. */
  verificarAssinatura(corpoBruto: string, cabecalhos: Record<string, string>): boolean
}
