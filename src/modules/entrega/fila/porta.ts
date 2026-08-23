import type { MensagemPushV1 } from '../push/contrato'

export type CanalPush = MensagemPushV1['canal']
export type MensagemPush = MensagemPushV1

/**
 * UM evento na fila, não uma mensagem por usuário.
 *
 * O fan-out para os 10k assinantes acontece do outro lado, no consumidor.
 * Enfileirar por usuário seria 10.000 mensagens por apito e mataria a conta —
 * "a avaliação acontece uma vez por evento, não uma vez por usuário"
 * (docs/01-arquitetura.md).
 */
export interface PortaFila {
  enfileirar(mensagens: MensagemPush[]): Promise<void>
}
