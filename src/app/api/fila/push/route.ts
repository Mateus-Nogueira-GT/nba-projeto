import { handleCallback } from '@vercel/queue'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  configuracaoOperacionalPush,
  expandirEventoPush,
  politicaHomologacaoDoAmbiente,
  PublicadorFanoutVercel,
} from '@/modules/entrega/push/fanout'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const configuracao = configuracaoOperacionalPush()

export const POST: (request: Request) => Promise<Response> = handleCallback(
  async (mensagem, metadata) => {
    const inicio = Date.now()
    const resultado = await expandirEventoPush(
      getDb(),
      new PublicadorFanoutVercel(),
      mensagem,
      politicaHomologacaoDoAmbiente(),
      configuracao,
    )
    console.info(
      JSON.stringify({
        evento: 'push_fanout_expandido',
        messageId: metadata.messageId,
        entrega: metadata.deliveryCount,
        atrasoMs: Math.max(0, Date.now() - metadata.createdAt.getTime()),
        ...resultado,
        duracaoMs: Date.now() - inicio,
      }),
    )
  },
  {
    visibilityTimeoutSeconds: configuracao.visibilidadeSegundos,
    retry: (erro, metadata) => {
      if (erro instanceof ZodError) {
        console.error(
          JSON.stringify({
            evento: 'push_evento_invalido',
            messageId: metadata.messageId,
            entrega: metadata.deliveryCount,
          }),
        )
        return { acknowledge: true }
      }
      return {
        afterSeconds: Math.min(
          900,
          configuracao.retryBaseSegundos * 2 ** Math.min(metadata.deliveryCount, 5),
        ),
      }
    },
  },
)
