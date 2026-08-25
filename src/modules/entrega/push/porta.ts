import type { MensagemPushV1 } from './contrato'

export type InscricaoPush = {
  endpoint: string
  expirationTime: number | null
  chaves: {
    p256dh: string
    auth: string
  }
}

export type ResultadoEnvioPush =
  | { tipo: 'ENVIADO'; statusCode: number }
  | { tipo: 'EXPIRADO' }
  | { tipo: 'INSCRICAO_INVALIDA'; statusCode: 404 | 410 }
  | {
      tipo: 'RETRY'
      motivo: 'RATE_LIMIT' | 'SERVIDOR' | 'REDE' | 'TIMEOUT'
      statusCode: number | null
      retryAfterMs: number | null
    }
  | { tipo: 'ERRO_VAPID'; statusCode: 401 | 403 | null }
  | { tipo: 'ERRO_PERMANENTE'; statusCode: number | null }

export interface PortaEnvioPush {
  enviar(inscricao: InscricaoPush, mensagem: MensagemPushV1): Promise<ResultadoEnvioPush>
}
