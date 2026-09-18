import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { assinaturas, eventosPagamento, tentativasCheckout, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario, bloquearUsuario } from '../admin/usuarios'
import { PagamentoFake } from '../assinatura/fake'
import { PagamentoMercadoPago } from '../assinatura/mercadopago'
import { processarNotificacao } from '../assinatura/webhook'

const AGORA = new Date('2026-08-21T12:00:00.000Z')
const SEGREDO = 'segredo-de-teste'
const SENHA = 'senha-de-teste-123'

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
  await banco.db.delete(assinaturas)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'pagamento@exemplo.com',
      senha: SENHA,
      nome: 'Pagamento',
    })
  ).id
})

async function semear(referencia: string) {
  // Só UMA tentativa aberta por usuário e produto: as anteriores saem de cena.
  await banco.db
    .update(tentativasCheckout)
    .set({ status: 'ENCERRADA' })
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  await banco.db.insert(tentativasCheckout).values({
    usuarioId,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano: 'MVP',
    modalidade: 'MENSAL',
    status: 'CRIADA',
    atualizadoEm: AGORA,
  })
}

function avisoAssinado(dataId: string, corpo: object) {
  const ts = '1787313600'
  const requestId = 'req-123'
  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', SEGREDO).update(manifesto).digest('hex')
  return {
    corpoBruto: JSON.stringify(corpo),
    cabecalhos: {
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${v1}`,
    },
    parametros: { 'data.id': dataId },
  }
}

describe('adapter real do Mercado Pago', () => {
  it('valida HMAC com data.id da query e detecta adulteração', () => {
    const mp = new PagamentoMercadoPago({
      accessToken: 'token-de-teste',
      segredoWebhook: SEGREDO,
      sandbox: true,
    })
    const aviso = avisoAssinado('sub-1', {
      id: 77,
      type: 'subscription_preapproval',
      data: { id: 'valor-do-corpo-nao-governa' },
    })

    expect(mp.verificarAssinatura(aviso)).toBe(true)
    expect(mp.verificarAssinatura({ ...aviso, parametros: { 'data.id': 'sub-adulterada' } })).toBe(
      false,
    )
  })

  it('consulta o recurso oficial a partir de um aviso mínimo', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'sub-1',
        status: 'authorized',
        external_reference: usuarioId,
        reason: 'mensal',
        next_payment_date: '2026-09-21T12:00:00.000Z',
      }),
    )
    const mp = new PagamentoMercadoPago(
      { accessToken: 'token-de-teste', segredoWebhook: SEGREDO, sandbox: true },
      fetchMock,
    )
    const corpo = { id: 77, type: 'subscription_preapproval', data: { id: 'sub-1' } }
    const aviso = avisoAssinado('sub-1', corpo)

    const evento = await mp.interpretarNotificacao(corpo, aviso)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mercadopago.com/preapproval/sub-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-de-teste' },
      }),
    )
    expect(evento).toMatchObject({
      eventoExternoId: '77',
      tipo: 'ASSINATURA_ATUALIZADA',
      referenciaExterna: usuarioId,
      assinaturaExternaId: 'sub-1',
    })
  })

  it('assinatura inválida não consulta o provedor nem escreve no banco', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const mp = new PagamentoMercadoPago(
      { accessToken: 'token-de-teste', segredoWebhook: SEGREDO, sandbox: true },
      fetchMock,
    )
    const aviso = avisoAssinado('sub-1', {
      id: 78,
      type: 'subscription_preapproval',
      data: { id: 'sub-1' },
    })

    const resultado = await processarNotificacao(banco.db, mp, {
      ...aviso,
      cabecalhos: { ...aviso.cabecalhos, 'x-signature': 'ts=1,v1=invalida' },
      agora: AGORA,
      fimDaTemporada: null,
    })

    expect(resultado).toEqual({ aceito: false, motivo: 'assinatura-invalida' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(0)
  })
})

describe('atomicidade do webhook', () => {
  const REFERENCIA = 'ref-estabilizacao'

  function notificacao(eventoExternoId: string, proximaCobranca: string) {
    return JSON.stringify({
      eventoExternoId,
      tipo: 'PAGAMENTO_APROVADO',
      referenciaExterna: REFERENCIA,
      assinaturaExternaId: `sub-${eventoExternoId}`,
      plano: 'mensal',
      proximaCobranca,
      bruto: { id: eventoExternoId },
    })
  }

  beforeEach(async () => {
    await semear(REFERENCIA)
  })

  it('faz rollback do evento quando o efeito falha e o retry conclui', async () => {
    await expect(
      processarNotificacao(banco.db, new PagamentoFake(), {
        corpoBruto: notificacao('evt-rollback', 'data-invalida'),
        cabecalhos: {},
        agora: AGORA,
        fimDaTemporada: null,
      }),
    ).rejects.toThrow()

    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(0)
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)

    const retry = await processarNotificacao(banco.db, new PagamentoFake(), {
      corpoBruto: notificacao('evt-rollback', '2026-09-21T12:00:00.000Z'),
      cabecalhos: {},
      agora: AGORA,
      fimDaTemporada: null,
    })

    expect(retry).toMatchObject({ aceito: true, duplicado: false })
    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(1)
    expect(await banco.db.select().from(assinaturas)).toHaveLength(1)
  })

  it('pagamento aprovado não remove bloqueio administrativo', async () => {
    await bloquearUsuario(banco.db, usuarioId, 'fraude', AGORA)

    await processarNotificacao(banco.db, new PagamentoFake(), {
      corpoBruto: notificacao('evt-bloqueio', '2026-09-21T12:00:00.000Z'),
      cabecalhos: {},
      agora: AGORA,
      fimDaTemporada: null,
    })

    const [usuario] = await banco.db.select().from(usuarios).where(eq(usuarios.id, usuarioId))
    const [assinatura] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.usuarioId, usuarioId))
    expect(usuario?.status).toBe('BLOQUEADO')
    expect(assinatura?.status).toBe('ATIVA')
  })

  it('cancelamento atualiza a mesma assinatura sem duplicar o efeito', async () => {
    await processarNotificacao(banco.db, new PagamentoFake(), {
      corpoBruto: notificacao('evt-aprovado', '2026-09-21T12:00:00.000Z'),
      cabecalhos: {},
      agora: AGORA,
      fimDaTemporada: null,
    })

    const cancelamento = JSON.stringify({
      eventoExternoId: 'evt-cancelado',
      tipo: 'ASSINATURA_CANCELADA',
      referenciaExterna: REFERENCIA,
      assinaturaExternaId: 'sub-evt-aprovado',
      plano: 'mensal',
      proximaCobranca: null,
      bruto: { id: 'evt-cancelado' },
    })
    await processarNotificacao(banco.db, new PagamentoFake(), {
      corpoBruto: cancelamento,
      cabecalhos: {},
      agora: new Date('2026-08-22T12:00:00.000Z'),
      fimDaTemporada: null,
    })

    const linhas = await banco.db.select().from(assinaturas)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.status).toBe('CANCELADA')
  })
})
