import { handleCallback } from '@vercel/queue'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  configuracaoOperacionalPush,
  enviarLotePush,
  ErroRetryPush,
  ErroVapidPush,
  politicaHomologacaoDoAmbiente,
} from '@/modules/entrega/push/fanout'
import { criarEnvioWebPush } from '@/modules/entrega/push/web-push'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const configuracao = configuracaoOperacionalPush()

export const POST = handleCallback(
  async (mensagem, metadata) => {
    const inicio = Date.now()
    const contagens = await enviarLotePush(
      getDb(),
      criarEnvioWebPush(),
      mensagem,
      politicaHomologacaoDoAmbiente(),
      configuracao,
    )
    console.info(
      JSON.stringify({
        evento: 'push_lote_processado',
        messageId: metadata.messageId,
        entrega: metadata.deliveryCount,
        atrasoMs: Math.max(0, Date.now() - metadata.createdAt.getTime()),
        ...contagens,
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
            evento: 'push_lote_invalido',
            messageId: metadata.messageId,
            entrega: metadata.deliveryCount,
          }),
        )
        return { acknowledge: true }
      }
      if (erro instanceof ErroVapidPush) {
        console.error(
          JSON.stringify({
            evento: 'push_erro_vapid_global',
            messageId: metadata.messageId,
            entrega: metadata.deliveryCount,
          }),
        )
        return { afterSeconds: 300 }
      }
      if (erro instanceof ErroRetryPush) {
        console.warn(
          JSON.stringify({
            evento: 'push_lote_retry',
            messageId: metadata.messageId,
            entrega: metadata.deliveryCount,
            retryAfterMs: erro.retryAfterMs,
            motivos: erro.motivos,
          }),
        )
        return {
          afterSeconds:
            erro.retryAfterMs === null
              ? Math.min(
                  900,
                  configuracao.retryBaseSegundos * 2 ** Math.min(metadata.deliveryCount, 5),
                )
              : Math.max(1, Math.ceil(erro.retryAfterMs / 1000)),
        }
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
