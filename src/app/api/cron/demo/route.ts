import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { autossemeaduraHabilitada } from '@/modules/ingestao/demo/autossemeadura'
import { semearDemo } from '@/modules/ingestao/demo/semear'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * RE-SEED DIÁRIO DA DEMONSTRAÇÃO.
 *
 * A demo é ancorada num DIA: `semearDemo` monta a rodada da data de
 * referência de quando roda. Sem este cron, o cliente que abrisse no dia
 * seguinte encontraria "Sem jogos hoje" no Fire Live — foi o que aconteceu em
 * 25/08/2026.
 *
 * Ocupa um dos DOIS crons diários que o plano Hobby permite (ADR-0003, nota de
 * 25/08). Não existe no conjunto completo: conta Pro sincroniza dado real e
 * não semeia demonstração.
 *
 * Só roda com `DEMO_AUTOSSEMEADURA=true`. Sem a variável, responde 200 com
 * `executado: false` — pular não é falha, e um cron que grita todo dia vira
 * ruído que ninguém lê.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/demo',
    tarefa: async () => {
      if (!autossemeaduraHabilitada(process.env)) {
        return { executado: false, motivo: 'DEMO_AUTOSSEMEADURA_DESLIGADA' as const }
      }
      const ruleset = await rulesetAtivo()
      const resumo = await semearDemo(getDb(), ruleset, new Date())
      return { executado: true, resumo }
    },
    quantidade: (r) => ('resumo' in r && r.resumo ? r.resumo.itensListaSecreta : 0),
  })
}
