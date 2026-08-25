import { and, desc, eq, isNull } from 'drizzle-orm'

import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { PRODUTO_PAGO } from './configuracao'
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

async function usuarioDoEvento(db: Db, referencia: string | null): Promise<string | null> {
  if (!referencia) return null

  const [tentativa] = await db
    .select({ usuarioId: tentativasCheckout.usuarioId })
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.referenciaExterna, referencia))
    .limit(1)
  if (tentativa) return tentativa.usuarioId

  // Compatibilidade de migração: eventos legados usavam UUID do usuário.
  // O checkout novo jamais cria esse formato e usa apenas a referência opaca.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referencia)) {
    return null
  }
  const [legado] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, referencia))
    .limit(1)
  return legado?.id ?? null
}

async function assinaturaDoEvento(
  db: Db,
  evento: EventoPagamento,
  usuarioId: string,
  agora: Date,
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
  const proximaCobranca = dataDoProvedor(evento.proximaCobranca)
  const inicio = evento.tipo === 'PAGAMENTO_APROVADO' ? ocorridoEm : (existente?.inicio ?? null)

  if (existente) {
    const [atualizada] = await db
      .update(assinaturas)
      .set({
        usuarioId,
        mercadopagoId: evento.assinaturaExternaId ?? existente.mercadopagoId,
        referenciaExterna: evento.referenciaExterna ?? existente.referenciaExterna,
        produto: existente.produto || PRODUTO_PAGO,
        status,
        plano: evento.plano ?? existente.plano,
        inicio,
        proximaCobranca: proximaCobranca ?? existente.proximaCobranca,
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
      usuarioId,
      mercadopagoId: evento.assinaturaExternaId,
      referenciaExterna: evento.referenciaExterna,
      produto: PRODUTO_PAGO,
      status,
      plano: evento.plano,
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

async function aplicarEfeito(
  db: Db,
  provedor: string,
  evento: EventoPagamento,
  agora: Date,
): Promise<{ liberou: boolean; usuarioId: string | null }> {
  const usuarioId = await usuarioDoEvento(db, evento.referenciaExterna)
  if (!usuarioId) return { liberou: false, usuarioId: null }

  const assinatura = await assinaturaDoEvento(db, evento, usuarioId, agora)

  if (evento.referenciaExterna && (assinatura.aplicou || evento.tipo.startsWith('PAGAMENTO_'))) {
    await db
      .update(tentativasCheckout)
      .set({
        status: evento.tipo === 'ASSINATURA_CANCELADA' ? 'ENCERRADA' : 'CRIADA',
        assinaturaExternaId: evento.assinaturaExternaId,
        leaseExpiraEm: null,
        erroCodigo: null,
        atualizadoEm: agora,
      })
      .where(eq(tentativasCheckout.referenciaExterna, evento.referenciaExterna))
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
    const fim = dataDoProvedor(evento.proximaCobranca)
    // Sem limite futuro demonstrável, a confirmação financeira fica registrada,
    // mas não autoriza conteúdo indefinidamente.
    if (!fim || fim <= inicio) return { liberou: false, usuarioId }

    await db
      .insert(direitosAcesso)
      .values({
        usuarioId,
        produto: PRODUTO_PAGO,
        origem: provedor,
        referenciaOrigem: cobrancaId,
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
          revogadoEm: null,
          motivoRevogacao: null,
          atualizadoEm: agora,
        },
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
): Promise<ResultadoWebhook> {
  return db.transaction(async (tx) => {
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
    const efeito = await aplicarEfeito(tx, provedor, evento, agora)
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

  const resultado = await aplicarEventoPagamento(db, porta.nome, evento, entrada.agora)
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
