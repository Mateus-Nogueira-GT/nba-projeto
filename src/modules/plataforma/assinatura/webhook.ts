import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { PRODUTO_PAGO } from './configuracao'
import type { Modalidade, NivelDoPlano, NivelPago } from './nivel-do-plano'
import { atende, NIVEIS_PAGOS } from './nivel-do-plano'
import type { EventoPagamento, PortaPagamento } from './porta'

export type ResultadoWebhook =
  | { aceito: false; motivo: 'assinatura-invalida' | 'ilegivel' }
  | { aceito: true; duplicado: true }
  | { aceito: true; duplicado: false; liberou: boolean; usuarioId: string | null }

function dataValida(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isFinite(data.getTime()) ? data : null
}

function dataDoProvedor(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const data = dataValida(valor)
  if (!data) throw new Error('provedor retornou data inválida')
  return data
}

function cargaSanitizada(evento: EventoPagamento): object {
  return {
    tipo: evento.tipo,
    referenciaExterna: evento.referenciaExterna,
    assinaturaExternaId: evento.assinaturaExternaId,
    cobrancaExternaId: evento.cobrancaExternaId ?? null,
    recursoTipo: evento.recursoTipo ?? null,
    statusExterno: evento.statusExterno ?? null,
    ocorridoEm: evento.ocorridoEm ?? null,
    valorCentavos: evento.valorCentavos ?? null,
    moeda: evento.moeda ?? null,
  }
}

/**
 * DE QUEM É A COMPRA E O QUE FOI COMPRADO — a mesma consulta.
 *
 * A `tentativas_checkout` é o único elo entre o dinheiro e a NIP: o provedor
 * devolve a referência opaca, e é ela que diz o usuário, o nível e a
 * modalidade. Sem tentativa não há compra desta instalação — o evento fica
 * registrado em `eventos_pagamento` para auditoria e não concede nada.
 *
 * O caminho de compatibilidade que resolvia o usuário quando a referência era
 * o UUID dele saiu daqui: ele não sabe QUAL plano foi pago, e as colunas de
 * nível são NOT NULL. Conceder por ali exigiria inventar um nível, que é
 * exatamente o que a regra 3 do CLAUDE.md proíbe. Em produção o checkout
 * nunca esteve ligado, então nenhuma referência desse formato existe.
 */
async function compraDoEvento(
  db: Db,
  referencia: string | null,
): Promise<{ usuarioId: string; nivelDoPlano: NivelPago; modalidade: Modalidade } | null> {
  if (!referencia) return null
  const [tentativa] = await db
    .select({
      usuarioId: tentativasCheckout.usuarioId,
      nivelDoPlano: tentativasCheckout.nivelDoPlano,
      modalidade: tentativasCheckout.modalidade,
    })
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.referenciaExterna, referencia))
    .limit(1)
  if (!tentativa) return null
  // `as` é a fronteira entre `text` no banco e o tipo do domínio; os checks
  // da migration 0028 garantem que só estes valores existem nas colunas.
  return {
    usuarioId: tentativa.usuarioId,
    nivelDoPlano: tentativa.nivelDoPlano as NivelPago,
    modalidade: tentativa.modalidade as Modalidade,
  }
}

