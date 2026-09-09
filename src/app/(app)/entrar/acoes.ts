'use server'

import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { autenticar, encerrarSessaoPorToken } from '@/modules/plataforma/auth/sessao'
import {
  gravarCookieDeSessao,
  limparCookieDeSessao,
  tokenDaSessaoAtual,
} from '@/modules/plataforma/auth/cookies'
import { destinoInternoSeguro, ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'
import { cookies } from 'next/headers'
import { COOKIE_VISITANTE_AFILIADO } from '@/modules/plataforma/afiliados/http'
import { associarVisitanteAoUsuario } from '@/modules/plataforma/afiliados/servico'

const DURACAO_MS = 30 * 24 * 3600_000

export async function entrar(_estado: string | null, formulario: FormData): Promise<string | null> {
  const email = String(formulario.get('email') ?? '')
  const senha = String(formulario.get('senha') ?? '')
  const fingerprint = String(formulario.get('dispositivo') ?? 'desconhecido')
  const destino = destinoInternoSeguro(String(formulario.get('destino') ?? '/'))

  const agora = new Date()
  const r = await autenticar(
    getDb(),
    { email, senha },
    {
      fingerprint,
      tipo: /mobile|android|iphone/i.test(String(formulario.get('ua') ?? ''))
        ? 'MOBILE'
        : 'DESKTOP',
      userAgent: String(formulario.get('ua') ?? '') || null,
      ip: await ipDaRequisicao(),
    },
    agora,
    { duracaoMs: DURACAO_MS },
  )

  if (!r.ok) {
    // Mensagem única para credenciais: dizer "e-mail não existe" entrega a
    // base de assinantes para quem estiver testando endereços.
    return r.motivo === 'excesso-de-tentativas'
      ? 'Muitas tentativas. Aguarde alguns minutos.'
      : r.motivo === 'bloqueado'
        ? 'Conta bloqueada. Fale com o suporte.'
        : 'E-mail ou senha incorretos.'
  }

  await gravarCookieDeSessao(r.token, new Date(agora.getTime() + DURACAO_MS))
  const visitante = r.usuarioId ? (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value : null
  if (visitante && r.usuarioId) {
    try {
      await associarVisitanteAoUsuario(getDb(), visitante, r.usuarioId, agora, 'LOGIN')
    } catch (erro) {
      console.error('Falha ao associar atribuição de afiliado após login', erro)
    }
  }
  redirect(destino)
}

export async function sair(): Promise<void> {
  const token = await tokenDaSessaoAtual()
  if (token) {
    // Revoga primeiro. Se o banco falhar, não fingimos que houve logout apenas
    // removendo o cookie enquanto o token persistido continua válido.
    await encerrarSessaoPorToken(getDb(), token, 'logout solicitado pelo usuário', new Date())
  }
  await limparCookieDeSessao()
  redirect('/entrar')
}
