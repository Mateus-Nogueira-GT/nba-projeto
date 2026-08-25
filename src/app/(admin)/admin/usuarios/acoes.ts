'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import {
  adicionarUsuario,
  bloquearUsuario,
  desbloquearUsuario,
  excluirUsuario,
} from '@/modules/plataforma/admin/usuarios'

/** Toda ação do painel confere o papel ADMIN no servidor, não só na tela. */
async function comAdmin<T>(acao: () => Promise<T>): Promise<T | null> {
  if (!(await exigirAdmin())) return null
  return acao()
}

export async function acaoBloquear(formulario: FormData): Promise<void> {
  const id = String(formulario.get('id') ?? '')
  const motivo = String(formulario.get('motivo') ?? 'bloqueado pelo painel')
  await comAdmin(() => bloquearUsuario(getDb(), id, motivo, new Date()))
  revalidatePath('/admin/usuarios')
}

export async function acaoDesbloquear(formulario: FormData): Promise<void> {
  const id = String(formulario.get('id') ?? '')
  await comAdmin(() => desbloquearUsuario(getDb(), id, new Date()))
  revalidatePath('/admin/usuarios')
}

export async function acaoExcluir(formulario: FormData): Promise<void> {
  const id = String(formulario.get('id') ?? '')
  await comAdmin(() => excluirUsuario(getDb(), id))
  revalidatePath('/admin/usuarios')
}

export async function acaoAdicionar(formulario: FormData): Promise<void> {
  const email = String(formulario.get('email') ?? '')
  const senha = String(formulario.get('senha') ?? '')
  const nome = String(formulario.get('nome') ?? '')
  if (!email || senha.length < 8) return

  await comAdmin(() => adicionarUsuario(getDb(), { email, senha, nome: nome || undefined }))
  revalidatePath('/admin/usuarios')
}
