import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { limparRegistrosVencidos } from '@/modules/plataforma/limpeza'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Limpeza semanal (W2-6, parte 2). `tentativas_login`, `tentativas_operacao_conta`,
 * `sessoes` e `push_inscricoes` só crescem — nada nelas expira sozinho. Roda
 * segunda 08:00 UTC, fora da janela de jogos, e só no conjunto Pro de crons
 * (`vercel.ts`). `eventos_conta` e as tabelas de auditoria não são tocadas —
 * ver `limparRegistrosVencidos`.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/limpeza',
    tarefa: () => limparRegistrosVencidos(getDb(), new Date()),
    quantidade: (r) => r.sessoes + r.tentativasLogin + r.tentativasOperacao + r.inscricoesInvalidadas,
  })
}
