import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import type {
  AssinaturaExterna,
  AvisoPagamento,
  CobrancaExterna,
  EventoPagamento,
  PagamentoExterno,
  PedidoCriacaoAssinatura,
  PedidoPagamentoUnico,
  PortaCobranca,
  TipoEventoPagamento,
} from './porta'

export type ConfigMercadoPago = {
  accessToken: string
  segredoWebhook: string
  sandbox: boolean
  timeoutMs?: number
  toleranciaWebhookMs?: number
}

export function configDoAmbiente(): ConfigMercadoPago | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  const segredoWebhook = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!accessToken || !segredoWebhook) return null

  return {
    accessToken,
    segredoWebhook,
    sandbox: process.env.MERCADOPAGO_SANDBOX !== 'false',
    timeoutMs: 8_000,
    toleranciaWebhookMs: 5 * 60_000,
  }
}

type Fetch = typeof fetch
const dataIso = z.string().datetime({ offset: true }).nullish()
const idSchema = z.union([z.string(), z.number()]).transform(String)
const dinheiroSchema = z.union([z.number(), z.string()]).transform((valor, contexto) => {
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < 0) {
    contexto.addIssue({ code: 'custom', message: 'valor monetário inválido' })
    return z.NEVER
  }
  return Math.round(numero * 100)
})

const assinaturaSchema = z
  .object({
    id: idSchema,
    status: z.string().min(1),
    external_reference: idSchema.nullish(),
    reason: z.string().nullish(),
    init_point: z.string().url().nullish(),
    next_payment_date: dataIso,
    last_modified: dataIso,
    date_created: dataIso,
  })
  .passthrough()

const pagamentoSchema = z
  .object({
    id: idSchema,
    status: z.string().min(1),
    external_reference: idSchema.nullish(),
    preapproval_id: idSchema.nullish(),
    description: z.string().nullish(),
    transaction_amount: dinheiroSchema.nullish(),
    currency_id: z.string().nullish(),
    date_approved: dataIso,
    date_last_updated: dataIso,
    date_created: dataIso,
  })
  .passthrough()

const faturaSchema = z
  .object({
    id: idSchema,
    status: z.string().min(1),
    summarized: z.string().nullish(),
    preapproval_id: idSchema.nullish(),
    external_reference: idSchema.nullish(),
    reason: z.string().nullish(),
    transaction_amount: dinheiroSchema.nullish(),
    currency_id: z.string().nullish(),
    debit_date: dataIso,
    last_modified: dataIso,
    date_created: dataIso,
    payment: z
      .object({ id: idSchema, status: z.string().min(1), status_detail: z.string().nullish() })
      .nullish(),
  })
  .passthrough()

const preferenciaSchema = z
  .object({
    id: idSchema,
    external_reference: idSchema.nullish(),
    init_point: z.string().url().nullish(),
    sandbox_init_point: z.string().url().nullish(),
    date_created: dataIso,
  })
  .passthrough()

const buscaPagamentosSchema = z.object({ results: z.array(pagamentoSchema) }).passthrough()

const buscaAssinaturasSchema = z.object({ results: z.array(assinaturaSchema) }).passthrough()
const buscaFaturasSchema = z.object({ results: z.array(faturaSchema) }).passthrough()

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.length > 0) return valor
  if (typeof valor === 'number') return String(valor)
  return null
}

function assinaturaCanonica(bruto: unknown): AssinaturaExterna {
  const recurso = assinaturaSchema.parse(bruto)
  return {
    id: recurso.id,
    referenciaExterna: textoOuNulo(recurso.external_reference),
    status: recurso.status,
    nomePlano: recurso.reason ?? null,
    urlCheckout: recurso.init_point ?? null,
    proximaCobranca: recurso.next_payment_date ?? null,
    ocorridoEm: recurso.last_modified ?? recurso.date_created ?? null,
  }
}

/**
 * Recebe o item JÁ analisado por `faturaSchema`, nunca `unknown`. `bruto`
 * já roda `dinheiroSchema`, que multiplica o valor por 100; parsear de novo
 * aqui multiplicaria por 100 uma segunda vez — era o defeito que fazia
 * `listarCobrancasDaAssinatura` gravar `valorCentavos` 100× maior, porque ela
 * já parseia a lista inteira antes de mapear cada item por aqui.
 */
