import { eq } from 'drizzle-orm'

import { assinaturas, eventosPagamento, usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { EventoPagamento, PortaPagamento } from './porta'

export type ResultadoWebhook =
  | { aceito: false; motivo: 'assinatura-invalida' | 'ilegivel' }
  | { aceito: true; duplicado: true }
  | { aceito: true; duplicado: false; liberou: boolean; usuarioId: string | null }

/**
 * Processa uma notificação de pagamento, UMA vez.
 *
 * O Mercado Pago reenvia o mesmo evento — por retry, por instabilidade, ou
 * simplesmente porque a entrega é at-least-once. Reprocessar liberaria acesso
 * duas vezes e sujaria o relatório de assinaturas.
 *
 * A idempotência é do BANCO, não da aplicação: a UNIQUE
 * (provedor, evento_externo_id) é o que decide. Conflito aqui é caminho
 * esperado, não erro.
 */
export async function processarNotificacao(
  db: Db,
  porta: PortaPagamento,
  entrada: { corpoBruto: string; cabecalhos: Record<string, string>; agora: Date },
): Promise<ResultadoWebhook> {
  if (!porta.verificarAssinatura(entrada.corpoBruto, entrada.cabecalhos)) {
    return { aceito: false, motivo: 'assinatura-invalida' }
  }

  let corpo: unknown
  try {
    corpo = JSON.parse(entrada.corpoBruto)
  } catch {
    return { aceito: false, motivo: 'ilegivel' }
  }

  const evento = await porta.interpretarNotificacao(corpo, entrada.cabecalhos)
  if (evento === null) return { aceito: false, motivo: 'ilegivel' }

  // A trava de idempotência. Se nada voltou, este evento já foi processado.
  const gravado = await db
    .insert(eventosPagamento)
    .values({
      provedor: porta.nome,
      eventoExternoId: evento.eventoExternoId,
      tipo: evento.tipo,
      referenciaExterna: evento.referenciaExterna,
      cargaJson: evento.bruto as object,
      processadoEm: entrada.agora,
    })
    .onConflictDoNothing({
      target: [eventosPagamento.provedor, eventosPagamento.eventoExternoId],
    })
    .returning({ id: eventosPagamento.id })

  if (gravado.length === 0) return { aceito: true, duplicado: true }

  const efeito = await aplicarEfeito(db, evento, entrada.agora)
  return { aceito: true, duplicado: false, ...efeito }
}

async function aplicarEfeito(
  db: Db,
  evento: EventoPagamento,
  agora: Date,
): Promise<{ liberou: boolean; usuarioId: string | null }> {
  if (evento.referenciaExterna === null) return { liberou: false, usuarioId: null }

  // A referência externa é o id do usuário, gravado quando a cobrança nasceu.
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, evento.referenciaExterna))
    .limit(1)

  if (!usuario) return { liberou: false, usuarioId: null }

  const status =
    evento.tipo === 'PAGAMENTO_APROVADO'
      ? 'ATIVA'
      : evento.tipo === 'ASSINATURA_CANCELADA'
        ? 'CANCELADA'
        : 'PENDENTE'

  await db
    .insert(assinaturas)
    .values({
      usuarioId: usuario.id,
      mercadopagoId: evento.assinaturaExternaId,
      status,
      plano: evento.plano,
      inicio: evento.tipo === 'PAGAMENTO_APROVADO' ? agora : null,
      proximaCobranca: evento.proximaCobranca ? new Date(evento.proximaCobranca) : null,
      atualizadoEm: agora,
    })
    .onConflictDoUpdate({
      target: assinaturas.mercadopagoId,
      set: {
        status,
        plano: evento.plano,
        proximaCobranca: evento.proximaCobranca ? new Date(evento.proximaCobranca) : null,
        atualizadoEm: agora,
      },
    })

  // Pagamento confirmado libera o acesso automaticamente. O painel continua
  // podendo liberar ou bloquear na mão quando for preciso.
  if (evento.tipo === 'PAGAMENTO_APROVADO' && usuario.status === 'BLOQUEADO') {
    await db.update(usuarios).set({ status: 'ATIVO' }).where(eq(usuarios.id, usuario.id))
    return { liberou: true, usuarioId: usuario.id }
  }

  return { liberou: evento.tipo === 'PAGAMENTO_APROVADO', usuarioId: usuario.id }
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
    .limit(1)

  if (!linha) return null
  return {
    status: linha.status,
    plano: linha.plano,
    proximaCobranca: linha.proximaCobranca,
    atualizadoEm: linha.atualizadoEm,
  }
}
