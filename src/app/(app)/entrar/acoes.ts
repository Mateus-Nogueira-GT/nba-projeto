'use server'

import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { autenticar } from '@/modules/plataforma/auth/sessao'
import { gravarCookieDeSessao, limparCookieDeSessao } from '@/modules/plataforma/auth/cookies'

const DURACAO_MS = 30 * 24 * 3600_000

export async function entrar(_estado: string | null, formulario: FormData): Promise<string | null> {
  const email = String(formulario.get('email') ?? '')
  const senha = String(formulario.get('senha') ?? '')
  const fingerprint = String(formulario.get('dispositivo') ?? 'desconhecido')
  const destino = String(formulario.get('destino') ?? '/')

  const agora = new Date()
  const r = await autenticar(
    getDb(),
    { email, senha },
    {
      fingerprint,
      tipo: /mobile|android|iphone/i.test(String(formulario.get('ua') ?? '')) ? 'MOBILE' : 'DESKTOP',
      userAgent: String(formulario.get('ua') ?? '') || null,
      ip: null,
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
  redirect(destino)
}

export async function sair(): Promise<void> {
  await limparCookieDeSessao()
  redirect('/entrar')
}
