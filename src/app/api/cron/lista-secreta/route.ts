import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { publicarListaSecreta } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dataDeReferencia } from '@/modules/dominio/rodada'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron da Lista Secreta.
 *
 * O Vercel Cron só aceita expressão fixa, e "1h antes do primeiro jogo" é
 * horário móvel — muda a cada dia. Por isso o cron bate de 15 em 15 minutos e
 * QUEM decide é o job: enquanto faltar mais de uma hora, ele devolve
 * "ainda-cedo" e não escreve nada.
 *
 * O mesmo caminho serve ao reprocessamento: se a escalação mudou, o hash muda
 * e o snapshot é regravado; se não mudou, nada acontece.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/lista-secreta',
    tarefa: async () => {
      const agora = new Date()
      const ruleset = await rulesetAtivo()
      const dataReferencia = dataDeReferencia(agora, ruleset.rodada.fuso)

      const resultado = await publicarListaSecreta(getDb(), ruleset, {
        dataReferencia,
        agora,
      })

      return { dataReferencia, ...resultado }
    },
    quantidade: (resultado) => (resultado.publicou ? 1 : 0),
  })
}
