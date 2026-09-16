import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { acessoDeTeste } from './acesso-de-teste'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario, bloquearUsuario } from '../admin/usuarios'
import { iniciarCheckout } from '../assinatura/checkout'
import { cadastrarUsuario } from '../assinatura/cadastro'
import {
  configuracaoProdutoPago,
  origemPermitida,
  PRODUTO_PAGO,
  type ConfiguracaoProdutoPago,
} from '../assinatura/configuracao'
import { avaliarAcesso } from '../assinatura/direito'
import { PagamentoFake } from '../assinatura/fake'
import { PagamentoMercadoPago } from '../assinatura/mercadopago'
import { aplicarEventoPagamento } from '../assinatura/webhook'
import { reconciliarPagamentos } from '../assinatura/reconciliacao'
import type { AssinaturaExterna, EventoPagamento } from '../assinatura/porta'
import { PoliticaHomologacaoPush } from '../../entrega/push/fanout'

const AGORA = new Date('2026-08-21T12:00:00.000Z')
const FIM = '2026-09-21T12:00:00.000Z'
const config: ConfiguracaoProdutoPago = {
  checkoutHabilitado: true,
  cadastroPublicoHabilitado: true,
  nomePlano: 'IA da NBA Mensal',
  valorCentavos: 4990,
  frequencia: 1,
  tipoFrequencia: 'months',
  moeda: 'BRL',
  urlPublica: 'https://app.example.com',
  hostsPermitidos: new Set(['app.example.com']),
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(cobrancas)
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'assinante@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Assinante',
    })
  ).id
})

async function criarTentativa(porta = new PagamentoFake()) {
  const resultado = await iniciarCheckout(banco.db, porta, config, {
    usuarioId,
    ip: '203.0.113.10',
    agora: AGORA,
  })
  expect(resultado.status).toBe('PRONTO')
  const [tentativa] = await banco.db
    .select()
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  return { porta, tentativa: tentativa! }
}

function evento(
  referenciaExterna: string,
  parcial: Partial<EventoPagamento> = {},
): EventoPagamento {
  return {
    eventoExternoId: 'evt-1',
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna,
    assinaturaExternaId: 'sub-1',
    cobrancaExternaId: 'pay-1',
    recursoTipo: 'COBRANCA',
    plano: 'IA da NBA Mensal',
    proximaCobranca: FIM,
    ocorridoEm: AGORA.toISOString(),
    valorCentavos: 4990,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    ...parcial,
  }
}

describe('configuração comercial fail-closed', () => {
  it('mantém checkout desligado e cadastro público aberto por padrão', () => {
    const lida = configuracaoProdutoPago({ APP_PUBLIC_URL: 'https://app.example.com' })
    expect(lida.checkoutHabilitado).toBe(false)
    expect(lida.cadastroPublicoHabilitado).toBe(true)
  })

  it('cadastro aberto por padrão ainda exige APP_PUBLIC_URL (fail-closed)', () => {
    expect(() => configuracaoProdutoPago({})).toThrow('cadastro habilitado sem APP_PUBLIC_URL')
  })

  it('recusa habilitar checkout sem preço, nome e URL', () => {
    expect(() => configuracaoProdutoPago({ MERCADOPAGO_CHECKOUT_ENABLED: 'true' })).toThrow(
      /configuração incompleta/,
    )
  })

  it('aceita somente origem HTTPS em host explicitamente permitido', () => {
    expect(origemPermitida('https://app.example.com', config)).toBe(true)
    expect(origemPermitida('http://app.example.com', config)).toBe(false)
    expect(origemPermitida('https://app.example.com.evil.test', config)).toBe(false)
  })
})