async function assinaturaDoEvento(
  db: Db,
  evento: EventoPagamento,
  compra: { usuarioId: string; nivelDoPlano: NivelPago; modalidade: Modalidade },
  agora: Date,
  fimDaTemporada: Date | null,
): Promise<{ id: string; aplicou: boolean }> {
  const ocorridoEm = dataDoProvedor(evento.ocorridoEm) ?? agora
  let existente: typeof assinaturas.$inferSelect | undefined
  if (evento.assinaturaExternaId) {
    ;[existente] = await db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, evento.assinaturaExternaId))
      .limit(1)
  }
  if (!existente && evento.referenciaExterna) {
    ;[existente] = await db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.referenciaExterna, evento.referenciaExterna))
      .limit(1)
  }

  if (
    existente?.ocorridoEmOrigem &&
    existente.ocorridoEmOrigem.getTime() >= ocorridoEm.getTime()
  ) {
    return { id: existente.id, aplicou: false }
  }

  const status =
    evento.tipo === 'PAGAMENTO_APROVADO'
      ? 'ATIVA'
      : evento.tipo === 'ASSINATURA_CANCELADA'
        ? 'CANCELADA'
        : (evento.statusExterno ?? existente?.status ?? 'PENDENTE').toUpperCase()
  const ehTemporada = compra.modalidade === 'TEMPORADA'
  // Temporada não tem próxima cobrança — é o que a conta lê para mostrar
  // "acesso até" em vez de uma contagem regressiva que nunca chegaria.
  const proximaCobranca = ehTemporada ? null : dataDoProvedor(evento.proximaCobranca)
  const inicio = evento.tipo === 'PAGAMENTO_APROVADO' ? ocorridoEm : (existente?.inicio ?? null)

  if (existente) {
    const [atualizada] = await db
      .update(assinaturas)
      .set({
        usuarioId: compra.usuarioId,
        mercadopagoId: evento.assinaturaExternaId ?? existente.mercadopagoId,
        referenciaExterna: evento.referenciaExterna ?? existente.referenciaExterna,
        produto: existente.produto || PRODUTO_PAGO,
        status,
        plano: evento.plano ?? existente.plano,
        // O SKU também no conflito: era o defeito registrado no Plano A — o
        // nível era atualizado e a modalidade não, o que com dois SKUs
        // deixaria um contrato de temporada se dizendo mensal.
        nivelDoPlano: compra.nivelDoPlano,
        modalidade: compra.modalidade,
        inicio,
        fim: ehTemporada ? fimDaTemporada : existente.fim,
        proximaCobranca: ehTemporada ? null : (proximaCobranca ?? existente.proximaCobranca),
        ocorridoEmOrigem: ocorridoEm,
        canceladaEm:
          evento.tipo === 'ASSINATURA_CANCELADA' ? ocorridoEm : existente.canceladaEm,
        atualizadoEm: agora,
      })
      .where(eq(assinaturas.id, existente.id))
      .returning({ id: assinaturas.id })
    if (!atualizada) throw new Error('assinatura desapareceu durante atualização')
    return { id: atualizada.id, aplicou: true }
  }

  const [criada] = await db
    .insert(assinaturas)
    .values({
      usuarioId: compra.usuarioId,
      mercadopagoId: evento.assinaturaExternaId,
      referenciaExterna: evento.referenciaExterna,
      produto: PRODUTO_PAGO,
      status,
      plano: evento.plano,
      nivelDoPlano: compra.nivelDoPlano,
      modalidade: compra.modalidade,
      fim: ehTemporada ? fimDaTemporada : null,
      inicio,
      proximaCobranca,
      ocorridoEmOrigem: ocorridoEm,
      canceladaEm: evento.tipo === 'ASSINATURA_CANCELADA' ? ocorridoEm : null,
      atualizadoEm: agora,
    })
    .returning({ id: assinaturas.id })
  if (!criada) throw new Error('não foi possível espelhar a assinatura')
  return { id: criada.id, aplicou: true }
}

/**
 * O UPGRADE (spec §9, decisão 12) — NESTA ORDEM, nunca na outra.
 *
 * O direito novo já existe quando esta função roda. Só então o anterior é
 * revogado: entre os dois instantes valem os dois, e `avaliarAcesso` devolve
 * o MAIOR (decisão 3). Revogar primeiro abriria uma janela — curta, mas real
 * — em que quem acabou de pagar mais veria menos.
 *
 * Sem devolução do período restante: é o que a tela de compra avisa antes de
 * cobrar (spec §9, confirmado pelo parceiro em 16/09).
 */
