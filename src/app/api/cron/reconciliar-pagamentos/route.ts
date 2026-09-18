import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { reconciliarPagamentos } from '@/modules/plataforma/assinatura/reconciliacao'
import { cancelarContratosSubstituidos } from '@/modules/plataforma/assinatura/substituicao'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/reconciliar-pagamentos',
    tarefa: async () => {
      const config = configDoAmbiente()
      if (!config) throw new Error('MercadoPagoNaoConfigurado')
      const porta = new PagamentoMercadoPago(config)
      const { fuso } = (await rulesetAtivo()).rodada
      const precos = precosDosPlanos(fuso)
      const db = getDb()
      const conciliacao = await reconciliarPagamentos(
        db,
        porta,
        new Date(),
        precos?.fimDaTemporada ?? null,
      )
      // A rede de segurança do upgrade: o webhook marcou o contrato antigo
      // para cancelar e a chamada ao provedor pode ter falhado. Aqui ela
      // tenta de novo, com a mesma chave de idempotência.
      const substituicoes = await cancelarContratosSubstituidos(db, porta, new Date())
      return { ...conciliacao, substituicoesCanceladas: substituicoes.cancelados }
    },
    quantidade: (resultado) => resultado.eventos,
  })
}
