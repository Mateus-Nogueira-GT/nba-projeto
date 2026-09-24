'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/modules/dominio/db/cliente'
import { usuarios } from '@/modules/dominio/db/schema'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { paraOndeVoltar } from './destino'

/**
 * O "OK, concordo". Grava a DATA do aceite (é registro, não booleano) e
 * devolve a pessoa ao lugar que ela pediu antes de ser interceptada — por um
 * destino validado, nunca o valor cru do formulário.
 */
export async function aceitarMetodologia(dados: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar')
  await getDb().update(usuarios).set({ metodologiaAceitaEm: new Date() }).where(eq(usuarios.id, sessao.usuarioId))
  const bruto = dados.get('destino')
  redirect(paraOndeVoltar(typeof bruto === 'string' ? bruto : null))
}
