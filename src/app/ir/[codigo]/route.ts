import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  COOKIE_VISITANTE_AFILIADO,
  novoTokenVisitante,
  requisicaoAutomatizada,
} from '@/modules/plataforma/afiliados/http'
import {
  registrarSaidaParaCasa,
  resolverDestinoDaCasaSemRegistrar,
} from '@/modules/plataforma/afiliados/servico'

export const dynamic = 'force-dynamic'
const SEM_CACHE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' }

async function resolver(request: Request, codigo: string, registrar: boolean): Promise<Response> {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Banco indisponível')
    if (!registrar) {
      return NextResponse.redirect(await resolverDestinoDaCasaSemRegistrar(getDb(), codigo), {
        headers: SEM_CACHE,
      })
    }
    const armario = await cookies()
    const tokenExistente = armario.get(COOKIE_VISITANTE_AFILIADO)?.value
    const token = tokenExistente ?? novoTokenVisitante()
    const sessao = await sessaoAtual()
    const destino = await registrarSaidaParaCasa(getDb(), {
      codigo,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      // A origem vem da tela do apito. Query string porque o `<a>` é um GET
      // simples: nada de formulário só para carregar um identificador.
      chaveDoApito: new URL(request.url).searchParams.get('apito'),
    })
    const resposta = NextResponse.redirect(destino, { headers: SEM_CACHE })
    if (!tokenExistente) {
      resposta.cookies.set(COOKIE_VISITANTE_AFILIADO, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      })
    }
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
