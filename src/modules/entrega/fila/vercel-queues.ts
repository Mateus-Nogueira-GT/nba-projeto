import type { MensagemPush, PortaFila } from './porta'
import {
  chaveFanout,
  enviarIdempotente,
  expansaoInicial,
  TOPICO_PUSH_EVENTOS,
  type EnvioFila,
} from '../push/fanout'

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
  // `enviar` só é trocado em teste; em produção é o `send` da fila.
  constructor(private readonly enviar?: EnvioFila) {}

  async enfileirar(mensagens: MensagemPush[]): Promise<void> {
    await Promise.all(
      mensagens.map((m) =>
        enviarIdempotente(
          TOPICO_PUSH,
          expansaoInicial(m),
          {
            // Segunda barreira de deduplicação, do lado da fila. A primeira e
            // decisiva é a UNIQUE no banco. Chave já usada é sucesso (W2-2).
            idempotencyKey: chaveFanout('evento', m.chave),
          },
          this.enviar,
        ),
      ),
    )
  }
}
