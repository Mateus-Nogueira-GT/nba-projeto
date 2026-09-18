import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { EventoPagamento } from '../assinatura/porta'
import { aplicarEventoPagamento } from '../assinatura/webhook'

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
      email: 'temporada@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Temporada',
    })
  ).id
})

async function semear(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  modalidade: 'MENSAL' | 'TEMPORADA',
) {
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
    nivelDoPlano,
    modalidade,
    status: 'CRIADA',
    atualizadoEm: AGORA,
  })
}

/**
 * O aviso estruturado que um pagamento aprovado sem direito precisa deixar,
 * lido de volta do `console.warn`. Devolve `null` quando não houve nenhum.
 */
function avisoDePagamentoSemDireito(chamadas: unknown[][]): Record<string, unknown> | null {
  for (const [linha] of chamadas) {
    if (typeof linha !== 'string') continue
    const objeto = JSON.parse(linha) as Record<string, unknown>
    if (objeto.evento === 'pagamento_aprovado_sem_direito') return objeto
  }
  return null
}

function pagamentoAprovado(referencia: string, parcial: Partial<EventoPagamento> = {}): EventoPagamento {
  return {
    eventoExternoId: 'evt-temporada-1',
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna: referencia,
    // Pagamento único não tem contrato recorrente no provedor.
    assinaturaExternaId: null,
    cobrancaExternaId: 'pay-1',
    recursoTipo: 'COBRANCA',
    plano: 'NIP All Star temporada',
    proximaCobranca: null,
    ocorridoEm: AGORA.toISOString(),
    valorCentavos: 59700,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    ...parcial,
  }
}

describe('temporada: um pagamento, um direito com fim cravado', () => {
  it('concede até o fim da temporada e sem próxima cobrança', async () => {
    await semear('ref-temporada', 'ALL_STAR', 'TEMPORADA')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-temporada'),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ aceito: true, duplicado: false, liberou: true })
    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(direito?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())

    const [contrato] = await banco.db.select().from(assinaturas)
    expect(contrato).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(contrato?.proximaCobranca).toBeNull()
    expect(contrato?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())
    // Sem `preapproval` correspondente: é o que faz a conta não oferecer
    // "cancelar assinatura" para quem comprou temporada (ruling R-B4).
    expect(contrato?.mercadopagoId).toBeNull()

    const acesso = await avaliarAcesso(banco.db, usuarioId, AGORA)
    expect(acesso).toMatchObject({ nivel: 'ALL_STAR', modalidade: 'TEMPORADA' })
  })

  it('o MESMO evento entregue duas vezes não cria dois direitos', async () => {
    await semear('ref-temporada', 'MVP', 'TEMPORADA')
    const evento = pagamentoAprovado('ref-temporada')

    const primeira = await aplicarEventoPagamento(banco.db, 'fake', evento, AGORA, FIM_DA_TEMPORADA)
    const segunda = await aplicarEventoPagamento(banco.db, 'fake', evento, AGORA, FIM_DA_TEMPORADA)

    expect(primeira).toMatchObject({ duplicado: false })
    expect(segunda).toMatchObject({ duplicado: true })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('o MESMO pagamento por outro evento (webhook + reconciliação) também não duplica', async () => {
    await semear('ref-temporada', 'MVP', 'TEMPORADA')

    await aplicarEventoPagamento(banco.db, 'fake', pagamentoAprovado('ref-temporada'), AGORA, FIM_DA_TEMPORADA)
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-temporada', {
        eventoExternoId: 'reconciliacao:abc',
        ocorridoEm: new Date(AGORA.getTime() + 60_000).toISOString(),
      }),
      new Date(AGORA.getTime() + 60_000),
      FIM_DA_TEMPORADA,
    )

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('pagamento aprovado depois da temporada não cria direito vencido — e deixa rastro', async () => {
    await semear('ref-atrasada', 'MVP', 'TEMPORADA')
    const depois = new Date('2027-08-01T12:00:00.000Z')
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const resultado = await aplicarEventoPagamento(
        banco.db,
        'fake',
        pagamentoAprovado('ref-atrasada', { ocorridoEm: depois.toISOString() }),
        depois,
        FIM_DA_TEMPORADA,
      )

      // `fim <= inicio` já era recusado: um direito que nasce vencido é pior
      // que nenhum, porque a conta anunciaria acesso que não existe. O estorno
      // é manual (spec §9), com registro.
      expect(resultado).toMatchObject({ liberou: false })
      expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)

      // Boleto ou Pix de temporada comprado dentro da janela e aprovado
      // depois dela: a cobrança FOI gravada, e sem este aviso ninguém na
      // operação saberia que existe alguém que pagou e não recebeu.
      const aviso = avisoDePagamentoSemDireito(avisos.mock.calls)
      expect(aviso).toMatchObject({
        usuarioId,
        cobrancaExternaId: 'pay-1',
        modalidade: 'TEMPORADA',
        fim: FIM_DA_TEMPORADA.toISOString(),
        inicio: depois.toISOString(),
      })
    } finally {
      avisos.mockRestore()
    }
  })

  it('sem fim de temporada configurado, a temporada não concede nada — e deixa rastro', async () => {
    await semear('ref-sem-config', 'MVP', 'TEMPORADA')
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const resultado = await aplicarEventoPagamento(
        banco.db,
        'fake',
        pagamentoAprovado('ref-sem-config'),
        AGORA,
        null,
      )

      expect(resultado).toMatchObject({ liberou: false })
      expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
      // `TEMPORADA_FIM` ausente do ambiente é o segundo caminho real até aqui.
      expect(avisoDePagamentoSemDireito(avisos.mock.calls)).toMatchObject({
        usuarioId,
        modalidade: 'TEMPORADA',
        fim: null,
      })
    } finally {
      avisos.mockRestore()
    }
  })

  it('ignora a próxima cobrança do provedor mesmo quando ele manda uma', async () => {
    await semear('ref-temporada-com-proxima', 'ALL_STAR', 'TEMPORADA')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-temporada-com-proxima', {
        eventoExternoId: 'evt-temporada-com-proxima',
        // O provedor manda esse campo mesmo em pagamento único; a temporada
        // não tem recorrência, e deixar essa data vazar faria a conta
        // anunciar uma cobrança que nunca vai acontecer.
        proximaCobranca: '2026-11-01T12:00:00.000Z',
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ liberou: true })

    const [contrato] = await banco.db.select().from(assinaturas)
    expect(contrato?.proximaCobranca).toBeNull()

    const [direito] = await banco.db.select().from(direitosAcesso)
    // O fim do direito é a data VENDIDA, não a que o provedor mandou.
    expect(direito?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())
  })
})