function faturaCanonica(
  recurso: z.infer<typeof faturaSchema>,
  proximaCobranca: string | null = null,
): CobrancaExterna {
  return {
    id: recurso.payment?.id ?? recurso.id,
    assinaturaExternaId: textoOuNulo(recurso.preapproval_id),
    referenciaExterna: textoOuNulo(recurso.external_reference),
    status: recurso.payment?.status ?? recurso.summarized ?? recurso.status,
    valorCentavos: recurso.transaction_amount ?? null,
    moeda: recurso.currency_id ?? null,
    ocorridoEm: recurso.last_modified ?? recurso.debit_date ?? recurso.date_created ?? null,
    proximaCobranca,
  }
}

function preferenciaCanonica(bruto: unknown, sandbox: boolean): PagamentoExterno {
  const recurso = preferenciaSchema.parse(bruto)
  return {
    id: recurso.id,
    referenciaExterna: textoOuNulo(recurso.external_reference),
    // Em sandbox, `init_point` aponta para a PRODUÇÃO e cobra de verdade —
    // mandar o testador para lá é cobrar cartão real num teste.
    urlCheckout: (sandbox ? recurso.sandbox_init_point : recurso.init_point) ?? null,
    ocorridoEm: recurso.date_created ?? null,
  }
}

function pagamentoCanonico(recurso: z.infer<typeof pagamentoSchema>): CobrancaExterna {
  return {
    id: recurso.id,
    assinaturaExternaId: textoOuNulo(recurso.preapproval_id),
    referenciaExterna: textoOuNulo(recurso.external_reference),
    status: recurso.status,
    valorCentavos: recurso.transaction_amount ?? null,
    moeda: recurso.currency_id ?? null,
    ocorridoEm: recurso.date_last_updated ?? recurso.date_approved ?? recurso.date_created ?? null,
    // Pagamento único não tem próxima: é o que diz ao webhook que a validade
    // vem de TEMPORADA_FIM, e não do provedor.
    proximaCobranca: null,
  }
}

function tipoDaCobranca(status: string): TipoEventoPagamento {
  if (status === 'approved') return 'PAGAMENTO_APROVADO'
  if (status === 'rejected' || status === 'cancelled' || status === 'canceled') {
    return 'PAGAMENTO_RECUSADO'
  }
  if (status === 'refunded') return 'PAGAMENTO_ESTORNADO'
  if (status === 'charged_back') return 'PAGAMENTO_CONTESTADO'
  return 'OUTRO'
}

function corpoSeguro(evento: EventoPagamento): object {
  return {
    tipo: evento.tipo,
    recursoTipo: evento.recursoTipo,
    recursoExternoId: evento.cobrancaExternaId ?? evento.assinaturaExternaId,
    assinaturaExternaId: evento.assinaturaExternaId,
    referenciaExterna: evento.referenciaExterna,
    statusExterno: evento.statusExterno,
    ocorridoEm: evento.ocorridoEm,
    valorCentavos: evento.valorCentavos,
    moeda: evento.moeda,
  }
}

export class PagamentoMercadoPago implements PortaCobranca {
  readonly nome = 'mercadopago'

