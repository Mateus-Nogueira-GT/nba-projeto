'use server'

import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { aceitarConvite } from '@/modules/plataforma/afiliados/servico'
import { falha, mensagemDeErro, type EstadoAcao } from '@/features/admin/estado-acao'

/**
 * Aceite do convite de parceiro. Token inválido, expirado ou de outro e-mail
 * volta como mensagem na própria página — antes, a exceção crua virava a
 * tela de erro padrão.
 */
export async function aceitar(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const sessao = await sessaoAtual()
  if (!sessao) return falha('Entre na sua conta para aceitar o convite.')
  const token = String(formulario.get('token') ?? '')
  if (!token) return falha('Convite inválido.')
  try {
    await aceitarConvite(getDb(), sessao.usuarioId, token, new Date())
  } catch (erro) {
    return falha(
      erro instanceof Error && erro.message
        ? `Não foi possível aceitar: ${mensagemDeErro(erro)}`
        : 'Convite inválido, expirado ou de outra conta.',
    )
  }
  redirect('/afiliados')
}
