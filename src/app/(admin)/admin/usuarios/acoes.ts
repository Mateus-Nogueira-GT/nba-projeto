'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import {
  adicionarUsuario,
  bloquearUsuario,
  desbloquearUsuario,
  excluirUsuario,
} from '@/modules/plataforma/admin/usuarios'
import { emitirRedefinicao } from '@/modules/plataforma/auth/redefinicao'
import { senhaSchema } from '@/modules/plataforma/auth/senha'
import { NOME_COOKIE_LINK_REDEFINICAO } from './link-redefinicao'

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
  // A MESMA política do cadastro e da troca no perfil (`auth/senha.ts`) —
  // `senha.length < 8` deixava o painel aceitar uma senha mais fraca do que
  // o resto do produto exige (achado da revisão final).
  if (!email || !senhaSchema.safeParse(senha).success) return

  await comAdmin(() => adicionarUsuario(getDb(), { email, senha, nome: nome || undefined }))
  revalidatePath('/admin/usuarios')
}

/**
 * Emite o link de redefinição de senha e o entrega ao admin.
 *
 * O link NUNCA viaja pela querystring: URL de requisição fica no log da
 * plataforma, no histórico do navegador e no `Referer` do próximo link que a
 * pessoa clicar — exatamente onde a spec (§4.3) proíbe token aparecer. Em vez
 * disso, um cookie httpOnly de vida curta (2 minutos), escopado a esta
 * página, carrega o link só até a página seguinte renderizar e mostrá-lo.
 */
export async function acaoEmitirRedefinicao(formulario: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin) return

  const usuarioId = String(formulario.get('usuarioId') ?? '')
  const { token } = await emitirRedefinicao(getDb(), {
    usuarioId,
    criadaPorId: admin.usuarioId,
    agora: new Date(),
  })

  const base = process.env.APP_PUBLIC_URL ?? ''
  const armario = await cookies()
  armario.set(NOME_COOKIE_LINK_REDEFINICAO, `${base}/redefinir/${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin/usuarios',
    maxAge: 120,
  })

  revalidatePath('/admin/usuarios')
  redirect('/admin/usuarios')
}
