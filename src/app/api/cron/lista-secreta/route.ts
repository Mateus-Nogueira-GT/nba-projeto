import { getDb } from '@/modules/dominio/db/cliente'
import { publicarListaSecreta } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

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
  const autorizacao = requisicao.headers.get('authorization')
  const segredo = process.env.CRON_SECRET

  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return new Response('não autorizado', { status: 401 })
  }

  const agora = new Date()
  const dataReferencia = agora.toISOString().slice(0, 10)

  const resultado = await publicarListaSecreta(getDb(), await rulesetAtivo(), {
    dataReferencia,
    agora,
  })

  return Response.json({ dataReferencia, ...resultado })
}
