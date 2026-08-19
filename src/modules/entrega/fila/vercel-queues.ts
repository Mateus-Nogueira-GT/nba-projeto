import { send } from '@vercel/queue'
import type { MensagemPush, PortaFila } from './porta'

/** Tópico do fan-out de push. Ver ADR-0003. */
export const TOPICO_PUSH = 'push-apitos'

/**
 * Adapter do Vercel Queues.
 *
 * O fan-out para os 10k assinantes acontece do outro lado da fila, no
 * consumidor — nunca dentro do ciclo de observação. O ciclo tem que devolver
 * o controle em segundos para voltar a observar o jogo.
 */
export class FilaVercel implements PortaFila {
  async enfileirar(mensagens: MensagemPush[]): Promise<void> {
    await Promise.all(
      mensagens.map((m) =>
        send(TOPICO_PUSH, m, {
          // Segunda barreira de deduplicação, do lado da fila. A primeira e
          // decisiva é a UNIQUE no banco.
          idempotencyKey: m.chave,
        }),
      ),
    )
  }
}