  constructor(
    private readonly config: ConfigMercadoPago,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  verificarAssinatura(aviso: AvisoPagamento): boolean {
    const assinatura = aviso.cabecalhos['x-signature']
    const requestId = aviso.cabecalhos['x-request-id'] ?? ''
    if (!assinatura || !requestId) return false

    const partes = Object.fromEntries(
      assinatura
        .split(',')
        .map((parte) => parte.split('=', 2).map((item) => item.trim()) as [string, string]),
    )
    const ts = partes['ts']
    const v1 = partes['v1']
    const dataId = aviso.parametros['data.id'] ?? aviso.parametros['data_id'] ?? ''
    if (!ts || !/^\d+$/.test(ts) || !v1 || !/^[a-f0-9]{64}$/i.test(v1) || !dataId) return false

    if (aviso.agora) {
      const timestampMs = Number(ts) * 1_000
      const tolerancia = this.config.toleranciaWebhookMs ?? 5 * 60_000
      if (!Number.isSafeInteger(timestampMs) || Math.abs(aviso.agora.getTime() - timestampMs) > tolerancia) {
        return false
      }
    }

    // O contrato do Mercado Pago exige o data.id alfanumérico em minúsculas
    // no manifesto, mesmo quando a query preserva outra capitalização.
    const dataIdDoManifesto = /[a-z]/i.test(dataId) ? dataId.toLowerCase() : dataId
    const manifesto = `id:${dataIdDoManifesto};request-id:${requestId};ts:${ts};`
    const esperado = createHmac('sha256', this.config.segredoWebhook).update(manifesto).digest('hex')
    const a = Buffer.from(esperado, 'utf8')
    const b = Buffer.from(v1.toLowerCase(), 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  async criarAssinatura(pedido: PedidoCriacaoAssinatura): Promise<AssinaturaExterna> {
    const bruto = await this.requisitar('/preapproval', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': pedido.chaveIdempotencia },
      body: JSON.stringify({
        reason: pedido.nomePlano,
        external_reference: pedido.referenciaExterna,
        payer_email: pedido.emailPagador,
        auto_recurring: {
          frequency: pedido.frequencia,
          frequency_type: pedido.tipoFrequencia,
          transaction_amount: pedido.valorCentavos / 100,
          currency_id: pedido.moeda,
        },
        back_url: pedido.urlRetorno,
        status: 'pending',
      }),
    })
    return assinaturaCanonica(bruto)
  }

  async consultarAssinatura(id: string): Promise<AssinaturaExterna> {
    return assinaturaCanonica(await this.requisitar(`/preapproval/${encodeURIComponent(id)}`))
  }

  async buscarPorReferencia(referenciaExterna: string): Promise<AssinaturaExterna | null> {
    const bruto = await this.requisitar(
      `/preapproval/search?q=${encodeURIComponent(referenciaExterna)}&limit=20`,
    )
    const resultados = buscaAssinaturasSchema
      .parse(bruto)
      .results.filter((item) => textoOuNulo(item.external_reference) === referenciaExterna)
    if (resultados.length > 1) throw new Error('referência externa retornou mais de uma assinatura')
    return resultados[0] ? assinaturaCanonica(resultados[0]) : null
  }

  async cancelarAssinatura(id: string, chaveIdempotencia: string): Promise<AssinaturaExterna> {
    const bruto = await this.requisitar(`/preapproval/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'X-Idempotency-Key': chaveIdempotencia },
      body: JSON.stringify({ status: 'canceled' }),
    })
    return assinaturaCanonica(bruto)
  }

  async listarCobrancasDaAssinatura(id: string): Promise<CobrancaExterna[]> {
    const bruto = await this.requisitar(
      `/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}&limit=100`,
    )
    return buscaFaturasSchema.parse(bruto).results.map((item) => faturaCanonica(item))
  }

  async criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno> {
    const bruto = await this.requisitar('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': pedido.chaveIdempotencia },
      body: JSON.stringify({
        external_reference: pedido.referenciaExterna,
        payer: { email: pedido.emailPagador },
        items: [
          {
            id: pedido.referenciaExterna,
            title: pedido.nomePlano,
            quantity: 1,
            currency_id: pedido.moeda,
            unit_price: pedido.valorCentavos / 100,
          },
        ],
        // Os três destinos são a MESMA tela: ela não concede nada, só explica
        // que a confirmação vem do servidor (princípio da Spec 04). Mandar
        // sucesso e falha para telas diferentes seria decidir pelo navegador
        // o que só o webhook decide.
        back_urls: {
          success: pedido.urlRetorno,
          pending: pedido.urlRetorno,
          failure: pedido.urlRetorno,
        },
        auto_return: 'approved',
      }),
    })
    return preferenciaCanonica(bruto, this.config.sandbox)
  }

  async buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null> {
    const bruto = await this.requisitar(
      `/v1/payments/search?external_reference=${encodeURIComponent(referenciaExterna)}&limit=50`,
    )
    const resultados = buscaPagamentosSchema
      .parse(bruto)
      .results.filter((item) => textoOuNulo(item.external_reference) === referenciaExterna)
    // Uma referência pode ter VÁRIOS pagamentos: o cartão recusa, a pessoa
    // tenta de novo. Vale o aprovado; sem nenhum aprovado, o primeiro, que é
    // o que a tela precisa para explicar a recusa.
    const aprovado = resultados.find((item) => item.status === 'approved')
    const escolhido = aprovado ?? resultados[0]
    return escolhido ? pagamentoCanonico(escolhido) : null
  }

  async interpretarNotificacao(
    corpo: unknown,
    aviso: AvisoPagamento,
  ): Promise<EventoPagamento | null> {
    const parsed = z
      .object({ id: idSchema, type: z.string(), data: z.object({ id: idSchema }).passthrough() })
      .passthrough()
      .safeParse(corpo)
    if (!parsed.success) return null

    const recursoId = aviso.parametros['data.id'] ?? aviso.parametros['data_id'] ?? ''
    if (!recursoId || recursoId !== parsed.data.data.id) return null
    const topico = parsed.data.type

    if (topico === 'subscription_preapproval') {
      const assinatura = await this.consultarAssinatura(recursoId)
      const cancelada = assinatura.status === 'cancelled' || assinatura.status === 'canceled'
      const evento: EventoPagamento = {
        eventoExternoId: parsed.data.id,
        tipo: cancelada ? 'ASSINATURA_CANCELADA' : 'ASSINATURA_ATUALIZADA',
        referenciaExterna: assinatura.referenciaExterna,
        assinaturaExternaId: assinatura.id,
        cobrancaExternaId: null,
        recursoTipo: 'ASSINATURA',
        plano: assinatura.nomePlano,
        proximaCobranca: assinatura.proximaCobranca,
        ocorridoEm: assinatura.ocorridoEm,
        statusExterno: assinatura.status,
        bruto: null,
      }
      evento.bruto = corpoSeguro(evento)
      return evento
    }

    if (topico === 'subscription_authorized_payment') {
      const bruto = await this.requisitar(`/authorized_payments/${encodeURIComponent(recursoId)}`)
      const fatura = faturaCanonica(faturaSchema.parse(bruto))
      const assinatura = fatura.assinaturaExternaId
        ? await this.consultarAssinatura(fatura.assinaturaExternaId)
        : null
      const evento: EventoPagamento = {
        eventoExternoId: parsed.data.id,
        tipo: tipoDaCobranca(fatura.status),
        referenciaExterna: fatura.referenciaExterna ?? assinatura?.referenciaExterna ?? null,
        assinaturaExternaId: fatura.assinaturaExternaId,
        cobrancaExternaId: fatura.id,
        recursoTipo: 'COBRANCA',
        plano: assinatura?.nomePlano ?? null,
        proximaCobranca: fatura.proximaCobranca ?? assinatura?.proximaCobranca ?? null,
        ocorridoEm: fatura.ocorridoEm,
        valorCentavos: fatura.valorCentavos,
        moeda: fatura.moeda,
        statusExterno: fatura.status,
        bruto: null,
      }
      evento.bruto = corpoSeguro(evento)
      return evento
    }

    if (topico === 'payment') {
      const recurso = pagamentoSchema.parse(
        await this.requisitar(`/v1/payments/${encodeURIComponent(recursoId)}`),
      )
      let proximaCobranca: string | null = null
      let assinatura: AssinaturaExterna | null = null
      if (recurso.preapproval_id) {
        assinatura = await this.consultarAssinatura(recurso.preapproval_id)
        proximaCobranca = assinatura.proximaCobranca
      }
      const evento: EventoPagamento = {
        eventoExternoId: parsed.data.id,
        tipo: tipoDaCobranca(recurso.status),
        referenciaExterna:
          textoOuNulo(recurso.external_reference) ?? assinatura?.referenciaExterna ?? null,
        assinaturaExternaId: textoOuNulo(recurso.preapproval_id),
        cobrancaExternaId: recurso.id,
        recursoTipo: 'COBRANCA',
        plano: recurso.description ?? assinatura?.nomePlano ?? null,
        proximaCobranca,
        ocorridoEm: recurso.date_last_updated ?? recurso.date_approved ?? recurso.date_created ?? null,
        valorCentavos: recurso.transaction_amount ?? null,
        moeda: recurso.currency_id ?? null,
        statusExterno: recurso.status,
        bruto: null,
      }
      evento.bruto = corpoSeguro(evento)
      return evento
    }

    return {
      eventoExternoId: parsed.data.id,
      tipo: 'OUTRO',
      referenciaExterna: null,
      assinaturaExternaId: null,
      cobrancaExternaId: recursoId,
      recursoTipo: 'OUTRO',
      plano: null,
      proximaCobranca: null,
      ocorridoEm: null,
      bruto: { recursoTipo: 'OUTRO', recursoExternoId: recursoId },
    }
  }

  private async requisitar(caminho: string, init: RequestInit = {}): Promise<unknown> {
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), this.config.timeoutMs ?? 8_000)
    try {
      const resposta = await this.fetchImpl(`https://api.mercadopago.com${caminho}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        cache: 'no-store',
        signal: controlador.signal,
      })
      if (!resposta.ok) {
        const erro = new Error(`Mercado Pago respondeu HTTP ${resposta.status}`)
        erro.name = resposta.status === 429 || resposta.status >= 500 ? 'ErroTemporarioMP' : 'ErroMP'
        throw erro
      }
      return await resposta.json()
    } finally {
      clearTimeout(timer)
    }
  }
}
