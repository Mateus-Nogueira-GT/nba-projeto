import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { avaliarAcesso } from '../assinatura/direito'
import { PagamentoFake } from '../assinatura/fake'
import type { CobrancaExterna } from '../assinatura/porta'
import { eventoDoPagamentoUnico, reconciliarPagamentos } from '../assinatura/reconciliacao'

const AGORA = new Date('2026-10-01T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

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
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'reconciliar@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Reconciliar',
    })
  ).id
})

async function tentativaDeTemporada(referencia: string, criadoEm = AGORA, dono = usuarioId) {
  await banco.db.insert(tentativasCheckout).values({
    usuarioId: dono,
    criadoEm,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano: 'ALL_STAR',
    modalidade: 'TEMPORADA',
    status: 'CRIADA',
    assinaturaExternaId: `fake-pref-${referencia}`,
    urlCheckout: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=x',
    atualizadoEm: AGORA,
  })
}

describe('reconciliação de temporada', () => {
  it('concede o direito quando o webhook não chegou', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    const resultado = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(resultado).toMatchObject({ examinadas: 1, encontradas: 1, falhas: 0 })
    expect(resultado.eventos).toBeGreaterThan(0)
    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(direito?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())
    expect(await avaliarAcesso(banco.db, usuarioId, AGORA)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('NÃO consulta o endpoint de assinatura recorrente para temporada', async () => {
    // O id guardado é de uma PREFERÊNCIA. Perguntar por ele em
    // `/preapproval/{id}` devolve 404 e a tentativa ficaria AMBIGUA para
    // sempre, queimando uma chamada ao provedor a cada rodada do cron.
    const porta = new PagamentoFake()
    let consultouAssinatura = false
    porta.consultarAssinatura = async () => {
      consultouAssinatura = true
      throw new Error('não deveria ter sido chamado')
    }
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(consultouAssinatura).toBe(false)
  })

  it('rodar duas vezes não cria dois direitos', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    await reconciliarPagamentos(
      banco.db,
      porta,
      new Date(AGORA.getTime() + 600_000),
      FIM_DA_TEMPORADA,
    )

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('sem pagamento no provedor, a tentativa fica AMBIGUA e nada é concedido', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-abandonada')

    const resultado = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(resultado).toMatchObject({ examinadas: 1, encontradas: 0 })
    const [tentativa] = await banco.db
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.referenciaExterna, 'ref-abandonada'))
    expect(tentativa?.status).toBe('AMBIGUA')
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })

  it('pagamento recusado é registrado e não concede', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-recusada')
    porta.registrarPagamento({
      id: 'pay-recusado',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-recusada',
      status: 'rejected',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
    expect(await banco.db.select().from(cobrancas)).toHaveLength(1)
  })
})

describe('eventoDoPagamentoUnico — tradução provedor → NIP', () => {
  // Esta função é pura (tentativa + cobrança → evento) e é a tradução entre
  // o vocabulário do provedor (fatura/pagamento) e o vocabulário da NIP
  // (EventoPagamento). Um erro aqui não estoura em runtime — vira acesso
  // concedido, ou negado, pelo motivo errado. Testar por unidade trava a
  // invariante no próprio evento, sem depender de nenhum campo específico
  // nunca ser lido pelo webhook.ts — um refator futuro que passasse a
  // confiar em `proximaCobranca` ou `assinaturaExternaId` do evento não
  // deveria ficar verde por acidente.

  function tentativaFake(
    sobrescritas: Partial<typeof tentativasCheckout.$inferSelect> = {},
  ): typeof tentativasCheckout.$inferSelect {
    return {
      id: 'tentativa-1',
      usuarioId: 'usuario-1',
      produto: 'NBA_PRO',
      provedor: 'fake',
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      referenciaExterna: 'ref-da-tentativa',
      chaveIdempotencia: 'chave-1',
      status: 'CRIADA',
      assinaturaExternaId: null,
      urlCheckout: null,
      leaseExpiraEm: null,
      erroCodigo: null,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      ...sobrescritas,
    }
  }

  // A cobrança de entrada carrega DE PROPÓSITO uma `proximaCobranca` e um
  // `assinaturaExternaId` não nulos — são exatamente os dois campos que a
  // função precisa zerar. Um evento fabricado sem eles não provaria nada.
  const COBRANCA_BASE: CobrancaExterna = {
    id: 'pay-1',
    assinaturaExternaId: 'preap-fantasma',
    referenciaExterna: 'ref-da-cobranca-no-provedor',
    status: 'approved',
    valorCentavos: 59700,
    moeda: 'BRL',
    ocorridoEm: '2026-10-01T12:00:00.000Z',
    proximaCobranca: '2026-11-01T12:00:00.000Z',
  }

  it('proximaCobranca sai null mesmo quando o provedor manda uma — temporada não tem recorrência', () => {
    const evento = eventoDoPagamentoUnico(tentativaFake(), COBRANCA_BASE)
    expect(evento.proximaCobranca).toBeNull()
  })

  it('assinaturaExternaId sai null mesmo quando a cobrança traz um — não existe preapproval de temporada', () => {
    const evento = eventoDoPagamentoUnico(tentativaFake(), COBRANCA_BASE)
    expect(evento.assinaturaExternaId).toBeNull()
  })

  it('referenciaExterna é a da TENTATIVA, não a da cobrança', () => {
    const evento = eventoDoPagamentoUnico(tentativaFake(), COBRANCA_BASE)
    expect(evento.referenciaExterna).toBe('ref-da-tentativa')
    expect(evento.referenciaExterna).not.toBe(COBRANCA_BASE.referenciaExterna)
  })

  it('eventoExternoId é determinístico — mesma entrada, mesma string; é isso que faz rodar duas vezes não duplicar', () => {
    const tentativa = tentativaFake()
    const primeiro = eventoDoPagamentoUnico(tentativa, COBRANCA_BASE)
    const segundo = eventoDoPagamentoUnico(tentativa, COBRANCA_BASE)
    expect(primeiro.eventoExternoId).toBe(segundo.eventoExternoId)
  })

  it.each([
    ['approved', 'PAGAMENTO_APROVADO'],
    ['refunded', 'PAGAMENTO_ESTORNADO'],
    ['charged_back', 'PAGAMENTO_CONTESTADO'],
    ['rejected', 'PAGAMENTO_RECUSADO'],
    ['cancelled', 'PAGAMENTO_RECUSADO'],
    ['canceled', 'PAGAMENTO_RECUSADO'],
    ['in_process', 'OUTRO'],
  ])('status do provedor "%s" vira tipo "%s"', (status, tipoEsperado) => {
    const evento = eventoDoPagamentoUnico(tentativaFake(), { ...COBRANCA_BASE, status })
    expect(evento.tipo).toBe(tipoEsperado)
  })
})

/**
 * A FILA QUE NUNCA ESVAZIAVA (auditoria 23/09).
 *
 * Pagas e abandonadas ficavam `CRIADA`/`AMBIGUA` para sempre, e o rodízio de
 * 50 por rodada levava ~6–7 h para voltar a um pagamento perdido com 2 mil
 * tentativas na fila.
 */
describe('a fila de reconciliação esvazia', () => {
  const outroUsuario = async (email: string) =>
    (await adicionarUsuario(banco.db, { email, senha: 'senha-segura-123', nome: 'Outro' })).id

  it('temporada paga sai da fila', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-paga')
    porta.registrarPagamento({
      id: 'pay-paga',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-paga',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    const [t] = await banco.db.select().from(tentativasCheckout)
    expect(t?.status).toBe('ENCERRADA')
    const segunda = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    expect(segunda.examinadas).toBe(0)
  })

  it('tentativa sem pagamento há mais de 7 dias sai da fila; a de ontem continua', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-velha', new Date(AGORA.getTime() - 8 * 24 * 3600_000))
    await tentativaDeTemporada(
      'ref-nova',
      new Date(AGORA.getTime() - 24 * 3600_000),
      await outroUsuario('nova@exemplo.com'),
    )
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    const linhas = await banco.db.select().from(tentativasCheckout)
    const status = Object.fromEntries(linhas.map((l) => [l.referenciaExterna, l.status]))
    expect(status['ref-velha']).toBe('ENCERRADA')
    expect(status['ref-nova']).toBe('AMBIGUA')
  })

  it('as tentativas recentes são examinadas primeiro', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-velha', new Date(AGORA.getTime() - 10 * 24 * 3600_000))
    await banco.db
      .update(tentativasCheckout)
      .set({ atualizadoEm: new Date(AGORA.getTime() - 5 * 24 * 3600_000) })
    await tentativaDeTemporada(
      'ref-nova',
      new Date(AGORA.getTime() - 24 * 3600_000),
      await outroUsuario('nova@exemplo.com'),
    )
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA, 1)
    const linhas = await banco.db.select().from(tentativasCheckout)
    const status = Object.fromEntries(linhas.map((l) => [l.referenciaExterna, l.status]))
    expect(status['ref-nova']).toBe('AMBIGUA')
    expect(status['ref-velha']).toBe('CRIADA')
  })

  it('mensal autorizado NÃO sai da fila — as renovações dependem dela', async () => {
    const porta = new PagamentoFake()
    // Tentativa antiga de propósito: nem a idade tira o mensal da fila.
    await banco.db.insert(tentativasCheckout).values({
      usuarioId,
      produto: 'NBA_PRO',
      provedor: 'fake',
      referenciaExterna: 'ref-mensal',
      chaveIdempotencia: 'chave-ref-mensal',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      status: 'CRIADA',
      assinaturaExternaId: 'sub-mensal',
      criadoEm: new Date(AGORA.getTime() - 30 * 24 * 3600_000),
      atualizadoEm: AGORA,
    })
    porta.assinaturas.set('sub-mensal', {
      id: 'sub-mensal',
      referenciaExterna: 'ref-mensal',
      status: 'authorized',
      nomePlano: 'mensal',
      urlCheckout: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub-mensal',
      proximaCobranca: new Date(AGORA.getTime() + 30 * 24 * 3600_000).toISOString(),
      ocorridoEm: AGORA.toISOString(),
    })
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    const [t] = await banco.db.select().from(tentativasCheckout)
    expect(t?.status).toBe('CRIADA')
  })
})
