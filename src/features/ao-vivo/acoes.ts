'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { exibirJogador, ocultarJogador } from '@/modules/plataforma/jogadores-ocultos'

/**
 * Ocultar/exibir jogador no Ao Vivo — preferência por CONTA. Sem sessão a
 * ação não faz nada: a tela já está atrás do paywall, isto é o cinto.
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
