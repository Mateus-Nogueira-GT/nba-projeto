import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'

import { tentativasCheckout } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { AssinaturaExterna, CobrancaExterna, EventoPagamento, PortaCobranca } from './porta'
import { aplicarEventoPagamento } from './webhook'

const LEASE_RECONCILIACAO_MS = 60_000

function chaveEvento(partes: Array<string | null>): string {
  return `reconciliacao:${createHash('sha256').update(partes.join('|')).digest('base64url')}`
}

function eventoDaAssinatura(
  tentativa: typeof tentativasCheckout.$inferSelect,
  assinatura: AssinaturaExterna,
): EventoPagamento {
  const cancelada = assinatura.status === 'canceled' || assinatura.status === 'cancelled'
  return {
    eventoExternoId: chaveEvento([
      'assinatura',
      assinatura.id,
      assinatura.status,
      assinatura.ocorridoEm,
    ]),
    tipo: cancelada ? 'ASSINATURA_CANCELADA' : 'ASSINATURA_ATUALIZADA',
    referenciaExterna: tentativa.referenciaExterna,
    assinaturaExternaId: assinatura.id,
    cobrancaExternaId: null,
    recursoTipo: 'ASSINATURA',
    plano: assinatura.nomePlano,
    proximaCobranca: assinatura.proximaCobranca,
    ocorridoEm: assinatura.ocorridoEm,
    statusExterno: assinatura.status,
    bruto: { origem: 'RECONCILIACAO' },
  }
}

function eventoDaCobranca(
  tentativa: typeof tentativasCheckout.$inferSelect,
  assinatura: AssinaturaExterna,
  cobranca: CobrancaExterna,
): EventoPagamento {
  const tipo =
    cobranca.status === 'approved'
      ? 'PAGAMENTO_APROVADO'
      : cobranca.status === 'refunded'
        ? 'PAGAMENTO_ESTORNADO'
        : cobranca.status === 'charged_back'
          ? 'PAGAMENTO_CONTESTADO'
          : cobranca.status === 'rejected' ||
              cobranca.status === 'cancelled' ||
              cobranca.status === 'canceled'
            ? 'PAGAMENTO_RECUSADO'
            : 'OUTRO'
  return {
    eventoExternoId: chaveEvento([
      'cobranca',
      cobranca.id,
      cobranca.status,
      cobranca.ocorridoEm,
    ]),
    tipo,
    referenciaExterna: tentativa.referenciaExterna,
    assinaturaExternaId: cobranca.assinaturaExternaId ?? assinatura.id,
    cobrancaExternaId: cobranca.id,
    recursoTipo: 'COBRANCA',
    plano: assinatura.nomePlano,
    proximaCobranca: cobranca.proximaCobranca ?? assinatura.proximaCobranca,
    ocorridoEm: cobranca.ocorridoEm,
    valorCentavos: cobranca.valorCentavos,
    moeda: cobranca.moeda,
    statusExterno: cobranca.status,
    bruto: { origem: 'RECONCILIACAO' },
  }
}

/**
 * O evento que a temporada produz na reconciliação.
 *
 * Sem `assinaturaExternaId` e sem `proximaCobranca`: não há contrato
 * recorrente e não há próxima cobrança. É o webhook dizendo a mesma coisa que
 * o tópico `payment` diria, só que descoberto por varredura em vez de aviso.
 */
export function eventoDoPagamentoUnico(
  tentativa: typeof tentativasCheckout.$inferSelect,
  cobranca: CobrancaExterna,
): EventoPagamento {
  const tipo =
    cobranca.status === 'approved'
      ? 'PAGAMENTO_APROVADO'
      : cobranca.status === 'refunded'
        ? 'PAGAMENTO_ESTORNADO'
        : cobranca.status === 'charged_back'
          ? 'PAGAMENTO_CONTESTADO'
          : cobranca.status === 'rejected' ||
              cobranca.status === 'cancelled' ||
              cobranca.status === 'canceled'
            ? 'PAGAMENTO_RECUSADO'
            : 'OUTRO'
  return {
    eventoExternoId: chaveEvento(['pagamento-unico', cobranca.id, cobranca.status, cobranca.ocorridoEm]),
    tipo,
    referenciaExterna: tentativa.referenciaExterna,
    assinaturaExternaId: null,
    cobrancaExternaId: cobranca.id,
    recursoTipo: 'COBRANCA',
    plano: null,
    proximaCobranca: null,
    ocorridoEm: cobranca.ocorridoEm,
    valorCentavos: cobranca.valorCentavos,
    moeda: cobranca.moeda,
    statusExterno: cobranca.status,
    bruto: { origem: 'RECONCILIACAO' },
  }
}

