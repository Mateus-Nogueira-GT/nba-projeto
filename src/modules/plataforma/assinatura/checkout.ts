import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import {
  assinaturas,
  tentativasCheckout,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Sessao } from '../auth/sessao'
import { PRODUTO_PAGO, type ConfiguracaoProdutoPago, urlDeRetorno } from './configuracao'
import { avaliarAcesso } from './direito'
import { excedeuOperacoes, registrarOperacao } from './operacoes'
import type { PrecosDosPlanos } from './precos'
import { composicaoDoSku, NOME_DO_SKU, ofertasDisponiveis, type Sku } from './sku'
import type { AssinaturaExterna, PagamentoExterno, PortaCobranca } from './porta'

const STATUS_ABERTOS = ['RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA'] as const
const LEASE_CHECKOUT_MS = 30_000
const JANELA_SESSAO_RECENTE_MS = 15 * 60_000

export type ResultadoCheckout =
  | { status: 'PRONTO'; url: string; tentativaId: string; reutilizada: boolean }
  | { status: 'PROCESSANDO'; tentativaId: string }

export class CheckoutIndisponivelError extends Error {
  constructor(message = 'checkout indisponível') {
    super(message)
    this.name = 'CheckoutIndisponivelError'
  }
}

export class LimiteOperacaoError extends Error {
  constructor() {
    super('muitas tentativas; aguarde antes de repetir')
    this.name = 'LimiteOperacaoError'
  }
}

export class SessaoRecenteObrigatoriaError extends Error {
  constructor() {
    super('confirme sua identidade entrando novamente')
    this.name = 'SessaoRecenteObrigatoriaError'
  }
}

function urlCheckoutSegura(valor: string | null): string {
  if (!valor) throw new Error('provedor não retornou URL de checkout')
  const url = new URL(valor)
  const host = url.hostname.toLowerCase()
  const permitido =
    url.protocol === 'https:' &&
    (host === 'mercadopago.com' ||
      host.endsWith('.mercadopago.com') ||
      host === 'mercadopago.com.br' ||
      host.endsWith('.mercadopago.com.br') ||
      host === 'mercadopago.com.ar' ||
      host.endsWith('.mercadopago.com.ar'))
  if (!permitido) throw new Error('provedor retornou URL fora da allowlist')
  return url.toString()
}

async function persistirAssinaturaCriada(
  db: Db,
  tentativa: typeof tentativasCheckout.$inferSelect,
  assinatura: AssinaturaExterna,
  agora: Date,
): Promise<string> {
  if (assinatura.referenciaExterna !== tentativa.referenciaExterna) {
    throw new Error('assinatura retornou referência divergente')
  }
  const url = urlCheckoutSegura(assinatura.urlCheckout)

  await db.transaction(async (tx) => {
    await tx
      .update(tentativasCheckout)
      .set({
        status: 'CRIADA',
        assinaturaExternaId: assinatura.id,
        urlCheckout: url,
        leaseExpiraEm: null,
        erroCodigo: null,
        atualizadoEm: agora,
      })
      .where(eq(tentativasCheckout.id, tentativa.id))

    await tx
      .insert(assinaturas)
      .values({
        usuarioId: tentativa.usuarioId,
        mercadopagoId: assinatura.id,
        referenciaExterna: tentativa.referenciaExterna,
        produto: tentativa.produto,
        status: assinatura.status.toUpperCase(),
        plano: assinatura.nomePlano,
        nivelDoPlano: tentativa.nivelDoPlano,
        modalidade: tentativa.modalidade,
        proximaCobranca: assinatura.proximaCobranca
          ? new Date(assinatura.proximaCobranca)
          : null,
        ocorridoEmOrigem: assinatura.ocorridoEm ? new Date(assinatura.ocorridoEm) : null,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: assinaturas.referenciaExterna,
        set: {
          mercadopagoId: assinatura.id,
          status: assinatura.status.toUpperCase(),
          plano: assinatura.nomePlano,
          nivelDoPlano: tentativa.nivelDoPlano,
          modalidade: tentativa.modalidade,
          proximaCobranca: assinatura.proximaCobranca
            ? new Date(assinatura.proximaCobranca)
            : null,
          ocorridoEmOrigem: assinatura.ocorridoEm ? new Date(assinatura.ocorridoEm) : null,
          atualizadoEm: agora,
        },
      })
  })
  return url
}

