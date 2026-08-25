import webPush from 'web-push'
import type { RequestOptions, SendResult } from 'web-push'
import { z } from 'zod'

import {
  exigirConfiguracaoPush,
  type AmbientePush,
  type ConfiguracaoPushAtiva,
} from './configuracao'
import { mensagemPushExpirada, validarMensagemPushV1, type MensagemPushV1 } from './contrato'
import type { InscricaoPush, PortaEnvioPush, ResultadoEnvioPush } from './porta'
import { endpointPushPermitido } from '../../plataforma/push/endpoint'

const inscricaoSchema = z
  .object({
    endpoint: z.string().url().refine(endpointPushPermitido, {
      message: 'endpoint de Push não permitido',
    }),
    expirationTime: z.number().finite().nonnegative().nullable(),
    chaves: z
      .object({
        p256dh: z.string().min(1).max(1024),
        auth: z.string().min(1).max(1024),
      })
      .strict(),
  })
  .strict()

export interface ClienteWebPush {
  sendNotification(
    subscription: {
      endpoint: string
      expirationTime: number | null
      keys: { p256dh: string; auth: string }
    },
    payload: string,
    options: RequestOptions,
  ): Promise<SendResult>
}

export type OpcoesEnvioWebPush = {
  timeoutMs?: number
  agora?: () => Date
  cliente?: ClienteWebPush
}

export class EnvioWebPush implements PortaEnvioPush {
  private readonly timeoutMs: number
  private readonly agora: () => Date
  private readonly cliente: ClienteWebPush

  constructor(
    private readonly configuracao: ConfiguracaoPushAtiva,
    opcoes: OpcoesEnvioWebPush = {},
  ) {
    this.timeoutMs = opcoes.timeoutMs ?? 8000
    this.agora = opcoes.agora ?? (() => new Date())
    this.cliente = opcoes.cliente ?? webPush
  }

  async enviar(inscricao: InscricaoPush, mensagem: MensagemPushV1): Promise<ResultadoEnvioPush> {
    const mensagemValidada = validarMensagemPushV1(mensagem)
    const agora = this.agora()
    if (mensagemPushExpirada(mensagemValidada, agora)) return { tipo: 'EXPIRADO' }

    const inscricaoValidada = inscricaoSchema.safeParse(inscricao)
    if (!inscricaoValidada.success) return { tipo: 'ERRO_PERMANENTE', statusCode: null }
    const ttl = Math.max(
      0,
      Math.floor((Date.parse(mensagemValidada.expiraEm) - agora.getTime()) / 1000),
    )

    try {
      const resposta = await this.cliente.sendNotification(
        {
          endpoint: inscricaoValidada.data.endpoint,
          expirationTime: inscricaoValidada.data.expirationTime,
          keys: inscricaoValidada.data.chaves,
        },
        JSON.stringify(mensagemValidada),
        {
          vapidDetails: {
            subject: this.configuracao.subject,
            publicKey: this.configuracao.chavePublica,
            privateKey: this.configuracao.chavePrivada,
          },
          TTL: ttl,
          timeout: this.timeoutMs,
          urgency: mensagemValidada.canal === 'LISTA_SECRETA' ? 'normal' : 'high',
          contentEncoding: 'aes128gcm',
        },
      )
      return classificarStatus(resposta.statusCode, resposta.headers, agora)
    } catch (erro) {
      return classificarErro(erro, agora)
    }
  }
}

export function criarEnvioWebPush(
  ambiente: AmbientePush = process.env,
  opcoes: OpcoesEnvioWebPush = {},
): EnvioWebPush {
  return new EnvioWebPush(exigirConfiguracaoPush(ambiente), opcoes)
}

function classificarStatus(statusCode: number, headers: unknown, agora: Date): ResultadoEnvioPush {
  if (statusCode >= 200 && statusCode <= 299) return { tipo: 'ENVIADO', statusCode }
  if (statusCode === 404 || statusCode === 410) {
    return { tipo: 'INSCRICAO_INVALIDA', statusCode }
  }
  if (statusCode === 429) {
    return {
      tipo: 'RETRY',
      motivo: 'RATE_LIMIT',
      statusCode,
      retryAfterMs: lerRetryAfter(headers, agora),
    }
  }
  if (statusCode >= 500) {
    return {
      tipo: 'RETRY',
      motivo: 'SERVIDOR',
      statusCode,
      retryAfterMs: lerRetryAfter(headers, agora),
    }
  }
  if (statusCode === 401 || statusCode === 403) return { tipo: 'ERRO_VAPID', statusCode }
  return { tipo: 'ERRO_PERMANENTE', statusCode }
}

function classificarErro(erro: unknown, agora: Date): ResultadoEnvioPush {
  const statusCode = statusDoErro(erro)
  if (statusCode !== null) return classificarStatus(statusCode, headersDoErro(erro), agora)

  const codigo = codigoDoErro(erro)
  const mensagem = erro instanceof Error ? erro.message.toLowerCase() : ''
  if (codigo === 'ETIMEDOUT' || mensagem.includes('timeout')) {
    return { tipo: 'RETRY', motivo: 'TIMEOUT', statusCode: null, retryAfterMs: null }
  }
  if (
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ECONNABORTED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
    ].includes(codigo ?? '')
  ) {
    return { tipo: 'RETRY', motivo: 'REDE', statusCode: null, retryAfterMs: null }
  }
  if (mensagem.includes('vapid')) return { tipo: 'ERRO_VAPID', statusCode: null }
  return { tipo: 'ERRO_PERMANENTE', statusCode: null }
}

function statusDoErro(erro: unknown): number | null {
  if (typeof erro !== 'object' || erro === null || !('statusCode' in erro)) return null
  const status = (erro as { statusCode?: unknown }).statusCode
  return typeof status === 'number' && Number.isInteger(status) ? status : null
}

function headersDoErro(erro: unknown): unknown {
  if (typeof erro !== 'object' || erro === null || !('headers' in erro)) return undefined
  return (erro as { headers?: unknown }).headers
}

function codigoDoErro(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null || !('code' in erro)) return null
  const codigo = (erro as { code?: unknown }).code
  return typeof codigo === 'string' ? codigo : null
}

function lerRetryAfter(headers: unknown, agora: Date): number | null {
  if (typeof headers !== 'object' || headers === null) return null
  const entradas = Object.entries(headers as Record<string, unknown>)
  const valor = entradas.find(([nome]) => nome.toLowerCase() === 'retry-after')?.[1]
  const texto = Array.isArray(valor) ? valor[0] : valor
  if (typeof texto !== 'string') return null

  const segundos = Number(texto)
  if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000
  const instante = Date.parse(texto)
  if (!Number.isFinite(instante)) return null
  return Math.max(0, instante - agora.getTime())
}
