import { send } from '@vercel/queue'
import type { MensagemPush, PortaFila } from './porta'
import { chaveFanout, expansaoInicial, TOPICO_PUSH_EVENTOS } from '../push/fanout'

/** Compatibilidade nominal para consumidores internos antigos. */
export const TOPICO_PUSH = TOPICO_PUSH_EVENTOS

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
        send(TOPICO_PUSH, expansaoInicial(m), {
          // Segunda barreira de deduplicação, do lado da fila. A primeira e
          // decisiva é a UNIQUE no banco.
          idempotencyKey: chaveFanout('evento', m.chave),
        }),
      ),
    )
  }
}
