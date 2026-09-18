import { describe, expect, it, vi } from 'vitest'

import { PagamentoFake } from '../fake'
import { PagamentoMercadoPago } from '../mercadopago'
import type { PedidoPagamentoUnico } from '../porta'

const PEDIDO: PedidoPagamentoUnico = {
  referenciaExterna: 'ref-temporada-1',
  chaveIdempotencia: 'chave-1',
  emailPagador: 'assinante@exemplo.com',
  nomePlano: 'NIP All Star temporada',
  valorCentavos: 59700,
  moeda: 'BRL',
  urlRetorno: 'https://app.example.com/retorno/mercadopago',
}

function adapter(fetchImpl: typeof fetch, sandbox = false) {
  return new PagamentoMercadoPago(
    { accessToken: 'token-de-teste', segredoWebhook: 'segredo', sandbox },
    fetchImpl,
  )
}

describe('criarPagamentoUnico no adapter real', () => {
  it('cria preferência com item, referência, retorno e chave de idempotência', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'pref-1',
        external_reference: 'ref-temporada-1',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
        date_created: '2026-10-01T12:00:00.000-03:00',
      }),
    )

    const pagamento = await adapter(fetchMock).criarPagamentoUnico(PEDIDO)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['X-Idempotency-Key']).toBe('chave-1')
    const corpo = JSON.parse(String(init?.body))
    expect(corpo.external_reference).toBe('ref-temporada-1')
    expect(corpo.payer.email).toBe('assinante@exemplo.com')
    expect(corpo.items).toHaveLength(1)
    expect(corpo.items[0].title).toBe('NIP All Star temporada')
    expect(corpo.items[0].quantity).toBe(1)
    expect(corpo.items[0].currency_id).toBe('BRL')
    // Centavos aqui, reais lá: 59700 centavos são R$ 597,00.
    expect(corpo.items[0].unit_price).toBe(597)
    expect(corpo.back_urls.success).toBe('https://app.example.com/retorno/mercadopago')

    expect(pagamento).toEqual({
      id: 'pref-1',
      referenciaExterna: 'ref-temporada-1',
      urlCheckout: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
      ocorridoEm: '2026-10-01T12:00:00.000-03:00',
    })
  })

  it('em sandbox usa o init_point de sandbox — o outro cobra de verdade', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'pref-2',
        external_reference: 'ref-temporada-1',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
        sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
        date_created: null,
      }),
    )

    const pagamento = await adapter(fetchMock, true).criarPagamentoUnico(PEDIDO)

    expect(pagamento.urlCheckout).toBe(
      'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
    )
  })
})

describe('buscarPagamentoPorReferencia no adapter real', () => {
  function resposta(resultados: unknown[]) {
    return vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: resultados }))
  }

  const RECUSADO = {
    id: 901,
    status: 'rejected',
    external_reference: 'ref-temporada-1',
    transaction_amount: 597,
    currency_id: 'BRL',
    date_created: '2026-10-01T12:00:00.000-03:00',
    date_last_updated: '2026-10-01T12:00:05.000-03:00',
  }
  const APROVADO = {
    id: 902,
    status: 'approved',
    external_reference: 'ref-temporada-1',
    transaction_amount: 597,
    currency_id: 'BRL',
    date_approved: '2026-10-01T12:10:00.000-03:00',
    date_created: '2026-10-01T12:09:00.000-03:00',
    date_last_updated: '2026-10-01T12:10:00.000-03:00',
  }

  it('busca pela referência e devolve a cobrança canônica, sem recorrência', async () => {
    const fetchMock = resposta([APROVADO])

    const cobranca = await adapter(fetchMock).buscarPagamentoPorReferencia('ref-temporada-1')

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      '/v1/payments/search?external_reference=ref-temporada-1',
    )
    expect(cobranca).toMatchObject({
      id: '902',
      referenciaExterna: 'ref-temporada-1',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      assinaturaExternaId: null,
      proximaCobranca: null,
    })
  })

  it('com tentativa recusada antes da aprovada, vale a APROVADA', async () => {
    // Cartão recusado e nova tentativa é rotina. Devolver a primeira da lista
    // faria a reconciliação concluir "não pagou" para quem pagou.
    const cobranca = await adapter(resposta([RECUSADO, APROVADO])).buscarPagamentoPorReferencia(
      'ref-temporada-1',
    )
    expect(cobranca?.status).toBe('approved')
  })

  it('sem nenhuma aprovada, devolve a primeira — a tela precisa explicar a recusa', async () => {
    const cobranca = await adapter(resposta([RECUSADO])).buscarPagamentoPorReferencia(
      'ref-temporada-1',
    )
    expect(cobranca?.status).toBe('rejected')
  })

  it('ignora pagamento de outra referência que a busca devolva junto', async () => {
    const outro = { ...APROVADO, id: 903, external_reference: 'ref-de-outra-pessoa' }
    const cobranca = await adapter(resposta([outro])).buscarPagamentoPorReferencia('ref-temporada-1')
    expect(cobranca).toBeNull()
  })

  it('sem resultado, devolve null', async () => {
    expect(await adapter(resposta([])).buscarPagamentoPorReferencia('ref-temporada-1')).toBeNull()
  })
})

