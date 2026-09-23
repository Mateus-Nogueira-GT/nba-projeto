import { handleCallback } from '@vercel/queue'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  configuracaoOperacionalPush,
  enviarLotePush,
  ErroRetryPush,
  ErroVapidPush,
  politicaHomologacaoDoAmbiente,
  PublicadorFanoutVercel,
} from '@/modules/entrega/push/fanout'
import { registrarExpiradosSemFalhar } from '@/modules/entrega/observabilidade/falhas-operacionais'
import { criarEnvioWebPush } from '@/modules/entrega/push/web-push'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const configuracao = configuracaoOperacionalPush()

export const POST: (request: Request) => Promise<Response> = handleCallback(
  async (mensagem, metadata) => {
    const inicio = Date.now()
    const contagens = await enviarLotePush(
      getDb(),
      criarEnvioWebPush(),
      mensagem,
      politicaHomologacaoDoAmbiente(),
      configuracao,
      new Date(),
      // Com o publicador, retry vira um lote novo só com as que falharam, e esta
      // mensagem é confirmada — sem reenviar a quem já recebeu (W2-2).
      new PublicadorFanoutVercel(),
    )
    if (contagens.vapidGlobal) {
      // A VAPID recusada no lote todo não lança mais quando há publicador (W2-2):
      // as recusadas voltam num lote novo em 60 s e esta mensagem é confirmada.
      // O alarme continua saindo, com a mesma linha de antes.
      console.error(
        JSON.stringify({
          evento: 'push_erro_vapid_global',
          messageId: metadata.messageId,
          entrega: metadata.deliveryCount,
        }),
      )
    }
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
    // Ninguém via um apito vencer antes de chegar (W2-2 grava, W2-5 alerta):
    // a saúde soma a janela de 10 min e avisa a equipe uma vez. Falha ao
    // GRAVAR o alerta não pode derrubar a confirmação da mensagem (fix
    // round 1) — `registrarExpiradosSemFalhar` nunca lança.
    await registrarExpiradosSemFalhar(
      getDb(),
      contagens,
      (mensagem as { evento?: { canal?: string } }).evento?.canal ?? null,
      new Date(),
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
        // 300 s era a validade inteira de um apito de Fire Live (W2-2).
        return { afterSeconds: 60 }
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
