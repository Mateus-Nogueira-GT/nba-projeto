import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  COOKIE_VISITANTE_AFILIADO,
  novoTokenVisitante,
  requisicaoAutomatizada,
} from '@/modules/plataforma/afiliados/http'
import { registrarClique, resolverLinkSemRegistrar } from '@/modules/plataforma/afiliados/servico'

export const dynamic = 'force-dynamic'
const SEM_CACHE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' }

async function resolver(request: Request, codigo: string, registrar: boolean): Promise<Response> {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Banco indisponível')
    const destino = registrar ? null : await resolverLinkSemRegistrar(getDb(), codigo)
    if (destino) return NextResponse.redirect(new URL(destino, request.url), { headers: SEM_CACHE })

    const armario = await cookies()
    const token = armario.get(COOKIE_VISITANTE_AFILIADO)?.value ?? novoTokenVisitante()
    const sessao = await sessaoAtual()
    const clique = await registrarClique(getDb(), {
      codigo,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      automatizado: false,
    })
    const resposta = NextResponse.redirect(new URL(clique.destino, request.url), {
      headers: SEM_CACHE,
    })
    resposta.cookies.set(COOKIE_VISITANTE_AFILIADO, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })
    return resposta
  } catch {
    return NextResponse.redirect(new URL('/oferta-indisponivel', request.url), {
      status: 307,
      headers: SEM_CACHE,
    })
  }
}

export async function GET(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, !requisicaoAutomatizada(request))
}

export async function HEAD(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, false)
}
