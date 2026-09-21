'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { usuarios } from '@/modules/dominio/db/schema'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

import { paraOndeVoltar } from './destino'

/**
 * O "OK, CONCORDO" da metodologia.
 *
 * Grava a DATA do aceite (a coluna é timestamp, não booleano: "concordo" é
 * registro) e devolve a pessoa ao lugar que ela pediu antes de ser
 * interceptada.
 *
 * `destinoInternoSeguro` é o mesmo do login: destino que vem por URL é entrada
 * de usuário, e redirecionar para fora do app seria um open redirect.
 */
export async function aceitarMetodologia(dados: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar')

  await getDb()
    .update(usuarios)
    .set({ metodologiaAceitaEm: new Date() })
    .where(eq(usuarios.id, sessao.usuarioId))

  const bruto = dados.get('destino')
  redirect(paraOndeVoltar(typeof bruto === 'string' ? bruto : null))
}