async function reservarTentativa(
  db: Db,
  id: string,
  agora: Date,
): Promise<typeof tentativasCheckout.$inferSelect | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${tentativasCheckout} WHERE id = ${id} FOR UPDATE`)
    const [atual] = await tx
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.id, id))
      .limit(1)
    if (!atual) return null
    if (atual.leaseExpiraEm && atual.leaseExpiraEm > agora) return null

    const [reservada] = await tx
      .update(tentativasCheckout)
      .set({
        leaseExpiraEm: new Date(agora.getTime() + LEASE_RECONCILIACAO_MS),
        atualizadoEm: agora,
      })
      .where(eq(tentativasCheckout.id, id))
      .returning()
    return reservada ?? null
  })
}

export async function reconciliarPagamentos(
  db: Db,
  porta: PortaCobranca,
  agora = new Date(),
  fimDaTemporada: Date | null,
  limite = 50,
): Promise<{ examinadas: number; encontradas: number; eventos: number; falhas: number }> {
  const candidatas = await db
    .select({ id: tentativasCheckout.id })
    .from(tentativasCheckout)
    .where(
      and(
        inArray(tentativasCheckout.status, ['CRIANDO', 'AMBIGUA', 'CRIADA']),
        or(isNull(tentativasCheckout.leaseExpiraEm), lt(tentativasCheckout.leaseExpiraEm, agora)),
      ),
    )
    .orderBy(asc(tentativasCheckout.atualizadoEm))
    .limit(Math.min(Math.max(limite, 1), 100))

  const resultado = { examinadas: 0, encontradas: 0, eventos: 0, falhas: 0 }
  for (const candidata of candidatas) {
    const tentativa = await reservarTentativa(db, candidata.id, agora)
    if (!tentativa) continue
    resultado.examinadas += 1

    try {
      if (tentativa.modalidade === 'TEMPORADA') {
        // Pagamento único não tem `preapproval`: perguntar por ele em
        // `/preapproval/{id}` com o id da PREFERÊNCIA daria 404 a cada
        // rodada do cron. A busca é pela referência.
        const cobranca = await porta.buscarPagamentoPorReferencia(tentativa.referenciaExterna)
        if (!cobranca) {
          await db
            .update(tentativasCheckout)
            .set({ status: 'AMBIGUA', leaseExpiraEm: null, atualizadoEm: agora })
            .where(eq(tentativasCheckout.id, tentativa.id))
          continue
        }
        resultado.encontradas += 1
        const efeito = await aplicarEventoPagamento(
          db,
          porta.nome,
          eventoDoPagamentoUnico(tentativa, cobranca),
          agora,
          fimDaTemporada,
        )
        if (efeito.aceito && !efeito.duplicado) resultado.eventos += 1
        await db
          .update(tentativasCheckout)
          .set({ status: 'CRIADA', leaseExpiraEm: null, erroCodigo: null, atualizadoEm: agora })
          .where(eq(tentativasCheckout.id, tentativa.id))
        continue
      }

      const assinatura = tentativa.assinaturaExternaId
        ? await porta.consultarAssinatura(tentativa.assinaturaExternaId)
        : await porta.buscarPorReferencia(tentativa.referenciaExterna)
      if (!assinatura) {
        await db
          .update(tentativasCheckout)
          .set({ status: 'AMBIGUA', leaseExpiraEm: null, atualizadoEm: agora })
          .where(eq(tentativasCheckout.id, tentativa.id))
        continue
      }

      resultado.encontradas += 1
      const eventoAssinatura = eventoDaAssinatura(tentativa, assinatura)
      const aplicado = await aplicarEventoPagamento(
        db,
        porta.nome,
        eventoAssinatura,
        agora,
        fimDaTemporada,
      )
      if (aplicado.aceito && !aplicado.duplicado) resultado.eventos += 1

      for (const cobranca of await porta.listarCobrancasDaAssinatura(assinatura.id)) {
        const efeito = await aplicarEventoPagamento(
          db,
          porta.nome,
          eventoDaCobranca(tentativa, assinatura, cobranca),
          agora,
          fimDaTemporada,
        )
        if (efeito.aceito && !efeito.duplicado) resultado.eventos += 1
      }

      await db
        .update(tentativasCheckout)
        .set({
          status: 'CRIADA',
          assinaturaExternaId: assinatura.id,
          urlCheckout: assinatura.urlCheckout,
          leaseExpiraEm: null,
          erroCodigo: null,
          atualizadoEm: agora,
        })
        .where(eq(tentativasCheckout.id, tentativa.id))
    } catch (erro) {
      resultado.falhas += 1
      await db
        .update(tentativasCheckout)
        .set({
          status: 'AMBIGUA',
          leaseExpiraEm: null,
          erroCodigo: erro instanceof Error ? erro.name : 'ErroDesconhecido',
          atualizadoEm: agora,
        })
        .where(eq(tentativasCheckout.id, tentativa.id))
    }
  }

  return resultado
}
