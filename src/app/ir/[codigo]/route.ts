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
  let destino: string
  try {
    if (!process.env.DATABASE_URL) throw new Error('Banco indisponível')
    destino = await resolverDestinoDaCasaSemRegistrar(getDb(), codigo)
  } catch {
    return NextResponse.redirect(new URL('/oferta-indisponivel', request.url), {
      status: 307,
      headers: SEM_CACHE,
    })
  }
  if (!registrar) return NextResponse.redirect(destino, { headers: SEM_CACHE })

  // O DESTINO JÁ ESTÁ RESOLVIDO: falhar ao REGISTRAR a saída (pool cheio,
  // lock) não pode mandar o assinante para "oferta indisponível" — a
  // comissão se perdia junto com o clique (auditoria 23/09). O erro vai para
  // o log e o assinante segue para a casa.
  const armario = await cookies()
  const tokenExistente = armario.get(COOKIE_VISITANTE_AFILIADO)?.value
  const token = tokenExistente ?? novoTokenVisitante()
  try {
    const sessao = await sessaoAtual()
    destino = await registrarSaidaParaCasa(getDb(), {
      codigo,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      // A origem vem da tela do apito. Query string porque o `<a>` é um GET
      // simples: nada de formulário só para carregar um identificador.
      chaveDoApito: new URL(request.url).searchParams.get('apito'),
    })
  } catch (erro) {
    console.error(
      JSON.stringify({ evento: 'afiliado_saida_falhou', codigo, mensagem: String(erro) }),
    )
  }
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
}

export async function GET(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, !requisicaoAutomatizada(request))
}

export async function HEAD(request: Request, contexto: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await contexto.params
  return resolver(request, codigo, false)
}