async function substituirDireitosAnteriores(
  db: Db,
  entrada: {
    usuarioId: string
    novoDireitoId: string
    nivelDoPlano: NivelPago
    modalidade: Modalidade
    assinaturaId: string
    agora: Date
  },
): Promise<void> {
  const anteriores = await db
    .select({
      id: direitosAcesso.id,
      nivelDoPlano: direitosAcesso.nivelDoPlano,
      modalidade: direitosAcesso.modalidade,
      origem: direitosAcesso.origem,
    })
    .from(direitosAcesso)
    .where(
      and(
        eq(direitosAcesso.usuarioId, entrada.usuarioId),
        eq(direitosAcesso.produto, PRODUTO_PAGO),
        isNull(direitosAcesso.revogadoEm),
        ne(direitosAcesso.id, entrada.novoDireitoId),
      ),
    )

  for (const anterior of anteriores) {
    // Cortesia é concessão ADMINISTRATIVA — quem concedeu é quem tira, pelo
    // painel, com motivo. Uma compra nunca revoga: cortesia sem `fim` é o
    // piso para o qual a pessoa volta ao cancelar, e destruí-la em silêncio
    // deixaria quem tinha acesso indefinido sem NADA depois de um cancelamento.
    if (anterior.origem === 'CORTESIA_ADMIN') continue
    // Só o que o novo COBRE. Uma cortesia All Star não morre porque a pessoa
    // comprou MVP: ela ficaria com MENOS do que tinha, e downgrade não existe.
    if (!atende(entrada.nivelDoPlano, anterior.nivelDoPlano as NivelDoPlano)) continue
    // Mesmo nível E mesma modalidade não é upgrade, é renovação — a cobrança
    // do mês seguinte do MESMO plano. `motivo_revogacao` é dado de auditoria;
    // gravar 'UPGRADE' numa renovação mente pro suporte que vier investigar
    // o histórico depois. O direito antigo não precisa de ajuda para sumir:
    // ele já vence no próprio `fim`, e `avaliarAcesso` sempre devolve o MAIOR.
    if (
      anterior.nivelDoPlano === entrada.nivelDoPlano &&
      anterior.modalidade === entrada.modalidade
    ) {
      continue
    }
    await db
      .update(direitosAcesso)
      .set({ revogadoEm: entrada.agora, motivoRevogacao: 'UPGRADE', atualizadoEm: entrada.agora })
      .where(eq(direitosAcesso.id, anterior.id))
  }

  // O contrato MENSAL substituído para de cobrar. Aqui só a MARCA: a chamada
  // ao provedor é rede e sai da transação (`cancelarContratosSubstituidos`).
  // A renovação do PRÓPRIO contrato não se marca — é o `ne(id, assinaturaId)`.
  //
  // E só o que o novo direito COBRE — o MESMO critério do laço acima, pelo
  // mesmo motivo. Cancelar um contrato All Star porque chegou uma compra de
  // MVP deixaria a pessoa com o direito All Star intacto (o laço acima não o
  // revoga) e o contrato dele morto no provedor: na virada do período ela
  // cairia de nível sem nunca ter pedido — o downgrade que a decisão 12 diz
  // não existir.
  const niveisCobertos = NIVEIS_PAGOS.filter((nivelDoPlano) =>
    atende(entrada.nivelDoPlano, nivelDoPlano),
  )
  await db
    .update(assinaturas)
    .set({ cancelamentoSolicitadoEm: entrada.agora, atualizadoEm: entrada.agora })
    .where(
      and(
        eq(assinaturas.usuarioId, entrada.usuarioId),
        ne(assinaturas.id, entrada.assinaturaId),
        eq(assinaturas.modalidade, 'MENSAL'),
        inArray(assinaturas.nivelDoPlano, niveisCobertos),
        isNotNull(assinaturas.mercadopagoId),
        isNull(assinaturas.canceladaEm),
        isNull(assinaturas.cancelamentoSolicitadoEm),
      ),
    )
}

