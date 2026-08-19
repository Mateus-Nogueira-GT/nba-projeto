import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EventoPagamento, PortaPagamento } from './porta'

export type ConfigMercadoPago = {
  accessToken: string
  segredoWebhook: string
  /** A conta é do CLIENTE. Enquanto ela não existir, sandbox. */
  sandbox: boolean
}

/**
 * Lê a configuração do ambiente.
 *
 * As credenciais NUNCA entram no código: vêm de `vercel env`. A conta do
 * Mercado Pago é do cliente, criada e mantida em nome dele — nós apenas
 * recebemos acesso de colaborador para gerar as chaves de integração.
 */
export function configDoAmbiente(): ConfigMercadoPago | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  const segredoWebhook = process.env.MERCADOPAGO_WEBHOOK_SECRET

  if (!accessToken || !segredoWebhook) return null

  return {
    accessToken,
    segredoWebhook,
    sandbox: process.env.MERCADOPAGO_SANDBOX !== 'false',
  }
}

type Json = Record<string, unknown>

function textoOuNulo(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number') return String(v)
  return null
}

/** O manifesto de assinatura do Mercado Pago inclui o id de `data`. */
function idDoCorpo(corpoBruto: string): string {
  try {
    const dados = (JSON.parse(corpoBruto) as Json)['data']
    return textoOuNulo((dados as Json | undefined)?.['id']) ?? ''
  } catch {
    return ''
  }
}

export class PagamentoMercadoPago implements PortaPagamento {
  readonly nome = 'mercadopago'

  constructor(private readonly config: ConfigMercadoPago) {}

  /**
   * Valida a assinatura do webhook.
   *
   * Sem isso, qualquer um que descubra a URL libera assinatura de graça
   * mandando um POST.
   */
  verificarAssinatura(corpoBruto: string, cabecalhos: Record<string, string>): boolean {
    const assinatura = cabecalhos['x-signature']
    const requestId = cabecalhos['x-request-id'] ?? ''
    if (!assinatura) return false

    const partes = Object.fromEntries(
      assinatura.split(',').map((p) => p.split('=').map((x) => x.trim()) as [string, string]),
    )
    const ts = partes['ts']
    const v1 = partes['v1']
    if (!ts || !v1) return false

    const dataId = idDoCorpo(corpoBruto)

    const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`
    const esperado = createHmac('sha256', this.config.segredoWebhook).update(manifesto).digest('hex')

    const a = Buffer.from(esperado, 'utf8')
    const b = Buffer.from(v1, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  async interpretarNotificacao(corpo: unknown, _cabecalhos: Record<string, string>) {
    const c = corpo as Json
    const dados = (c['data'] ?? {}) as Json

    const eventoExternoId = String(c['id'] ?? dados['id'] ?? '')
    if (eventoExternoId === '') return null

    const acao = String(c['action'] ?? c['type'] ?? '')
    const status = String(dados['status'] ?? '')

    const tipo: EventoPagamento['tipo'] =
      status === 'approved' || status === 'authorized'
        ? 'PAGAMENTO_APROVADO'
        : status === 'rejected'
          ? 'PAGAMENTO_RECUSADO'
          : acao.includes('cancel') || status === 'cancelled'
            ? 'ASSINATURA_CANCELADA'
            : 'OUTRO'

    return {
      eventoExternoId,
      tipo,
      referenciaExterna: textoOuNulo(dados['external_reference']),
      assinaturaExternaId: textoOuNulo(dados['preapproval_id']) ?? textoOuNulo(dados['id']),
      plano: textoOuNulo(dados['reason']),
      proximaCobranca: textoOuNulo(dados['next_payment_date']),
      bruto: corpo,
    }
  }
}