/**
 * A TEMPORADA NÃO ESPELHA CONTRATO AQUI.
 *
 * Preferência não é contrato: ninguém pagou. Uma linha em `assinaturas` neste
 * ponto faria a tela da conta anunciar assinatura para quem só abriu a página
 * do Mercado Pago e fechou. O contrato da temporada nasce no webhook, na
 * aprovação — e nasce com `mercadopago_id` nulo, porque não existe
 * `preapproval` correspondente (ruling R-B4).
 */
async function persistirPreferenciaCriada(
  db: Db,
  tentativa: typeof tentativasCheckout.$inferSelect,
  preferencia: PagamentoExterno,
  agora: Date,
): Promise<string> {
  if (preferencia.referenciaExterna !== tentativa.referenciaExterna) {
    throw new Error('preferência retornou referência divergente')
  }
  const url = urlCheckoutSegura(preferencia.urlCheckout)
  await db
    .update(tentativasCheckout)
    .set({
      status: 'CRIADA',
      assinaturaExternaId: preferencia.id,
      urlCheckout: url,
      leaseExpiraEm: null,
      erroCodigo: null,
      atualizadoEm: agora,
    })
    .where(eq(tentativasCheckout.id, tentativa.id))
  return url
}

export async function iniciarCheckout(
  db: Db,
  porta: PortaCobranca,
  config: ConfiguracaoProdutoPago,
  precos: PrecosDosPlanos,
  entrada: { usuarioId: string; sku: Sku; ip: string | null; agora: Date },
): Promise<ResultadoCheckout> {
  if (!config.checkoutHabilitado) throw new CheckoutIndisponivelError()
  if (
    await excedeuOperacoes(
      db,
      'CHECKOUT',
      entrada.usuarioId,
      entrada.agora,
      undefined,
      entrada.ip,
    )
  ) {
    throw new LimiteOperacaoError()
  }

  // A TELA É CONVENIÊNCIA; O PORTÃO É AQUI.
  //
  // "Não se compra abaixo do que já se tem" (decisão 12) morava só em
  // `/assinar`, que decide o que mostrar. Uma aba aberta quando a pessoa ainda
  // era GRATIS, ou um POST montado à mão, chegava neste ponto com um SKU que o
  // seletor nunca teria oferecido — e comprava o downgrade que a spec diz não
  // existir. A mesma função que monta o seletor decide aqui, então fecha para
  // QUALQUER chamador, hoje e amanhã.
  const acesso = await avaliarAcesso(db, entrada.usuarioId, entrada.agora)
  if (acesso.nivel === null) throw new CheckoutIndisponivelError()
  const ofertas = ofertasDisponiveis(acesso, entrada.agora, precos.fimDaTemporada)
  if (!ofertas.some((oferta) => oferta.sku === entrada.sku)) {
    throw new CheckoutIndisponivelError('plano indisponível para o acesso atual')
  }

  const reserva = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${usuarios} WHERE id = ${entrada.usuarioId} FOR UPDATE`)
    const [usuario] = await tx
      .select({ id: usuarios.id, email: usuarios.email, status: usuarios.status })
      .from(usuarios)
      .where(eq(usuarios.id, entrada.usuarioId))
      .limit(1)
    if (!usuario || usuario.status !== 'ATIVO') throw new CheckoutIndisponivelError()

    const [existente] = await tx
      .select()
      .from(tentativasCheckout)
      .where(
        and(
          eq(tentativasCheckout.usuarioId, usuario.id),
          eq(tentativasCheckout.produto, PRODUTO_PAGO),
          inArray(tentativasCheckout.status, STATUS_ABERTOS),
        ),
      )
      .orderBy(desc(tentativasCheckout.criadoEm))
      .limit(1)

    const { nivelDoPlano, modalidade } = composicaoDoSku(entrada.sku)

    // Uma criação EM VOO não é interrompida nem quando a pessoa muda de
    // ideia: o POST que está na rede vai voltar e gravar a URL. Encerrar a
    // tentativa agora deixaria duas abertas quando ele voltasse, e o índice
    // único parcial (uma tentativa aberta por usuário e produto) recusaria a
    // segunda. Trinta segundos e ela tenta de novo.
    if (
      existente?.status === 'CRIANDO' &&
      existente.leaseExpiraEm &&
      existente.leaseExpiraEm > entrada.agora
    ) {
      return { tentativa: existente, email: usuario.email, processando: true as const }
    }

    const mesmoSku =
      existente !== undefined &&
      existente.nivelDoPlano === nivelDoPlano &&
      existente.modalidade === modalidade

    // Trocar de SKU não reaproveita nada: a referência antiga já está no
    // provedor amarrada ao plano antigo, e devolver aquela URL cobraria o
    // plano que a pessoa acabou de descartar.
    if (existente && !mesmoSku) {
      await tx
        .update(tentativasCheckout)
        .set({ status: 'ENCERRADA', leaseExpiraEm: null, atualizadoEm: entrada.agora })
        .where(eq(tentativasCheckout.id, existente.id))
    }

    if (mesmoSku && existente!.status === 'CRIADA' && existente!.urlCheckout) {
      return { tentativa: existente!, email: usuario.email, pronta: true as const }
    }

    if (mesmoSku) {
      const [reservada] = await tx
        .update(tentativasCheckout)
        .set({
          status: 'CRIANDO',
          leaseExpiraEm: new Date(entrada.agora.getTime() + LEASE_CHECKOUT_MS),
          erroCodigo: null,
          atualizadoEm: entrada.agora,
        })
        .where(eq(tentativasCheckout.id, existente!.id))
        .returning()
      return { tentativa: reservada!, email: usuario.email, reconciliar: true as const }
    }

    const referencia = randomUUID()
    const [criada] = await tx
      .insert(tentativasCheckout)
      .values({
        usuarioId: usuario.id,
        produto: PRODUTO_PAGO,
        provedor: porta.nome,
        referenciaExterna: referencia,
        chaveIdempotencia: randomUUID(),
        nivelDoPlano,
        modalidade,
        status: 'CRIANDO',
        leaseExpiraEm: new Date(entrada.agora.getTime() + LEASE_CHECKOUT_MS),
        atualizadoEm: entrada.agora,
      })
      .returning()
    if (!criada) throw new Error('não foi possível reservar o checkout')
    return { tentativa: criada, email: usuario.email, reconciliar: false as const }
  })

  if ('pronta' in reserva) {
    // Reabrir a MESMA compra não é operação nova: quem volta do Mercado Pago
    // e clica "Assinar" de novo não pode gastar o limite (auditoria 23/09).
    return {
      status: 'PRONTO',
      url: urlCheckoutSegura(reserva.tentativa.urlCheckout),
      tentativaId: reserva.tentativa.id,
      reutilizada: true,
    }
  }
  if ('processando' in reserva) {
    return { status: 'PROCESSANDO', tentativaId: reserva.tentativa.id }
  }

  try {
    const preco = precos.porSku[entrada.sku]
    let url: string
    if (reserva.tentativa.modalidade === 'TEMPORADA') {
      // A chave de idempotência da tentativa É a retomada: repetir o POST com
      // ela devolve a preferência que já existe, em vez de abrir uma segunda
      // cobrança. Por isso a temporada não precisa de um `buscarPorReferencia`
      // como o `preapproval` precisa.
      const preferencia = await porta.criarPagamentoUnico({
        referenciaExterna: reserva.tentativa.referenciaExterna,
        chaveIdempotencia: reserva.tentativa.chaveIdempotencia,
        emailPagador: reserva.email,
        nomePlano: NOME_DO_SKU[entrada.sku],
        valorCentavos: preco.centavos,
        moeda: config.moeda,
        urlRetorno: urlDeRetorno(config),
      })
      url = await persistirPreferenciaCriada(db, reserva.tentativa, preferencia, entrada.agora)
    } else {
      let assinatura = reserva.reconciliar
        ? await porta.buscarPorReferencia(reserva.tentativa.referenciaExterna)
        : null
      if (!assinatura) {
        assinatura = await porta.criarAssinatura({
          referenciaExterna: reserva.tentativa.referenciaExterna,
          chaveIdempotencia: reserva.tentativa.chaveIdempotencia,
          emailPagador: reserva.email,
          nomePlano: NOME_DO_SKU[entrada.sku],
          valorCentavos: preco.centavos,
          moeda: config.moeda,
          frequencia: config.frequencia,
          tipoFrequencia: config.tipoFrequencia,
          urlRetorno: urlDeRetorno(config),
        })
      }
      url = await persistirAssinaturaCriada(db, reserva.tentativa, assinatura, entrada.agora)
    }
    await registrarOperacao(db, {
      operacao: 'CHECKOUT',
      identificador: entrada.usuarioId,
      ip: entrada.ip,
      sucesso: true,
      agora: entrada.agora,
    })
    return {
      status: 'PRONTO',
      url,
      tentativaId: reserva.tentativa.id,
      reutilizada: reserva.reconciliar,
    }
  } catch (erro) {
    await db
      .update(tentativasCheckout)
      .set({
        status: erro instanceof Error && erro.name === 'ErroMP' ? 'FALHA' : 'AMBIGUA',
        leaseExpiraEm: null,
        erroCodigo: erro instanceof Error ? erro.name : 'ErroDesconhecido',
        atualizadoEm: entrada.agora,
      })
      .where(eq(tentativasCheckout.id, reserva.tentativa.id))
    await registrarOperacao(db, {
      operacao: 'CHECKOUT',
      identificador: entrada.usuarioId,
      ip: entrada.ip,
      sucesso: false,
      agora: entrada.agora,
    })
    throw erro
  }
}

export async function cancelarAssinaturaDoUsuario(
  db: Db,
  porta: PortaCobranca,
  sessao: Sessao,
  entrada: { ip: string | null; agora: Date },
): Promise<void> {
  if (entrada.agora.getTime() - sessao.criadaEm.getTime() > JANELA_SESSAO_RECENTE_MS) {
    throw new SessaoRecenteObrigatoriaError()
  }
  if (
    await excedeuOperacoes(
      db,
      'CANCELAMENTO',
      sessao.usuarioId,
      entrada.agora,
      undefined,
      entrada.ip,
    )
  ) {
    throw new LimiteOperacaoError()
  }
  const tentativaOperacaoId = await registrarOperacao(db, {
    operacao: 'CANCELAMENTO',
    identificador: sessao.usuarioId,
    ip: entrada.ip,
    sucesso: false,
    agora: entrada.agora,
  })

  const [assinatura] = await db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.usuarioId, sessao.usuarioId))
    .orderBy(desc(assinaturas.atualizadoEm))
    .limit(1)
  if (!assinatura?.mercadopagoId) throw new Error('assinatura cancelável não encontrada')

  const externa = await porta.cancelarAssinatura(assinatura.mercadopagoId, randomUUID())
  if (externa.id !== assinatura.mercadopagoId) throw new Error('provedor retornou outra assinatura')

  await db
    .update(assinaturas)
    .set({
      status: externa.status.toUpperCase(),
      cancelamentoSolicitadoEm: entrada.agora,
      canceladaEm: entrada.agora,
      ocorridoEmOrigem: externa.ocorridoEm ? new Date(externa.ocorridoEm) : entrada.agora,
      atualizadoEm: entrada.agora,
    })
    .where(and(eq(assinaturas.id, assinatura.id), eq(assinaturas.usuarioId, sessao.usuarioId)))
  if (assinatura.referenciaExterna) {
    await db
      .update(tentativasCheckout)
      .set({ status: 'ENCERRADA', leaseExpiraEm: null, atualizadoEm: entrada.agora })
      .where(eq(tentativasCheckout.referenciaExterna, assinatura.referenciaExterna))
  }
  await db
    .update(tentativasOperacaoConta)
    .set({ sucesso: true })
    .where(eq(tentativasOperacaoConta.id, tentativaOperacaoId))
}
