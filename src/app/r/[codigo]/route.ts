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
  type ConfiguracaoDoLink,
  registrarClique,
  resolverLinkSemRegistrar,
} from '@/modules/plataforma/afiliados/servico'

export const dynamic = 'force-dynamic'
const SEM_CACHE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' }

async function resolver(request: Request, codigo: string, registrar: boolean): Promise<Response> {
  let destino: string
  let configuracao: ConfiguracaoDoLink
  try {
    if (!process.env.DATABASE_URL) throw new Error('Banco indisponível')
    ;({ destino, configuracao } = await resolverLinkSemRegistrar(getDb(), codigo))
  } catch {
    return NextResponse.redirect(new URL('/oferta-indisponivel', request.url), {
      status: 307,
      headers: SEM_CACHE,
    })
  }
  if (!registrar) return NextResponse.redirect(new URL(destino, request.url), { headers: SEM_CACHE })

  // O DESTINO JÁ ESTÁ RESOLVIDO: falhar ao REGISTRAR o clique (pool cheio,
  // lock) não pode mandar o visitante para "oferta indisponível" — a
  // comissão se perdia junto com o clique (auditoria 23/09). O erro vai para
  // o log e o visitante segue para a casa.
  const armario = await cookies()
  const token = armario.get(COOKIE_VISITANTE_AFILIADO)?.value ?? novoTokenVisitante()
  try {
    const sessao = await sessaoAtual()
    const clique = await registrarClique(getDb(), {
      codigo,
      // A mesma configuração que resolveu o destino: sem reler o link.
      configuracao,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      automatizado: false,
    })
    destino = clique.destino
  } catch (erro) {
    console.error(
      JSON.stringify({ evento: 'afiliado_registro_falhou', codigo, mensagem: String(erro) }),
    )
  }
  const resposta = NextResponse.redirect(new URL(destino, request.url), { headers: SEM_CACHE })
  resposta.cookies.set(COOKIE_VISITANTE_AFILIADO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return resposta
}

export async function GET(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, !requisicaoAutomatizada(request))
}

export async function HEAD(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, false)
}
