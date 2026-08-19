import { handleCallback } from '@vercel/queue'

import { getDb } from '@/modules/dominio/db/cliente'
import { destinatariosDoCanal } from '@/modules/entrega/fire-live/push'
import type { MensagemPush } from '@/modules/entrega/fila/porta'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * CONSUMIDOR DA FILA — é aqui que o fan-out acontece.
 *
 * A separação é o que sustenta os 10.000 simultâneos: o ciclo de observação
 * enfileira UM evento e volta a olhar o jogo em milissegundos; expandir esse
 * evento para os assinantes é trabalho de outro processo, que pode demorar.
 *
 * A preferência por canal é respeitada AQUI, no fan-out — nunca antes. O
 * evento é o mesmo para todos; só a lista de quem recebe muda
 * (docs/01-arquitetura.md > "10.000 simultâneos").
 */
export const POST = handleCallback<MensagemPush>(async (mensagem) => {
  const destinatarios = await destinatariosDoCanal(getDb(), mensagem.canal)

  // TODO(entrega): envio Web Push por inscrição. A resolução de destinatários
  // e o contrato da mensagem já estão fechados e testados — falta o transporte
  // (VAPID + web-push), que é a próxima fatia e não pertence ao Fire Live.
  console.info('[push] %s -> %d destinatários', mensagem.chave, destinatarios.length)
})
