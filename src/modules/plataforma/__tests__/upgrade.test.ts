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
import { avaliarAcesso, concederCortesia } from '../assinatura/direito'
import { PagamentoFake } from '../assinatura/fake'
import type { EventoPagamento } from '../assinatura/porta'
import { cancelarContratosSubstituidos } from '../assinatura/substituicao'
import { aplicarEventoPagamento } from '../assinatura/webhook'

const AGORA = new Date('2026-10-01T12:00:00.000Z')
const DEPOIS = new Date('2026-10-05T12:00:00.000Z')
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
      email: 'upgrade@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Upgrade',
    })
  ).id
})

async function semear(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  modalidade: 'MENSAL' | 'TEMPORADA',
) {
  // Só UMA tentativa aberta por usuário e produto: a anterior sai de cena.
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
 * Uma tentativa no status pedido, SEM encerrar as outras — é o que `semear`
 * faz e o que estes casos não podem fazer: a situação a provar é justamente
 * duas tentativas convivendo, uma encerrada e uma aberta.
 */
async function semearNoStatus(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  modalidade: 'MENSAL' | 'TEMPORADA',
  status: 'CRIADA' | 'ENCERRADA',
) {
  await banco.db.insert(tentativasCheckout).values({
    usuarioId,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano,
    modalidade,
    status,
    atualizadoEm: AGORA,
  })
}

function pagou(
  referencia: string,
  parcial: Partial<EventoPagamento> & { eventoExternoId: string; cobrancaExternaId: string },
): EventoPagamento {
  return {
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna: referencia,
    assinaturaExternaId: null,
    recursoTipo: 'COBRANCA',
    plano: null,
    proximaCobranca: null,
    ocorridoEm: AGORA.toISOString(),
    valorCentavos: 5990,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    ...parcial,
  }
}

/** Compra mensal aprovada: contrato no provedor, direito até a próxima cobrança. */
async function comprouMensal(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  idExterno: string,
  quando: Date,
) {
  await semear(referencia, nivelDoPlano, 'MENSAL')
  await aplicarEventoPagamento(
    banco.db,
    'fake',
    pagou(referencia, {
      eventoExternoId: `evt-${referencia}`,
      cobrancaExternaId: `pay-${referencia}`,
      assinaturaExternaId: idExterno,
      proximaCobranca: new Date(quando.getTime() + 30 * 86_400_000).toISOString(),
      ocorridoEm: quando.toISOString(),
    }),
    quando,
    FIM_DA_TEMPORADA,
  )
}

describe('upgrade de nível', () => {
  it('revoga o direito anterior com motivo UPGRADE e entrega o nível novo', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const direitos = await banco.db.select().from(direitosAcesso)
    expect(direitos).toHaveLength(2)
    const antigo = direitos.find((direito) => direito.nivelDoPlano === 'MVP')
    const novo = direitos.find((direito) => direito.nivelDoPlano === 'ALL_STAR')
    expect(antigo?.revogadoEm?.toISOString()).toBe(DEPOIS.toISOString())
    expect(antigo?.motivoRevogacao).toBe('UPGRADE')
    expect(novo?.revogadoEm).toBeNull()

    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('o novo direito já vale quando o antigo é revogado — nunca há buraco', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const direitos = await banco.db.select().from(direitosAcesso)
    const antigo = direitos.find((direito) => direito.nivelDoPlano === 'MVP')!
    const novo = direitos.find((direito) => direito.nivelDoPlano === 'ALL_STAR')!
    // A revogação do antigo não pode acontecer ANTES do início do novo; se
    // acontecesse, existiria um instante em que quem pagou mais teria menos
    // (decisão 3 da spec).
    expect(novo.inicio.getTime()).toBeLessThanOrEqual(antigo.revogadoEm!.getTime())
  })

  it('marca o contrato mensal anterior para cancelamento, e só ele', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const contratos = await banco.db.select().from(assinaturas)
    const antigo = contratos.find((contrato) => contrato.mercadopagoId === 'sub-mvp')
    const novo = contratos.find((contrato) => contrato.mercadopagoId === 'sub-all-star')
    expect(antigo?.cancelamentoSolicitadoEm?.toISOString()).toBe(DEPOIS.toISOString())
    expect(novo?.cancelamentoSolicitadoEm).toBeNull()
  })

  it('contrato de TEMPORADA com id de provedor não é marcado para cancelamento', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)

    // Estado que o fluxo normal nunca produz — temporada é pagamento único
    // (`criarPagamentoUnico`), sem `preapproval`, então `mercadopagoId` fica
    // sempre nulo nela. Inserido direto na tabela para provar o motivo de o
    // filtro `modalidade = 'MENSAL'` existir: não há `preapproval` de
    // temporada no provedor, e chamar `cancelarAssinatura` com um id que ele
    // não conhece seria tentar cancelar algo que nunca foi um contrato
    // recorrente.
    await banco.db.insert(assinaturas).values({
      usuarioId,
      mercadopagoId: 'sub-temporada-fantasma',
      referenciaExterna: 'ref-temporada-fantasma',
      produto: 'NBA_PRO',
      status: 'ATIVA',
      nivelDoPlano: 'MVP',
      modalidade: 'TEMPORADA',
      inicio: AGORA,
      fim: FIM_DA_TEMPORADA,
      atualizadoEm: AGORA,
    })

    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const [fantasma] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, 'sub-temporada-fantasma'))
    expect(fantasma?.cancelamentoSolicitadoEm).toBeNull()
  })

  it('trocar mensal por temporada também substitui — mesma regra do upgrade', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)

    await semear('ref-temporada', 'MVP', 'TEMPORADA')
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-temporada', {
        eventoExternoId: 'evt-temporada',
        cobrancaExternaId: 'pay-temporada',
        ocorridoEm: DEPOIS.toISOString(),
      }),
      DEPOIS,
      FIM_DA_TEMPORADA,
    )

    const direitos = await banco.db.select().from(direitosAcesso)
    const mensal = direitos.find((direito) => direito.modalidade === 'MENSAL')
    const temporada = direitos.find((direito) => direito.modalidade === 'TEMPORADA')
    expect(mensal?.motivoRevogacao).toBe('UPGRADE')
    expect(temporada?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({
      nivel: 'MVP',
      modalidade: 'TEMPORADA',
    })
  })

  it('uma cortesia de nível MAIOR sobrevive à compra do nível menor', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia-1',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })

    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', DEPOIS)

    const cortesia = (await banco.db.select().from(direitosAcesso)).find(
      (direito) => direito.origem === 'CORTESIA_ADMIN',
    )
    // Downgrade não existe: comprar o plano de baixo não pode apagar o de
    // cima que a pessoa já tinha (ruling R-B6).
    expect(cortesia?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('cortesia sobrevive à compra do MESMO nível — não é a compra que a concedeu', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia-mvp',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'MVP',
    })

    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', DEPOIS)

    const direitos = await banco.db.select().from(direitosAcesso)
    const cortesia = direitos.find((direito) => direito.origem === 'CORTESIA_ADMIN')
    const comprado = direitos.find((direito) => direito.origem !== 'CORTESIA_ADMIN')
    // Origem administrativa, não compra: `atende('MVP', 'MVP')` é `true`, mas
    // cortesia nunca é revogada por uma compra — só um admin tira cortesia.
    expect(cortesia?.revogadoEm).toBeNull()
    expect(cortesia?.motivoRevogacao).toBeNull()
    expect(comprado).toBeDefined()
  })

  it('cortesia sobrevive à compra de nível MAIOR — a regra é sobre a ORIGEM', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia-mvp-2',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'MVP',
    })

    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const cortesia = (await banco.db.select().from(direitosAcesso)).find(
      (direito) => direito.origem === 'CORTESIA_ADMIN',
    )
    expect(cortesia?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('renovação mensal não cancela o próprio contrato', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    // Segundo mês: MESMA referência, MESMO contrato, cobrança nova.
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-mvp', {
        eventoExternoId: 'evt-mes-2',
        cobrancaExternaId: 'pay-mes-2',
        assinaturaExternaId: 'sub-mvp',
        ocorridoEm: DEPOIS.toISOString(),
        proximaCobranca: new Date(DEPOIS.getTime() + 30 * 86_400_000).toISOString(),
      }),
      DEPOIS,
      FIM_DA_TEMPORADA,
    )

    const contratos = await banco.db.select().from(assinaturas)
    expect(contratos).toHaveLength(1)
    expect(contratos[0]?.cancelamentoSolicitadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'MVP' })

    // Mesmo nível, mesma modalidade: renovação, não upgrade. Nenhum direito
    // deste usuário pode carregar um motivo de revogação que não aconteceu —
    // é o que o achado 1 da rodada de correção travou.
    const direitos = await banco.db
      .select()
      .from(direitosAcesso)
      .where(eq(direitosAcesso.usuarioId, usuarioId))
    expect(direitos.every((direito) => direito.motivoRevogacao === null)).toBe(true)
  })
})

