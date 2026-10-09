import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import type { Sessao } from '../auth/sessao'
import { cancelarAssinaturaDoUsuario, NenhumaAssinaturaAtivaError } from '../assinatura/checkout'
import { PagamentoFake } from '../assinatura/fake'
import type { EventoPagamento } from '../assinatura/porta'
import { cancelarContratosSubstituidos } from '../assinatura/substituicao'
import { aplicarEventoPagamento } from '../assinatura/webhook'

/**
 * Pente fino de 09/10, achado 2 (spec §2.2): depois de um upgrade, o cron
 * cancela o contrato MVP e o escreve por último. "Cancelar assinatura" pegava
 * a última escrita — o MVP já morto — e deixava o All Star cobrando.
 */
const AGORA = new Date('2026-10-01T12:00:00.000Z')
const DEPOIS = new Date('2026-10-05T12:00:00.000Z')
const CRON = new Date('2026-10-05T12:10:00.000Z')
const CANCELAMENTO = new Date('2026-10-05T12:20:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let porta: PagamentoFake

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(cobrancas)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'cancela@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Cancela',
    })
  ).id
  // O id do contrato no fake é a própria referência: 'pre-mvp', 'pre-as'.
  porta = new PagamentoFake(true, async (pedido) => ({
    id: pedido.referenciaExterna,
    referenciaExterna: pedido.referenciaExterna,
    status: 'authorized',
    nomePlano: pedido.nomePlano,
    urlCheckout: 'https://www.mercadopago.com.br/subscriptions/checkout',
    proximaCobranca: null,
    ocorridoEm: null,
  }))
})

function sessao(): Sessao {
  return {
    usuarioId,
    email: 'cancela@exemplo.com',
    papel: 'USUARIO',
    sessaoId: 'sessao-teste',
    dispositivoId: null,
    criadaEm: CANCELAMENTO,
  }
}

/** Compra mensal aprovada, com o contrato existindo no provedor falso. */
async function comprouMensal(referencia: string, nivelDoPlano: 'MVP' | 'ALL_STAR', quando: Date) {
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
    nivelDoPlano,
    modalidade: 'MENSAL',
    status: 'CRIADA',
    atualizadoEm: quando,
  })
  await porta.criarAssinatura({
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    emailPagador: 'cancela@exemplo.com',
    nomePlano: `NIP ${nivelDoPlano} mensal`,
    valorCentavos: 5990,
    moeda: 'BRL',
    frequencia: 1,
    tipoFrequencia: 'months',
    urlRetorno: 'https://app.example.com/retorno/mercadopago',
  })
  const evento: EventoPagamento = {
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna: referencia,
    assinaturaExternaId: referencia,
    recursoTipo: 'COBRANCA',
    plano: null,
    proximaCobranca: new Date(quando.getTime() + 30 * 86_400_000).toISOString(),
    ocorridoEm: quando.toISOString(),
    valorCentavos: 5990,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    eventoExternoId: `evt-${referencia}`,
    cobrancaExternaId: `pay-${referencia}`,
  }
  await aplicarEventoPagamento(banco.db, 'fake', evento, quando, FIM_DA_TEMPORADA)
}

async function contratoDe(mercadopagoId: string) {
  const [linha] = await banco.db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.mercadopagoId, mercadopagoId))
  return linha!
}

/** MVP mensal → upgrade All Star → o cron cancela o MVP (escrito por último). */
async function depoisDoUpgrade() {
  await comprouMensal('pre-mvp', 'MVP', AGORA)
  await comprouMensal('pre-as', 'ALL_STAR', DEPOIS)
  await cancelarContratosSubstituidos(banco.db, porta, CRON)
  expect(porta.cancelamentos).toEqual(['pre-mvp'])
  porta.cancelamentos.length = 0
}

describe('cancelar assinatura depois de um upgrade (pente fino 09/10, achado 2)', () => {
  it('sem id, cancela o contrato vigente (All Star), não o MVP já cancelado pelo cron', async () => {
    await depoisDoUpgrade()

    await cancelarAssinaturaDoUsuario(banco.db, porta, sessao(), { ip: null, agora: CANCELAMENTO })

    expect(porta.cancelamentos).toEqual(['pre-as'])
    expect((await contratoDe('pre-as')).canceladaEm).not.toBeNull()
  })

  it('com o id do formulário, cancela exatamente esse contrato', async () => {
    await depoisDoUpgrade()
    const vigente = await contratoDe('pre-as')

    await cancelarAssinaturaDoUsuario(banco.db, porta, sessao(), {
      ip: null,
      agora: CANCELAMENTO,
      assinaturaId: vigente.id,
    })

    expect(porta.cancelamentos).toEqual(['pre-as'])
  })

  it('id de contrato já cancelado: erro, sem chamar o Mercado Pago', async () => {
    await depoisDoUpgrade()
    const morto = await contratoDe('pre-mvp')

    await expect(
      cancelarAssinaturaDoUsuario(banco.db, porta, sessao(), {
        ip: null,
        agora: CANCELAMENTO,
        assinaturaId: morto.id,
      }),
    ).rejects.toBeInstanceOf(NenhumaAssinaturaAtivaError)
    expect(porta.cancelamentos).toEqual([])
  })

  it('id de contrato de OUTRA conta: erro, sem chamar o Mercado Pago', async () => {
    await depoisDoUpgrade()
    const vigente = await contratoDe('pre-as')
    const outra = await adicionarUsuario(banco.db, {
      email: 'outra@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Outra',
    })

    await expect(
      cancelarAssinaturaDoUsuario(
        banco.db,
        porta,
        { ...sessao(), usuarioId: outra.id, email: 'outra@exemplo.com' },
        { ip: null, agora: CANCELAMENTO, assinaturaId: vigente.id },
      ),
    ).rejects.toBeInstanceOf(NenhumaAssinaturaAtivaError)
    expect(porta.cancelamentos).toEqual([])
  })

  it('só contratos cancelados: erro "nenhuma assinatura ativa", sem chamar o Mercado Pago', async () => {
    await depoisDoUpgrade()
    await cancelarAssinaturaDoUsuario(banco.db, porta, sessao(), { ip: null, agora: CANCELAMENTO })
    porta.cancelamentos.length = 0

    await expect(
      cancelarAssinaturaDoUsuario(banco.db, porta, sessao(), { ip: null, agora: CANCELAMENTO }),
    ).rejects.toThrow('nenhuma assinatura ativa para cancelar')
    expect(porta.cancelamentos).toEqual([])
  })
})
