import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'

import { assinaturas } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { PortaCobranca } from './porta'

/**
 * OS CONTRATOS QUE O UPGRADE SUBSTITUIU — a parte que fala com a rede.
 *
 * O webhook MARCA (`cancelamento_solicitado_em`) dentro da transação e sai. A
 * chamada ao provedor vem aqui, depois do commit: uma requisição HTTP dentro
 * da transação seguraria a conexão do banco pelo tempo do terceiro, e num
 * timeout dele a transação inteira cairia — inclusive o direito que a pessoa
 * acabou de pagar.
 *
 * Falhar aqui é seguro e retentável: a marca permanece, e o cron de
 * reconciliação chama esta mesma função de novo. Desistir é que não é — o
 * contrato antigo continuaria cobrando quem já trocou de plano.
 */
export async function cancelarContratosSubstituidos(
  db: Db,
  porta: PortaCobranca,
  agora: Date,
  // `usuarioId` estreita a varredura a UMA pessoa. Quem chama assim é o
  // webhook, que roda dentro da resposta ao provedor: varrer o lote inteiro
  // ali seria até 20 PUTs de rede na frente de um 200 que o Mercado Pago
  // espera. O cron não passa nada e continua varrendo todo mundo — é ele a
  // rede de segurança de quem falhou.
  opcoes: { usuarioId?: string | null; limite?: number } = {},
): Promise<{ cancelados: number; falhas: number }> {
  const limite = opcoes.limite ?? 20
  const pendentes = await db
    .select({ id: assinaturas.id, mercadopagoId: assinaturas.mercadopagoId })
    .from(assinaturas)
    .where(
      and(
        isNotNull(assinaturas.cancelamentoSolicitadoEm),
        isNull(assinaturas.canceladaEm),
        isNotNull(assinaturas.mercadopagoId),
        opcoes.usuarioId ? eq(assinaturas.usuarioId, opcoes.usuarioId) : undefined,
      ),
    )
    // O MAIS ANTIGO PRIMEIRO. Sem `orderBy`, o Postgres devolve um conjunto
    // arbitrário: acima de 20 marcados, um contrato que o provedor recusa em
    // definitivo poderia voltar a cada varredura e monopolizar o lote, deixando
    // outra pessoa sendo cobrada por um plano que ela já trocou — para sempre,
    // e sem ninguém nunca chegar nela.
    .orderBy(asc(assinaturas.cancelamentoSolicitadoEm))
    .limit(Math.min(Math.max(limite, 1), 100))

  const resultado = { cancelados: 0, falhas: 0 }
  for (const pendente of pendentes) {
    if (!pendente.mercadopagoId) continue
    try {
      // A chave de idempotência é DERIVADA do id do contrato, não aleatória:
      // esta varredura repete até conseguir, e uma chave nova a cada volta
      // faria o provedor tratar cada retentativa como operação diferente.
      const externa = await porta.cancelarAssinatura(
        pendente.mercadopagoId,
        `cancelar-${pendente.id}`,
      )
      const doProvedor = externa.ocorridoEm ? new Date(externa.ocorridoEm) : null
      const quando = doProvedor && Number.isFinite(doProvedor.getTime()) ? doProvedor : agora
      await db
        .update(assinaturas)
        .set({
          // 'CANCELADA', em português, como o webhook grava — e não o
          // `status` cru do provedor ('canceled'/'cancelled'). É o MESMO campo
          // e é essa string que a tela da conta mostra ao assinante: deixar o
          // inglês passar é a NIP falando duas línguas sobre o mesmo contrato,
          // na frente de quem paga.
          status: 'CANCELADA',
          canceladaEm: quando,
          ocorridoEmOrigem: quando,
          atualizadoEm: agora,
        })
        .where(eq(assinaturas.id, pendente.id))
      resultado.cancelados += 1
    } catch (erro) {
      // SEM ESTE LOG, cobrança indevida continuada não aparece em lugar
      // nenhum: o contrato fica marcado, a varredura tenta de novo em silêncio
      // e um ex-assinante segue sendo debitado no cartão depois do upgrade sem
      // que ninguém na operação tenha como saber. Id do contrato e nome do
      // erro — nunca token, nunca dado de cartão.
      console.warn(
        JSON.stringify({
          evento: 'contrato_substituido_nao_cancelado',
          assinaturaId: pendente.id,
          erro: erro instanceof Error ? erro.name : 'ErroDesconhecido',
        }),
      )
      resultado.falhas += 1
    }
  }
  return resultado
}
