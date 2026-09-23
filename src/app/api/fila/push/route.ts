import { handleCallback } from '@vercel/queue'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { registrarEventoExpiradoSemFalhar } from '@/modules/entrega/observabilidade/falhas-operacionais'
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
    // Evento que venceu antes de virar lote: nenhum assinante recebe, e só o
    // log acima não avisa ninguém (W2-2/W2-5). Nunca lança — a mensagem
    // confirma de qualquer jeito, reentregar um evento vencido não adianta.
    await registrarEventoExpiradoSemFalhar(
      getDb(),
      resultado,
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
