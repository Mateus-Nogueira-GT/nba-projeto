import { cache } from 'react'
import { cookies } from 'next/headers'
import { getDb } from '../../dominio/db/cliente'
import { validarSessao, type Sessao } from './sessao'
import { ipDaRequisicao } from './requisicao'

export const NOME_COOKIE = 'ia_nba_sessao'

export async function gravarCookieDeSessao(token: string, expiraEm: Date): Promise<void> {
  const armario = await cookies()
  armario.set(NOME_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  })
}

export async function limparCookieDeSessao(): Promise<void> {
  const armario = await cookies()
  armario.delete(NOME_COOKIE)
}

export async function tokenDaSessaoAtual(): Promise<string | null> {
  return (await cookies()).get(NOME_COOKIE)?.value ?? null
}

/**
 * Sessão da requisição atual.
 *
 * Consulta o banco a cada chamada de propósito: é o que faz o bloqueio pelo
 * painel valer na requisição seguinte, em vez de esperar o token expirar.
 *
 * `cache()` memoriza por REQUISIÇÃO: guarda, ações e rotas que chamam
 * `sessaoAtual` na mesma renderização validam a sessão uma vez só.
 */
export const sessaoAtual = cache(async (): Promise<Sessao | null> => {
  if (!process.env.DATABASE_URL) return null

  const token = await tokenDaSessaoAtual()
  if (!token) return null

  const r = await validarSessao(getDb(), token, new Date(), { ip: await ipDaRequisicao() })
  return r.ok ? r.sessao : null
})

export async function exigirAdmin(): Promise<Sessao | null> {
  const sessao = await sessaoAtual()
  return sessao?.papel === 'ADMIN' ? sessao : null
}