/**
 * A COBRANÇA DA TENTATIVA ENCERRADA (achado Critical da revisão final).
 *
 * "Trocar de SKU" na tela encerra a tentativa antiga e abre outra — mas a
 * preferência/preapproval antiga continua viva e PAGÁVEL no Mercado Pago.
 * Quando ela é paga, o webhook não pode tentar reabrir a tentativa encerrada:
 * o índice parcial `tentativas_checkout_aberta_unica` recusa a segunda aberta,
 * a transação inteira faz rollback e cai junto o direito de quem pagou.
 */
describe('pagamento de tentativa ENCERRADA', () => {
  it('não reabre a encerrada, e mesmo assim entrega o direito que foi pago', async () => {
    await semearNoStatus('ref-encerrada', 'MVP', 'MENSAL', 'ENCERRADA')
    await semearNoStatus('ref-aberta', 'ALL_STAR', 'MENSAL', 'CRIADA')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-encerrada', {
        eventoExternoId: 'evt-encerrada',
        cobrancaExternaId: 'pay-encerrada',
        assinaturaExternaId: 'sub-encerrada',
        proximaCobranca: new Date(AGORA.getTime() + 30 * 86_400_000).toISOString(),
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    // (a) não estoura — sem isto o Mercado Pago recebe 500 e retenta para sempre.
    expect(resultado).toMatchObject({ aceito: true, duplicado: false, liberou: true })

    // (b) o direito nasce, com o nível da tentativa ENCERRADA: foi ela que
    // dizia o que aquela cobrança estava vendendo. A pessoa pagou de verdade.
    const direitos = await banco.db.select().from(direitosAcesso)
    expect(direitos).toHaveLength(1)
    expect(direitos[0]).toMatchObject({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
    expect(await avaliarAcesso(banco.db, usuarioId, AGORA)).toMatchObject({ nivel: 'MVP' })

    const tentativas = await banco.db.select().from(tentativasCheckout)
    const encerrada = tentativas.find((t) => t.referenciaExterna === 'ref-encerrada')
    const aberta = tentativas.find((t) => t.referenciaExterna === 'ref-aberta')
    // (c) encerrada continua encerrada e (d) a outra continua aberta — uma só.
    expect(encerrada?.status).toBe('ENCERRADA')
    expect(aberta?.status).toBe('CRIADA')
  })

  it('a contestação da cobrança antiga revoga o direito — a transação não estoura', async () => {
    await semearNoStatus('ref-encerrada', 'MVP', 'MENSAL', 'ENCERRADA')
    await semearNoStatus('ref-aberta', 'ALL_STAR', 'MENSAL', 'CRIADA')
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-encerrada', {
        eventoExternoId: 'evt-encerrada',
        cobrancaExternaId: 'pay-encerrada',
        assinaturaExternaId: 'sub-encerrada',
        proximaCobranca: new Date(AGORA.getTime() + 30 * 86_400_000).toISOString(),
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    const contestado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-encerrada', {
        tipo: 'PAGAMENTO_CONTESTADO',
        eventoExternoId: 'evt-contestacao',
        cobrancaExternaId: 'pay-encerrada',
        assinaturaExternaId: 'sub-encerrada',
        statusExterno: 'charged_back',
        ocorridoEm: DEPOIS.toISOString(),
      }),
      DEPOIS,
      FIM_DA_TEMPORADA,
    )

    expect(contestado).toMatchObject({ aceito: true, duplicado: false })
    // O outro lado do mesmo defeito: se a transação estourasse, o chargeback
    // NÃO revogaria — contestou e continuava com o produto.
    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito?.revogadoEm).not.toBeNull()
    expect(direito?.motivoRevogacao).toBe('PAGAMENTO_CONTESTADO')
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'GRATIS' })
  })
})