describe('mensal: o nível vem da tentativa, não de uma constante', () => {
  it('um pagamento de ALL_STAR mensal concede ALL_STAR', async () => {
    await semear('ref-mensal', 'ALL_STAR', 'MENSAL')

    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-mensal', {
        eventoExternoId: 'evt-mensal',
        assinaturaExternaId: 'sub-1',
        proximaCobranca: '2026-11-01T12:00:00.000Z',
        plano: 'NIP All Star mensal',
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' })
    // Mensal continua valendo até a próxima cobrança, nunca até a temporada.
    expect(direito?.fim?.toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })
})

describe('conflito na mesma chave de direito atualiza nível E modalidade', () => {
  it('a segunda compra, de outro SKU, sobrescreve nível e modalidade do direito (regressão do Plano A)', async () => {
    // Duas compras da MESMA cobrança no provedor (colisão proposital de
    // `cobrancaExternaId`) mas de tentativas com SKU diferente. A chave de
    // conflito de `direitos_acesso` é (origem, referência_origem, produto) —
    // não inclui nível nem modalidade — então as duas caem na MESMA linha, e
    // o `set` do `onConflictDoUpdate` precisa reescrever os dois campos. O
    // Plano A tinha esse defeito: atualizava o nível e deixava a modalidade
    // para trás, e um teste que reusasse a mesma tentativa nas duas vezes
    // não pegaria isso porque nada mudaria entre o insert e o update.
    await semear('ref-conflito-a', 'MVP', 'MENSAL')
    const primeira = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-conflito-a', {
        eventoExternoId: 'evt-conflito-1',
        cobrancaExternaId: 'pay-conflito',
        proximaCobranca: '2026-11-01T12:00:00.000Z',
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )
    expect(primeira).toMatchObject({ liberou: true })

    await semear('ref-conflito-b', 'ALL_STAR', 'TEMPORADA')
    const depois = new Date(AGORA.getTime() + 60_000)
    const segunda = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-conflito-b', {
        // Precisa ser outro id de EVENTO — senão a idempotência de
        // `eventos_pagamento` barra antes de chegar no conflito de direito.
        eventoExternoId: 'evt-conflito-2',
        // Precisa ser o MESMO id de COBRANÇA — é isso que faz as duas caírem
        // na mesma linha de `direitos_acesso`.
        cobrancaExternaId: 'pay-conflito',
        ocorridoEm: depois.toISOString(),
      }),
      depois,
      FIM_DA_TEMPORADA,
    )
    expect(segunda).toMatchObject({ liberou: true })

    const linhas = await banco.db.select().from(direitosAcesso)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
  })
})

describe('evento sem tentativa', () => {
  it('é registrado para auditoria e não concede nada', async () => {
    // Nada semeado: a referência não corresponde a nenhuma compra desta
    // instalação. Sem tentativa não há SKU, e conceder exigiria inventar um
    // nível (ruling R-B3).
    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-desconhecida'),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ aceito: true, duplicado: false, liberou: false })
    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(1)
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)
  })

  it('o UUID do usuário como referência já não é atalho para conceder', async () => {
    // Caminho de compatibilidade que existia em `usuarioDoEvento`: ele
    // resolvia o usuário quando a referência era o UUID dele. Não sabe o SKU,
    // e em produção nunca chegou a existir — o checkout nunca esteve ligado.
    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado(usuarioId),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ liberou: false })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })
})
