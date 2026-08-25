'use server'

import { revalidatePath } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { exibirJogador, ocultarJogador } from '@/modules/plataforma/jogadores-ocultos'

/**
 * Ocultar/exibir jogador no Fire Live — preferência por CONTA.
 *
 * Sem sessão a ação simplesmente não faz nada: a tela que a chama já está
 * atrás do paywall, então este é o cinto de segurança, não a porta.
 */
export async function ocultar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  if (!sessao || jogadorId === '') return
  await ocultarJogador(getDb(), sessao.usuarioId, jogadorId)
  revalidatePath('/fire-live')
}

export async function exibir(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  if (!sessao || jogadorId === '') return
  await exibirJogador(getDb(), sessao.usuarioId, jogadorId)
  revalidatePath('/fire-live')
}