describe('compra MENOR não mata contrato MAIOR', () => {
  it('um contrato All Star mensal ativo não é marcado por um pagamento de MVP', async () => {
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', AGORA)
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', DEPOIS)

    const contratos = await banco.db.select().from(assinaturas)
    const allStar = contratos.find((contrato) => contrato.mercadopagoId === 'sub-all-star')
    // O direito All Star sobrevive (o laço de revogação não o toca), então
    // cancelar o preapproval dele deixaria a pessoa com o nível alto e sem
    // contrato — e na virada do período ela cairia de nível. Downgrade não
    // existe (decisão 12).
    expect(allStar?.cancelamentoSolicitadoEm).toBeNull()

    const direitos = await banco.db.select().from(direitosAcesso)
    const direitoAllStar = direitos.find((direito) => direito.nivelDoPlano === 'ALL_STAR')
    expect(direitoAllStar?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })
})

describe('cancelarContratosSubstituidos', () => {
  it('cancela no provedor o que ficou marcado, e registra a data', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)
    // O fake só cancela contrato que ele conhece — crie-o e aponte a linha
    // marcada para o id que ele devolveu.
    await porta.criarAssinatura({
      referenciaExterna: 'ref-mvp',
      chaveIdempotencia: 'chave-ref-mvp',
      emailPagador: 'upgrade@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    await banco.db
      .update(assinaturas)
      .set({ mercadopagoId: 'fake-ref-mvp' })
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))

    const resultado = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)

    expect(resultado).toEqual({ cancelados: 1, falhas: 0 })
    expect(porta.cancelamentos).toEqual(['fake-ref-mvp'])
    const [cancelado] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, 'fake-ref-mvp'))
    expect(cancelado?.canceladaEm).not.toBeNull()
    // Em PORTUGUÊS, a mesma palavra que o webhook grava no mesmo campo — e é
    // essa string crua que a tela da conta mostra ao assinante. O provedor
    // devolve 'canceled'/'cancelled'; deixar passar é a NIP falando duas
    // línguas sobre o mesmo contrato, na frente de quem paga.
    expect(cancelado?.status).toBe('CANCELADA')
  })

  it('falha no provedor não perde a marca — a próxima varredura tenta de novo', async () => {
    // O fake não conhece 'sub-mvp': `cancelarAssinatura` lança, como o
    // provedor lançaria num 5xx.
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const primeira = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)
    expect(primeira).toEqual({ cancelados: 0, falhas: 1 })

    const [aindaPendente] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))
    // Desistir aqui é continuar cobrando quem já trocou de plano.
    expect(aindaPendente?.cancelamentoSolicitadoEm).not.toBeNull()
    expect(aindaPendente?.canceladaEm).toBeNull()
  })

  it('duas varreduras do mesmo contrato usam a MESMA chave de idempotência', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    // Primeira varredura: o fake ainda não conhece 'sub-mvp' no provedor —
    // falha, como o provedor falharia num 5xx.
    const primeira = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)
    expect(primeira).toEqual({ cancelados: 0, falhas: 1 })

    // Agora o contrato passa a existir no provedor (id externo diferente do
    // que estava gravado) — a segunda varredura consegue cancelar.
    await porta.criarAssinatura({
      referenciaExterna: 'ref-mvp',
      chaveIdempotencia: 'chave-ref-mvp',
      emailPagador: 'upgrade@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    await banco.db
      .update(assinaturas)
      .set({ mercadopagoId: 'fake-ref-mvp' })
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))

    const segunda = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)
    expect(segunda).toEqual({ cancelados: 1, falhas: 0 })

    // A chave é DERIVADA do id INTERNO do contrato (que não mudou entre as
    // duas varreduras), não aleatória: mesma linha, mesma chave nas duas
    // tentativas — é o que faz o provedor tratar a segunda como retentativa
    // da primeira, e não como uma operação nova.
    expect(porta.chavesDeCancelamento).toHaveLength(2)
    expect(porta.chavesDeCancelamento[0]).toBe(porta.chavesDeCancelamento[1])
  })

  it('o mais antigo primeiro: com o lote cheio, ninguém fica para trás', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)
    // Um segundo contrato marcado, mais NOVO, e que o fake conhece. Sem
    // `orderBy`, o lote de um só poderia levar qualquer um dos dois — e o mais
    // antigo seguiria cobrando no cartão de quem já trocou de plano.
    await porta.criarAssinatura({
      referenciaExterna: 'ref-recente',
      chaveIdempotencia: 'chave-ref-recente',
      emailPagador: 'upgrade@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    await banco.db.insert(assinaturas).values({
      usuarioId,
      mercadopagoId: 'fake-ref-recente',
      referenciaExterna: 'ref-recente',
      produto: 'NBA_PRO',
      status: 'ATIVA',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      cancelamentoSolicitadoEm: new Date(DEPOIS.getTime() + 86_400_000),
      atualizadoEm: DEPOIS,
    })
    // O antigo também passa a existir no provedor, para que a escolha seja
    // entre dois canceláveis — e não entre um que dá certo e um que falha.
    await porta.criarAssinatura({
      referenciaExterna: 'ref-mvp',
      chaveIdempotencia: 'chave-ref-mvp',
      emailPagador: 'upgrade@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    await banco.db
      .update(assinaturas)
      .set({ mercadopagoId: 'fake-ref-mvp' })
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))

    const resultado = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS, { limite: 1 })

    expect(resultado).toEqual({ cancelados: 1, falhas: 0 })
    expect(porta.cancelamentos).toEqual(['fake-ref-mvp'])
  })

  it('a falha de um contrato vira log — cobrança indevida não pode ser invisível', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      // O fake não conhece 'sub-mvp': lança, como o provedor num 5xx.
      expect(await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)).toEqual({
        cancelados: 0,
        falhas: 1,
      })
      const registrado = avisos.mock.calls
        .map(([linha]) => (typeof linha === 'string' ? JSON.parse(linha) : null))
        .find((linha) => linha?.evento === 'contrato_substituido_nao_cancelado')
      expect(registrado).toBeTruthy()
      // Id do contrato: é por ele que a operação acha a pessoa. Nome do erro,
      // nunca token nem dado de cartão.
      const [marcado] = await banco.db
        .select()
        .from(assinaturas)
        .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))
      expect(registrado.assinaturaId).toBe(marcado?.id)
      expect(typeof registrado.erro).toBe('string')
      expect(JSON.stringify(registrado)).not.toContain('token')
    } finally {
      avisos.mockRestore()
    }
  })

  it('o webhook varre só o usuário do evento; o cron varre todo mundo', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)
    // Outra pessoa, com o contrato dela também marcado.
    const outroId = (
      await adicionarUsuario(banco.db, {
        email: 'outra@exemplo.com',
        senha: 'senha-segura-123',
        nome: 'Outra',
      })
    ).id
    await banco.db.insert(assinaturas).values({
      usuarioId: outroId,
      mercadopagoId: 'sub-de-outra-pessoa',
      referenciaExterna: 'ref-de-outra-pessoa',
      produto: 'NBA_PRO',
      status: 'ATIVA',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      cancelamentoSolicitadoEm: AGORA,
      atualizadoEm: AGORA,
    })

    await cancelarContratosSubstituidos(banco.db, porta, DEPOIS, { usuarioId })
    expect(porta.cancelamentos).not.toContain('sub-de-outra-pessoa')

    await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)
    expect(porta.cancelamentos).toContain('sub-de-outra-pessoa')
  })

  it('não mexe em contrato que ninguém marcou', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)

    expect(await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)).toEqual({
      cancelados: 0,
      falhas: 0,
    })
    expect(porta.cancelamentos).toEqual([])
  })
})
