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
import { MENSAGEM_REGRA_SENHA, senhaSchema } from '@/modules/plataforma/auth/senha'
import { falha, mensagemDeErro, sucesso, type EstadoAcao } from '../estado-acao'
import { NOME_COOKIE_LINK_REDEFINICAO } from './link-redefinicao'

const SEM_ACESSO = falha('Acesso restrito: sua conta não é de administrador.')

/** Toda ação do painel confere o papel ADMIN no servidor, não só na tela. */
async function comAdmin(acao: () => Promise<EstadoAcao>): Promise<EstadoAcao> {
  if (!(await exigirAdmin())) return SEM_ACESSO
  try {
    return await acao()
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }
}

export async function acaoBloquear(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const id = String(formulario.get('id') ?? '')
  const motivo = String(formulario.get('motivo') ?? 'bloqueado pelo painel')
  const r = await comAdmin(async () => {
    await bloquearUsuario(getDb(), id, motivo, new Date())
    return sucesso('Conta bloqueada.')
  })
  revalidatePath('/admin/usuarios')
  return r
}

export async function acaoDesbloquear(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const id = String(formulario.get('id') ?? '')
  const r = await comAdmin(async () => {
    await desbloquearUsuario(getDb(), id, new Date())
    return sucesso('Conta desbloqueada.')
  })
  revalidatePath('/admin/usuarios')
  return r
}

export async function acaoExcluir(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const id = String(formulario.get('id') ?? '')
  const r = await comAdmin(async () => {
    await excluirUsuario(getDb(), id)
    return sucesso('Conta excluída.')
  })
  revalidatePath('/admin/usuarios')
  return r
}

export async function acaoAdicionar(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const email = String(formulario.get('email') ?? '').trim()
  const senha = String(formulario.get('senha') ?? '')
  const nome = String(formulario.get('nome') ?? '').trim()
  // A MESMA política do cadastro e da troca no perfil (`auth/senha.ts`). O
  // formulário antigo dizia "mín. 8" e a ação exigia 10: senhas de 8 ou 9
  // caracteres falhavam sem aviso nenhum.
  if (!email) return falha('Informe o e-mail.')
  if (!senhaSchema.safeParse(senha).success) return falha(MENSAGEM_REGRA_SENHA)

  const r = await comAdmin(async () => {
    await adicionarUsuario(getDb(), { email, senha, nome: nome || undefined })
    return sucesso(`Conta ${email} adicionada.`)
  })
  revalidatePath('/admin/usuarios')
  return r
}

/**
 * Emite o link de redefinição de senha e o entrega ao admin.
 *
 * O link NUNCA viaja pela querystring (log da plataforma, histórico, Referer).
 * Um cookie httpOnly de 2 minutos, escopado a esta página, carrega o link só
 * até a próxima renderização mostrá-lo.
 */
export async function acaoEmitirRedefinicao(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const admin = await exigirAdmin()
  if (!admin) return SEM_ACESSO

  const usuarioId = String(formulario.get('usuarioId') ?? '')
  try {
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
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }

  revalidatePath('/admin/usuarios')
  redirect('/admin/usuarios')
}