describe('cadastro self-service controlado', () => {
  it('não grava nada quando o rollout está desligado', async () => {
    const antes = await banco.db.select().from(usuarios)
    const resultado = await cadastrarUsuario(
      banco.db,
      { ...config, cadastroPublicoHabilitado: false },
      { nome: 'Nova Pessoa', email: 'nova@exemplo.com', senha: 'senha-forte-123' },
      { ip: '203.0.113.11', agora: AGORA },
    )
    expect(resultado).toEqual({ ok: false, motivo: 'indisponivel' })
    expect(await banco.db.select().from(usuarios)).toHaveLength(antes.length)
  })

  it('cria identidade sem qualquer direito comercial implícito', async () => {
    const resultado = await cadastrarUsuario(
      banco.db,
      config,
      { nome: 'Nova Pessoa', email: 'nova@exemplo.com', senha: 'senha-forte-123' },
      { ip: '203.0.113.11', agora: AGORA },
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('cadastro deveria ter sido criado')
    expect(await avaliarAcesso(banco.db, resultado.usuarioId, AGORA)).toEqual(
      acessoDeTeste('GRATIS'),
    )
  })
})

describe('coordenação do checkout', () => {
  it('cria referência opaca antes da rede e deriva preço, e-mail e retorno no servidor', async () => {
    const porta = new PagamentoFake()
    const { tentativa } = await criarTentativa(porta)

    expect(tentativa.referenciaExterna).not.toBe(usuarioId)
    expect(tentativa.referenciaExterna).not.toContain('@')
    expect(porta.criacoes).toHaveLength(1)
    expect(porta.criacoes[0]).toMatchObject({
      referenciaExterna: tentativa.referenciaExterna,
      emailPagador: 'assinante@exemplo.com',
      valorCentavos: 4990,
      nomePlano: 'IA da NBA Mensal',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
  })

  it('reutiliza a mesma tentativa e não cria uma segunda assinatura', async () => {
    const porta = new PagamentoFake()
    const primeira = await iniciarCheckout(banco.db, porta, config, {
      usuarioId,
      ip: null,
      agora: AGORA,
    })
    const segunda = await iniciarCheckout(banco.db, porta, config, {
      usuarioId,
      ip: null,
      agora: new Date(AGORA.getTime() + 1_000),
    })

    expect(primeira.status).toBe('PRONTO')
    expect(segunda).toMatchObject({ status: 'PRONTO', reutilizada: true })
    expect(porta.criacoes).toHaveLength(1)
    expect(await banco.db.select().from(tentativasCheckout)).toHaveLength(1)
  })

  it('duas chamadas concorrentes deixam uma única criação externa em voo', async () => {
    let liberar!: (assinatura: AssinaturaExterna) => void
    const resposta = new Promise<AssinaturaExterna>((resolve) => {
      liberar = resolve
    })
    const porta = new PagamentoFake(true, async () => resposta)
    const primeira = iniciarCheckout(banco.db, porta, config, {
      usuarioId,
      ip: null,
      agora: AGORA,
    })
    await vi.waitFor(() => expect(porta.criacoes).toHaveLength(1))

    const segunda = await iniciarCheckout(banco.db, porta, config, {
      usuarioId,
      ip: null,
      agora: new Date(AGORA.getTime() + 1_000),
    })
    expect(segunda.status).toBe('PROCESSANDO')

    const pedido = porta.criacoes[0]!
    liberar({
      id: 'sub-concorrente',
      referenciaExterna: pedido.referenciaExterna,
      status: 'pending',
      nomePlano: pedido.nomePlano,
      urlCheckout: 'https://www.mercadopago.com.br/subscriptions/checkout?id=sub-concorrente',
      proximaCobranca: null,
      ocorridoEm: AGORA.toISOString(),
    })
    expect((await primeira).status).toBe('PRONTO')
    expect(porta.criacoes).toHaveLength(1)
  })

  it('após timeout ambíguo consulta por referência antes de repetir POST', async () => {
    let primeira = true
    const porta = new PagamentoFake(true, async (pedido) => {
      const criada = {
        id: 'sub-timeout',
        referenciaExterna: pedido.referenciaExterna,
        status: 'pending',
        nomePlano: pedido.nomePlano,
        urlCheckout: 'https://www.mercadopago.com.br/subscriptions/checkout?id=sub-timeout',
        proximaCobranca: null,
        ocorridoEm: AGORA.toISOString(),
      }
      porta.assinaturas.set(criada.id, criada)
      if (primeira) {
        primeira = false
        throw Object.assign(new Error('timeout depois do commit externo'), { name: 'AbortError' })
      }
      return criada
    })

    await expect(
      iniciarCheckout(banco.db, porta, config, { usuarioId, ip: null, agora: AGORA }),
    ).rejects.toThrow(/timeout/)
    const recuperada = await iniciarCheckout(banco.db, porta, config, {
      usuarioId,
      ip: null,
      agora: new Date(AGORA.getTime() + 31_000),
    })

    expect(recuperada).toMatchObject({ status: 'PRONTO', reutilizada: true })
    expect(porta.criacoes).toHaveLength(1)
  })
})

describe('direito de acesso e eventos financeiros', () => {
  it('retorno/assinatura pending ou authorized não concede acesso', async () => {
    const { tentativa } = await criarTentativa()
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      evento(tentativa.referenciaExterna, {
        eventoExternoId: 'evt-authorized',
        tipo: 'ASSINATURA_ATUALIZADA',
        recursoTipo: 'ASSINATURA',
        cobrancaExternaId: null,
        statusExterno: 'authorized',
      }),
      AGORA,
    )
    expect(await avaliarAcesso(banco.db, usuarioId, AGORA)).toEqual(acessoDeTeste('GRATIS'))
  })

  it('pagamento aprovado concede até a próxima cobrança e duplicata não duplica', async () => {
    const { tentativa } = await criarTentativa()
    const aprovado = evento(tentativa.referenciaExterna)
    const primeira = await aplicarEventoPagamento(banco.db, 'fake', aprovado, AGORA)
    const repetida = await aplicarEventoPagamento(banco.db, 'fake', aprovado, AGORA)

    expect(primeira).toMatchObject({ duplicado: false, liberou: true })
    expect(repetida).toEqual({ aceito: true, duplicado: true })
    expect((await avaliarAcesso(banco.db, usuarioId, AGORA)).nivel).toBe('MVP')
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
    expect(await banco.db.select().from(cobrancas)).toHaveLength(1)
  })

  it('pagamento sem validade futura falha fechado e não cria direito infinito', async () => {
    const { tentativa } = await criarTentativa()
    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      evento(tentativa.referenciaExterna, { proximaCobranca: null }),
      AGORA,
    )
    expect(resultado).toMatchObject({ liberou: false })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })

  it('cancelamento preserva o período pago; estorno revoga', async () => {
    const { tentativa } = await criarTentativa()
    await aplicarEventoPagamento(banco.db, 'fake', evento(tentativa.referenciaExterna), AGORA)
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      evento(tentativa.referenciaExterna, {
        eventoExternoId: 'evt-cancelada',
        tipo: 'ASSINATURA_CANCELADA',
        recursoTipo: 'ASSINATURA',
        cobrancaExternaId: null,
        ocorridoEm: new Date(AGORA.getTime() + 1_000).toISOString(),
      }),
      new Date(AGORA.getTime() + 1_000),
    )
    expect((await avaliarAcesso(banco.db, usuarioId, AGORA)).nivel).toBe('MVP')

    await aplicarEventoPagamento(
      banco.db,
      'fake',
      evento(tentativa.referenciaExterna, {
        eventoExternoId: 'evt-estorno',
        tipo: 'PAGAMENTO_ESTORNADO',
        statusExterno: 'refunded',
        ocorridoEm: new Date(AGORA.getTime() + 2_000).toISOString(),
      }),
      new Date(AGORA.getTime() + 2_000),
    )
    expect(await avaliarAcesso(banco.db, usuarioId, new Date(AGORA.getTime() + 3_000))).toEqual(
      acessoDeTeste('GRATIS'),
    )
  })

  it('pagamento nunca desfaz bloqueio administrativo', async () => {
    const { tentativa } = await criarTentativa()
    await bloquearUsuario(banco.db, usuarioId, 'fraude', AGORA)
    await aplicarEventoPagamento(banco.db, 'fake', evento(tentativa.referenciaExterna), AGORA)
    expect(await avaliarAcesso(banco.db, usuarioId, AGORA)).toEqual({
      nivel: null,
      motivo: 'bloqueio-administrativo',
    })
  })

  it('evento atrasado não regride uma cobrança já aprovada', async () => {
    const { tentativa } = await criarTentativa()
    await aplicarEventoPagamento(banco.db, 'fake', evento(tentativa.referenciaExterna), AGORA)
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      evento(tentativa.referenciaExterna, {
        eventoExternoId: 'evt-antigo',
        tipo: 'PAGAMENTO_RECUSADO',
        statusExterno: 'rejected',
        ocorridoEm: new Date(AGORA.getTime() - 60_000).toISOString(),
      }),
      new Date(AGORA.getTime() + 60_000),
    )

    const [assinatura] = await banco.db.select().from(assinaturas)
    const [cobranca] = await banco.db.select().from(cobrancas)
    expect(assinatura?.status).toBe('ATIVA')
    expect(cobranca?.status).toBe('approved')
    expect((await avaliarAcesso(banco.db, usuarioId, AGORA)).nivel).toBe('MVP')
  })
})