async function aplicarEfeito(
  db: Db,
  provedor: string,
  evento: EventoPagamento,
  agora: Date,
  fimDaTemporada: Date | null,
): Promise<{ liberou: boolean; usuarioId: string | null }> {
  const compra = await compraDoEvento(db, evento.referenciaExterna)
  if (!compra) return { liberou: false, usuarioId: null }
  const usuarioId = compra.usuarioId

  const assinatura = await assinaturaDoEvento(db, evento, compra, agora, fimDaTemporada)

  if (evento.referenciaExterna && (assinatura.aplicou || evento.tipo.startsWith('PAGAMENTO_'))) {
    // TENTATIVA ENCERRADA FICA ENCERRADA — e o pagamento dela continua valendo.
    //
    // Trocar de SKU na tela encerra a tentativa antiga (`checkout.ts`) e abre
    // outra, mas a cobrança antiga segue viva e PAGÁVEL no provedor. Sem este
    // `ne`, pagar a antiga tentaria reabri-la como 'CRIADA' e bateria no
    // índice `tentativas_checkout_aberta_unica` — uma aberta por usuário e
    // produto. Como tudo roda na MESMA transação, o rollback levaria junto a
    // cobrança, o contrato e o direito que a pessoa acabou de comprar, e o
    // webhook responderia 500 para sempre, a cada retentativa do provedor.
    // Não reabrir não tira nada de ninguém: quem pagou recebe o direito logo
    // abaixo, com o nível gravado NA tentativa encerrada — que é o que foi
    // vendido naquela cobrança.
    await db
      .update(tentativasCheckout)
      .set({
        status: evento.tipo === 'ASSINATURA_CANCELADA' ? 'ENCERRADA' : 'CRIADA',
        assinaturaExternaId: evento.assinaturaExternaId,
        leaseExpiraEm: null,
        erroCodigo: null,
        atualizadoEm: agora,
      })
      .where(
        and(
          eq(tentativasCheckout.referenciaExterna, evento.referenciaExterna),
          ne(tentativasCheckout.status, 'ENCERRADA'),
        ),
      )
  }

  const ehEventoDeCobranca = evento.tipo.startsWith('PAGAMENTO_')
  const cobrancaId = evento.cobrancaExternaId ?? (ehEventoDeCobranca ? evento.eventoExternoId : null)
  let cobrancaAplicada = false
  if ((evento.recursoTipo === 'COBRANCA' || ehEventoDeCobranca) && cobrancaId) {
    const ocorridoEm = dataDoProvedor(evento.ocorridoEm) ?? agora
    const [existente] = await db
      .select()
      .from(cobrancas)
      .where(
        and(eq(cobrancas.provedor, provedor), eq(cobrancas.cobrancaExternaId, cobrancaId)),
      )
      .limit(1)

    if (!existente?.ocorridoEmOrigem || existente.ocorridoEmOrigem < ocorridoEm) {
      await db
        .insert(cobrancas)
        .values({
          usuarioId,
          assinaturaId: assinatura.id,
          provedor,
          cobrancaExternaId: cobrancaId,
          status: evento.statusExterno ?? evento.tipo,
          valorCentavos: evento.valorCentavos ?? null,
          moeda: evento.moeda ?? null,
          aprovadoEm: evento.tipo === 'PAGAMENTO_APROVADO' ? ocorridoEm : null,
          ocorridoEmOrigem: ocorridoEm,
          atualizadoEm: agora,
        })
        .onConflictDoUpdate({
          target: [cobrancas.provedor, cobrancas.cobrancaExternaId],
          set: {
            status: evento.statusExterno ?? evento.tipo,
            valorCentavos: evento.valorCentavos ?? null,
            moeda: evento.moeda ?? null,
            aprovadoEm: evento.tipo === 'PAGAMENTO_APROVADO' ? ocorridoEm : existente?.aprovadoEm,
            ocorridoEmOrigem: ocorridoEm,
            atualizadoEm: agora,
          },
        })
      cobrancaAplicada = true
    }
  }

  if (evento.tipo === 'PAGAMENTO_APROVADO' && cobrancaId && cobrancaAplicada) {
    const inicio = dataDoProvedor(evento.ocorridoEm) ?? agora
    // Mensal vale até a próxima cobrança, que o provedor informa. Temporada
    // vale até a data vendida, que o provedor NÃO tem como saber: é contrato
    // da NIP, não do Mercado Pago.
    const fim =
      compra.modalidade === 'TEMPORADA' ? fimDaTemporada : dataDoProvedor(evento.proximaCobranca)
    // Sem limite futuro demonstrável, a confirmação financeira fica registrada,
    // mas não autoriza conteúdo indefinidamente.
    if (!fim || fim <= inicio) {
      // O COMPORTAMENTO não muda — conceder um direito já vencido seria pior,
      // e estorno de temporada é manual (spec §9). O que muda é deixar de ser
      // INVISÍVEL: a cobrança já foi gravada, a reconciliação não reaplica
      // (mesmo `ocorridoEm`), e sem este aviso ninguém na operação saberia que
      // existe alguém que pagou e não recebeu. Dois caminhos chegam aqui de
      // verdade: boleto ou Pix de temporada aprovado depois de `TEMPORADA_FIM`,
      // e `TEMPORADA_FIM` ausente do ambiente. Nada de cartão, nada de token.
      console.warn(
        JSON.stringify({
          evento: 'pagamento_aprovado_sem_direito',
          usuarioId,
          cobrancaExternaId: cobrancaId,
          modalidade: compra.modalidade,
          inicio: inicio.toISOString(),
          fim: fim ? fim.toISOString() : null,
        }),
      )
      return { liberou: false, usuarioId }
    }

    const [novo] = await db
      .insert(direitosAcesso)
      .values({
        usuarioId,
        produto: PRODUTO_PAGO,
        origem: provedor,
        referenciaOrigem: cobrancaId,
        nivelDoPlano: compra.nivelDoPlano,
        modalidade: compra.modalidade,
        inicio,
        fim,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [direitosAcesso.origem, direitosAcesso.referenciaOrigem, direitosAcesso.produto],
        set: {
          usuarioId,
          inicio,
          fim,
          nivelDoPlano: compra.nivelDoPlano,
          modalidade: compra.modalidade,
          revogadoEm: null,
          motivoRevogacao: null,
          atualizadoEm: agora,
        },
      })
      .returning({ id: direitosAcesso.id })
    if (!novo) throw new Error('não foi possível registrar o direito')
    await substituirDireitosAnteriores(db, {
      usuarioId,
      novoDireitoId: novo.id,
      nivelDoPlano: compra.nivelDoPlano,
      modalidade: compra.modalidade,
      assinaturaId: assinatura.id,
      agora,
    })
    return { liberou: true, usuarioId }
  }

  if (
    (evento.tipo === 'PAGAMENTO_ESTORNADO' || evento.tipo === 'PAGAMENTO_CONTESTADO') &&
    cobrancaId &&
    cobrancaAplicada
  ) {
    await db
      .update(direitosAcesso)
      .set({
        revogadoEm: agora,
        motivoRevogacao: evento.tipo,
        atualizadoEm: agora,
      })
      .where(
        and(
          eq(direitosAcesso.origem, provedor),
          eq(direitosAcesso.referenciaOrigem, cobrancaId),
          isNull(direitosAcesso.revogadoEm),
        ),
      )
  }

  // Cancelamento encerra cobranças futuras, mas preserva o período já pago.
  // Recusa não remove um direito anterior antes da validade gravada.
  return { liberou: false, usuarioId }
}

