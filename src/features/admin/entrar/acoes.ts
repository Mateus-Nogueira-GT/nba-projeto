'use server'

import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { autenticar } from '@/modules/plataforma/auth/sessao'
import { gravarCookieDeSessao } from '@/modules/plataforma/auth/cookies'
import { destinoInternoSeguro, ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'

const DURACAO_MS = 30 * 24 * 3600_000

/**
 * Login do painel. A identidade é a mesma tabela do app; o que separa é a
 * rota e a exigência de papel ADMIN em cada tela e cada ação do painel.
 * Mensagem única para credenciais: dizer "e-mail não existe" entrega a base.
 */
export async function entrarNoPainel(_estado: string | null, formulario: FormData): Promise<string | null> {
  const email = String(formulario.get('email') ?? '').trim()
  const senha = String(formulario.get('senha') ?? '')
  if (!email || !senha) return 'Informe e-mail e senha.'
  const destino = destinoInternoSeguro(String(formulario.get('destino') ?? '/admin'))
  const ua = String(formulario.get('ua') ?? '')

  const agora = new Date()
  const r = await autenticar(
    getDb(),
    { email, senha },
    {
      fingerprint: String(formulario.get('dispositivo') ?? 'desconhecido'),
      tipo: /mobile|android|iphone/i.test(ua) ? 'MOBILE' : 'DESKTOP',
      userAgent: ua || null,
      ip: await ipDaRequisicao(),
    },
    agora,
    { duracaoMs: DURACAO_MS },
  )

  if (!r.ok) {
    return r.motivo === 'excesso-de-tentativas'
      ? 'Muitas tentativas. Aguarde alguns minutos.'
      : r.motivo === 'bloqueado'
        ? 'Conta bloqueada. Fale com o suporte.'
        : 'E-mail ou senha incorretos.'
  }

  await gravarCookieDeSessao(r.token, new Date(agora.getTime() + DURACAO_MS))
  redirect(destino)
}
