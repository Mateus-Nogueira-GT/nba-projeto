import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  COOKIE_VISITANTE_AFILIADO,
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
    const token = (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value
    const sessao = registrar ? await sessaoAtual() : null
    const destino =
      registrar && token
        ? await registrarSaidaParaCasa(getDb(), {
            codigo,
            visitanteToken: token,
            usuarioId: sessao?.usuarioId,
            agora: new Date(),
          })
        : await resolverDestinoDaCasaSemRegistrar(getDb(), codigo)
    return NextResponse.redirect(destino, { headers: SEM_CACHE })
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