export async function aplicarEventoPagamento(
  db: Db,
  provedor: string,
  evento: EventoPagamento,
  agora: Date,
  fimDaTemporada: Date | null,
): Promise<ResultadoWebhook> {
  return db.transaction(async (tx) => {
    // SERIALIZA os eventos do MESMO pagamento. No primeiro evento de uma
    // temporada não existe linha em `assinaturas`: duas notificações
    // simultâneas (payment.created + payment.updated, ou webhook +
    // reconciliação) passavam as duas pelo SELECT e a segunda estourava a
    // UNIQUE de `referencia_externa` — 500 no webhook (auditoria 23/09).
    const chaveDaTrava = evento.referenciaExterna ?? evento.assinaturaExternaId
    if (chaveDaTrava) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pagamento:${chaveDaTrava}`}))`)
    }
    const ocorridoEmOrigem = dataDoProvedor(evento.ocorridoEm)
    const gravado = await tx
      .insert(eventosPagamento)
      .values({
        provedor,
        eventoExternoId: evento.eventoExternoId,
        tipo: evento.tipo,
        referenciaExterna: evento.referenciaExterna,
        recursoTipo: evento.recursoTipo ?? null,
        recursoExternoId: evento.cobrancaExternaId ?? evento.assinaturaExternaId,
        ocorridoEmOrigem,
        cargaJson: cargaSanitizada(evento),
        processadoEm: agora,
      })
      .onConflictDoNothing({
        target: [eventosPagamento.provedor, eventosPagamento.eventoExternoId],
      })
      .returning({ id: eventosPagamento.id })

    if (gravado.length === 0) return { aceito: true, duplicado: true } as const
    const efeito = await aplicarEfeito(tx, provedor, evento, agora, fimDaTemporada)
    return { aceito: true, duplicado: false, ...efeito } as const
  })
}

