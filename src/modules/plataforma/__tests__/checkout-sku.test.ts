import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  direitosAcesso,
  tentativasCheckout,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { CheckoutIndisponivelError, iniciarCheckout } from '../assinatura/checkout'
import type { ConfiguracaoProdutoPago } from '../assinatura/configuracao'
import { PagamentoFake } from '../assinatura/fake'
import type { PrecosDosPlanos } from '../assinatura/precos'

const AGORA = new Date('2026-10-01T12:00:00.000Z')

const config: ConfiguracaoProdutoPago = {
  checkoutHabilitado: true,
  cadastroPublicoHabilitado: true,
  frequencia: 1,
  tipoFrequencia: 'months',
  moeda: 'BRL',
  urlPublica: 'https://app.example.com',
  hostsPermitidos: new Set(['app.example.com']),
}

const precos: PrecosDosPlanos = {
  porSku: {
    MVP_MENSAL: { centavos: 5990, deCentavos: 7990 },
    MVP_TEMPORADA: { centavos: 39700, deCentavos: null },
    ALL_STAR_MENSAL: { centavos: 9990, deCentavos: 14900 },
    ALL_STAR_TEMPORADA: { centavos: 59700, deCentavos: null },
  },
  fimDaTemporada: new Date('2027-07-01T03:00:00.000Z'),
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
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'comprador@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Comprador',
    })
  ).id
})

async function comprar(sku: Parameters<typeof iniciarCheckout>[4]['sku'], porta = new PagamentoFake()) {
  const resultado = await iniciarCheckout(banco.db, porta, config, precos, {
    usuarioId,
    sku,
    ip: '203.0.113.10',
    agora: AGORA,
  })
  return { porta, resultado }
}

async function tentativaAberta() {
  const linhas = await banco.db
    .select()
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  return linhas.filter((linha) => linha.status !== 'ENCERRADA')
}

describe('mensal, um preapproval por nível', () => {
  it('manda o nome e o preço do SKU escolhido, e grava o SKU na tentativa', async () => {
    const { porta } = await comprar('ALL_STAR_MENSAL')

    expect(porta.criacoes).toHaveLength(1)
    expect(porta.criacoes[0]).toMatchObject({
      nomePlano: 'NIP All Star mensal',
      valorCentavos: 9990,
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    const [tentativa] = await tentativaAberta()
    expect(tentativa).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' })
  })

  it('o contrato espelhado nasce com o mesmo SKU da tentativa', async () => {
    await comprar('MVP_MENSAL')
    const [assinatura] = await banco.db.select().from(assinaturas)
    expect(assinatura).toMatchObject({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
  })

  it('o preço vem de `precos`, nunca de um número no código', async () => {
    const outros: PrecosDosPlanos = {
      ...precos,
      porSku: { ...precos.porSku, MVP_MENSAL: { centavos: 100, deCentavos: null } },
    }
    const porta = new PagamentoFake()
    await iniciarCheckout(banco.db, porta, config, outros, {
      usuarioId,
      sku: 'MVP_MENSAL',
      ip: null,
      agora: AGORA,
    })
    expect(porta.criacoes[0]?.valorCentavos).toBe(100)
  })
})

describe('temporada, pagamento único', () => {
  it('cria preferência com o preço da temporada e NÃO cria contrato', async () => {
    const { porta, resultado } = await comprar('MVP_TEMPORADA')

    expect(porta.preferencias).toHaveLength(1)
    expect(porta.preferencias[0]).toMatchObject({
      nomePlano: 'NIP MVP temporada',
      valorCentavos: 39700,
    })
    expect(porta.criacoes).toHaveLength(0)
    // Preferência não é contrato: ninguém pagou. A linha de `assinaturas`
    // nasce no webhook, na aprovação.
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)
    expect(resultado.status).toBe('PRONTO')
  })

  it('guarda o id da preferência e a URL na tentativa', async () => {
    await comprar('ALL_STAR_TEMPORADA')
    const [tentativa] = await tentativaAberta()
    expect(tentativa).toMatchObject({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      status: 'CRIADA',
    })
    expect(tentativa?.assinaturaExternaId).toContain('fake-pref-')
    expect(tentativa?.urlCheckout).toContain('mercadopago.com.br')
  })

  it('retomar a mesma tentativa não abre uma segunda cobrança', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_TEMPORADA', porta)
    // Força a retomada: a tentativa volta a AMBIGUA, como depois de um
    // timeout de rede.
    await banco.db
      .update(tentativasCheckout)
      .set({ status: 'AMBIGUA', urlCheckout: null, leaseExpiraEm: null })
      .where(eq(tentativasCheckout.usuarioId, usuarioId))

    await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'MVP_TEMPORADA',
      ip: null,
      agora: new Date(AGORA.getTime() + 120_000),
    })

    // O fake honra a chave de idempotência, como o provedor: a segunda
    // chamada devolve a MESMA preferência.
    expect(porta.preferencias).toHaveLength(1)
    expect(await tentativaAberta()).toHaveLength(1)
  })
})