describe('reconciliação', () => {
  it('recupera pagamento sem webhook usando a mesma função de efeito', async () => {
    const porta = new PagamentoFake()
    const { tentativa } = await criarTentativa(porta)
    const assinaturaId = tentativa.assinaturaExternaId!
    porta.assinaturas.set(assinaturaId, {
      ...(await porta.consultarAssinatura(assinaturaId)),
      status: 'authorized',
      proximaCobranca: FIM,
      ocorridoEm: AGORA.toISOString(),
    })
    porta.cobrancas.set(assinaturaId, [
      {
        id: 'pay-reconciliado',
        assinaturaExternaId: assinaturaId,
        referenciaExterna: tentativa.referenciaExterna,
        status: 'approved',
        valorCentavos: 4990,
        moeda: 'BRL',
        ocorridoEm: AGORA.toISOString(),
        proximaCobranca: FIM,
      },
    ])

    const resultado = await reconciliarPagamentos(
      banco.db,
      porta,
      new Date(AGORA.getTime() + 60_000),
    )
    expect(resultado).toMatchObject({ examinadas: 1, encontradas: 1, falhas: 0 })
    expect((await avaliarAcesso(banco.db, usuarioId, AGORA)).nivel).toBe('MVP')
  })
})

describe('adapter Mercado Pago', () => {
  it('normaliza data.id alfanumérico conforme o manifesto HMAC oficial', () => {
    const segredo = 'segredo-webhook'
    const ts = String(Math.floor(AGORA.getTime() / 1_000))
    const requestId = 'req-alfanumerica'
    const dataId = 'ABC-123'
    const v1 = createHmac('sha256', segredo)
      .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest('hex')
    const porta = new PagamentoMercadoPago({
      accessToken: 'token',
      segredoWebhook: segredo,
      sandbox: true,
    })

    expect(
      porta.verificarAssinatura({
        corpoBruto: '{}',
        cabecalhos: {
          'x-request-id': requestId,
          'x-signature': `ts=${ts},v1=${v1}`,
        },
        parametros: { 'data.id': dataId },
        agora: AGORA,
      }),
    ).toBe(true)
  })

  it('recusa aviso HMAC antigo antes de consultar rede', async () => {
    const segredo = 'segredo-webhook'
    const ts = String(Math.floor((AGORA.getTime() - 10 * 60_000) / 1_000))
    const requestId = 'req-antiga'
    const dataId = 'sub-1'
    const v1 = createHmac('sha256', segredo)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex')
    const fetchMock = vi.fn<typeof fetch>()
    const porta = new PagamentoMercadoPago(
      { accessToken: 'token', segredoWebhook: segredo, sandbox: true },
      fetchMock,
    )

    expect(
      porta.verificarAssinatura({
        corpoBruto: '{}',
        cabecalhos: {
          'x-request-id': requestId,
          'x-signature': `ts=${ts},v1=${v1}`,
        },
        parametros: { 'data.id': dataId },
        agora: AGORA,
      }),
    ).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cria preapproval pending com idempotência e campos derivados', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'sub-1',
        status: 'pending',
        external_reference: 'ref-opaca',
        reason: 'IA da NBA Mensal',
        init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?id=sub-1',
      }),
    )
    const porta = new PagamentoMercadoPago(
      { accessToken: 'token', segredoWebhook: 'segredo', sandbox: true },
      fetchMock,
    )
    await porta.criarAssinatura({
      referenciaExterna: 'ref-opaca',
      chaveIdempotencia: 'idem-1',
      emailPagador: 'assinante@exemplo.com',
      nomePlano: 'IA da NBA Mensal',
      valorCentavos: 4990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'X-Idempotency-Key': 'idem-1' })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      status: 'pending',
      external_reference: 'ref-opaca',
      payer_email: 'assinante@exemplo.com',
      auto_recurring: { transaction_amount: 49.9, currency_id: 'BRL' },
      back_url: 'https://app.example.com/retorno/mercadopago',
    })
  })
})

describe('superfície paga', () => {
  it('produto canônico não depende do status da assinatura', () => {
    expect(PRODUTO_PAGO).toBe('NBA_PRO')
  })

  it('Push público exige direito e a allowlist interna continua isolada', () => {
    const publica = new PoliticaHomologacaoPush('', true)
    expect(publica.permitido({ id: usuarioId, email: 'a@b.com', direitoAtivo: true })).toBe(true)
    expect(publica.permitido({ id: usuarioId, email: 'a@b.com', direitoAtivo: false })).toBe(false)
    expect(
      new PoliticaHomologacaoPush('interno@exemplo.com', false).permitido({
        id: usuarioId,
        email: 'interno@exemplo.com',
        direitoAtivo: false,
      }),
    ).toBe(true)
  })
})
