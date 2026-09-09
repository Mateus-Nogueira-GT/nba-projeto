'use server'

import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { aceitarConvite } from '@/modules/plataforma/afiliados/servico'

export async function aceitar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) throw new Error('Sessão exigida')
  const token = String(formulario.get('token') ?? '')
  await aceitarConvite(getDb(), sessao.usuarioId, token, new Date())
  redirect('/afiliados')
}