/** Direito pago e vigente, do jeito que o webhook grava. */
async function jaTem(nivelDoPlano: 'MVP' | 'ALL_STAR', modalidade: 'MENSAL' | 'TEMPORADA') {
  await banco.db.insert(direitosAcesso).values({
    usuarioId,
    produto: 'NBA_PRO',
    origem: 'fake',
    referenciaOrigem: `pay-${nivelDoPlano}-${modalidade}`,
    nivelDoPlano,
    modalidade,
    inicio: new Date(AGORA.getTime() - 86_400_000),
    fim: new Date(AGORA.getTime() + 30 * 86_400_000),
    atualizadoEm: AGORA,
  })
}

describe('o portão do nível é do servidor, não da tela', () => {
  it('quem tem All Star mensal não compra MVP mensal, nem por POST montado à mão', async () => {
    await jaTem('ALL_STAR', 'MENSAL')
    const porta = new PagamentoFake()

    // "Não se compra abaixo do que já se tem" (decisão 12). A aba de
    // `/assinar` aberta quando a pessoa ainda era GRATIS ainda oferece este
    // botão; a server action valida só o formato do SKU.
    await expect(
      iniciarCheckout(banco.db, porta, config, precos, {
        usuarioId,
        sku: 'MVP_MENSAL',
        ip: null,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(CheckoutIndisponivelError)

    // Nada gravado e nada enviado ao provedor: a recusa vem antes da rede.
    expect(porta.criacoes).toHaveLength(0)
    expect(porta.preferencias).toHaveLength(0)
    expect(await banco.db.select().from(tentativasCheckout)).toHaveLength(0)
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)
  })

  it('quem tem temporada não volta para mensal', async () => {
    await jaTem('MVP', 'TEMPORADA')
    const porta = new PagamentoFake()

    await expect(
      iniciarCheckout(banco.db, porta, config, precos, {
        usuarioId,
        sku: 'ALL_STAR_MENSAL',
        ip: null,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(CheckoutIndisponivelError)
    expect(porta.criacoes).toHaveLength(0)
  })

  it('o upgrade continua passando — o portão recusa o que o seletor não oferece, nada mais', async () => {
    await jaTem('MVP', 'MENSAL')
    const { resultado, porta } = await comprar('ALL_STAR_MENSAL')

    expect(resultado.status).toBe('PRONTO')
    expect(porta.criacoes).toHaveLength(1)
  })
})

describe('trocar de SKU', () => {
  it('encerra a tentativa do SKU antigo e abre uma nova, com outra referência', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_MENSAL', porta)
    const [antes] = await tentativaAberta()

    await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'ALL_STAR_TEMPORADA',
      ip: null,
      agora: new Date(AGORA.getTime() + 60_000),
    })

    const abertas = await tentativaAberta()
    expect(abertas).toHaveLength(1)
    expect(abertas[0]?.modalidade).toBe('TEMPORADA')
    expect(abertas[0]?.nivelDoPlano).toBe('ALL_STAR')
    // Referência nova: a antiga já está no provedor amarrada ao plano antigo.
    expect(abertas[0]?.referenciaExterna).not.toBe(antes?.referenciaExterna)

    const todas = await banco.db
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.usuarioId, usuarioId))
    expect(todas.filter((linha) => linha.status === 'ENCERRADA')).toHaveLength(1)
  })

  it('o MESMO SKU reaproveita a URL já criada, como antes', async () => {
    const porta = new PagamentoFake()
    const primeira = await comprar('MVP_MENSAL', porta)
    const segunda = await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'MVP_MENSAL',
      ip: null,
      agora: new Date(AGORA.getTime() + 60_000),
    })

    expect(porta.criacoes).toHaveLength(1)
    expect(segunda).toMatchObject({ status: 'PRONTO', reutilizada: true })
    if (primeira.resultado.status === 'PRONTO' && segunda.status === 'PRONTO') {
      expect(segunda.url).toBe(primeira.resultado.url)
    }
  })

  it('com criação em voo, trocar de SKU espera — não encerra o que está na rede', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_MENSAL', porta)
    // Simula o instante em que o POST ao provedor ainda não voltou.
    await banco.db
      .update(tentativasCheckout)
      .set({
        status: 'CRIANDO',
        urlCheckout: null,
        leaseExpiraEm: new Date(AGORA.getTime() + 30_000),
      })
      .where(eq(tentativasCheckout.usuarioId, usuarioId))

    const resultado = await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'ALL_STAR_MENSAL',
      ip: null,
      agora: new Date(AGORA.getTime() + 1_000),
    })

    expect(resultado.status).toBe('PROCESSANDO')
    const abertas = await tentativaAberta()
    expect(abertas).toHaveLength(1)
    expect(abertas[0]?.nivelDoPlano).toBe('MVP')
  })
})

describe('reabrir um checkout pronto', () => {
  it('não gasta o limite de checkout', async () => {
    const porta = new PagamentoFake()
    // Seis reaberturas da MESMA compra: o limite é 5, e só a primeira
    // criação é uma operação nova (auditoria de 23/09).
    for (let i = 0; i < 6; i++) {
      const { resultado } = await comprar('MVP_MENSAL', porta)
      expect(resultado.status).toBe('PRONTO')
    }
  })
})