export async function processarNotificacao(
  db: Db,
  porta: PortaPagamento,
  entrada: {
    corpoBruto: string
    cabecalhos: Record<string, string>
    parametros?: Record<string, string>
    agora: Date
    fimDaTemporada: Date | null
  },
): Promise<ResultadoWebhook> {
  const inicio = Date.now()
  const aviso = {
    corpoBruto: entrada.corpoBruto,
    cabecalhos: entrada.cabecalhos,
    parametros: entrada.parametros ?? {},
    agora: entrada.agora,
  }

  if (!porta.verificarAssinatura(aviso)) {
    console.warn(
      JSON.stringify({
        evento: 'webhook_pagamento_recusado',
        provedor: porta.nome,
        motivo: 'ASSINATURA_INVALIDA',
        duracaoMs: Date.now() - inicio,
      }),
    )
    return { aceito: false, motivo: 'assinatura-invalida' }
  }

  let corpo: unknown
  try {
    corpo = JSON.parse(entrada.corpoBruto)
  } catch {
    return { aceito: false, motivo: 'ilegivel' }
  }

  const evento = await porta.interpretarNotificacao(corpo, aviso)
  if (!evento) return { aceito: false, motivo: 'ilegivel' }

  const resultado = await aplicarEventoPagamento(
    db,
    porta.nome,
    evento,
    entrada.agora,
    entrada.fimDaTemporada,
  )
  console.info(
    JSON.stringify({
      evento: 'webhook_pagamento_processado',
      provedor: porta.nome,
      recursoTipo: evento.recursoTipo ?? null,
      duplicado: resultado.aceito && resultado.duplicado,
      duracaoMs: Date.now() - inicio,
    }),
  )
  return resultado
}

export type SituacaoAssinatura = {
  status: string
  plano: string | null
  proximaCobranca: Date | null
  atualizadoEm: Date
} | null

export async function situacaoDaAssinatura(db: Db, usuarioId: string): Promise<SituacaoAssinatura> {
  const [linha] = await db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.usuarioId, usuarioId))
    .orderBy(desc(assinaturas.atualizadoEm))
    .limit(1)

  return linha
    ? {
        status: linha.status,
        plano: linha.plano,
        proximaCobranca: linha.proximaCobranca,
        atualizadoEm: linha.atualizadoEm,
      }
    : null
}