describe('listarCobrancasDaAssinatura no adapter real', () => {
  it('não multiplica o valor em centavos duas vezes', async () => {
    // Defeito pré-existente: `faturaCanonica` reparseava um item que
    // `buscaFaturasSchema` já tinha parseado, e `dinheiroSchema` multiplica
    // por 100 — R$ 597,00 saía como 5.970.000 centavos em vez de 59.700.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            id: 701,
            status: 'approved',
            preapproval_id: 'preap-1',
            external_reference: 'ref-mensal-1',
            transaction_amount: 597,
            currency_id: 'BRL',
            date_created: '2026-10-01T12:00:00.000-03:00',
            last_modified: '2026-10-01T12:00:05.000-03:00',
          },
        ],
      }),
    )

    const cobrancas = await adapter(fetchMock).listarCobrancasDaAssinatura('preap-1')

    expect(cobrancas).toHaveLength(1)
    expect(cobrancas[0]?.valorCentavos).toBe(59700)
  })
})

describe('PagamentoFake cobre os dois caminhos novos', () => {
  it('registra a preferência criada e devolve URL de checkout', async () => {
    const fake = new PagamentoFake()
    const pagamento = await fake.criarPagamentoUnico(PEDIDO)

    expect(fake.preferencias).toHaveLength(1)
    expect(fake.preferencias[0]?.nomePlano).toBe('NIP All Star temporada')
    expect(pagamento.referenciaExterna).toBe('ref-temporada-1')
    expect(pagamento.urlCheckout).toContain('mercadopago.com.br')
  })

  it('a mesma chave de idempotência devolve a MESMA preferência', async () => {
    const fake = new PagamentoFake()
    const primeira = await fake.criarPagamentoUnico(PEDIDO)
    const segunda = await fake.criarPagamentoUnico(PEDIDO)
    // Identidade do objeto: a segunda chamada devolve o MESMO objeto, não um
    // equivalente novo — só a memoização por chave produz isso.
    expect(segunda).toBe(primeira)
    // E o pedido não foi registrado de novo — só uma preferência foi criada
    // de verdade, mesmo com duas chamadas.
    expect(fake.preferencias).toHaveLength(1)
  })

  it('só encontra pagamento que o teste tenha registrado', async () => {
    const fake = new PagamentoFake()
    expect(await fake.buscarPagamentoPorReferencia('ref-temporada-1')).toBeNull()

    fake.registrarPagamento({
      id: 'pay-temporada-1',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada-1',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: '2026-10-01T15:10:00.000Z',
      proximaCobranca: null,
    })

    expect(await fake.buscarPagamentoPorReferencia('ref-temporada-1')).toMatchObject({
      id: 'pay-temporada-1',
      status: 'approved',
    })
  })

  it('cancelarAssinatura fica registrado — é o que prova o cancelamento do upgrade', async () => {
    const fake = new PagamentoFake()
    await fake.criarAssinatura({
      referenciaExterna: 'ref-mensal-1',
      chaveIdempotencia: 'chave-mensal',
      emailPagador: 'assinante@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })

    await fake.cancelarAssinatura('fake-ref-mensal-1', 'chave-cancelar')

    expect(fake.cancelamentos).toEqual(['fake-ref-mensal-1'])
  })
})
