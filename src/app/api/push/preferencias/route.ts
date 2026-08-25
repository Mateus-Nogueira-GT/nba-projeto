import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  conteudoJson,
  lerJsonLimitado,
  origemDaMutacaoValida,
  PayloadMuitoGrandeError,
} from '@/modules/plataforma/push/http'
import {
  atualizarPreferenciaPush,
  preferenciasPushDoUsuario,
  schemaPreferenciaPush,
} from '@/modules/plataforma/push/inscricoes'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })

  const preferencias = await preferenciasPushDoUsuario(getDb(), sessao.usuarioId)
  return Response.json(
    { preferencias },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}

export async function PATCH(request: Request): Promise<Response> {
  if (!origemDaMutacaoValida(request)) {
    return Response.json({ erro: 'origem inválida' }, { status: 403 })
  }
  if (!conteudoJson(request)) {
    return Response.json({ erro: 'content-type deve ser application/json' }, { status: 415 })
  }
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })

  try {
    const entrada = schemaPreferenciaPush.parse(await lerJsonLimitado(request))
    const preferencias = await atualizarPreferenciaPush(getDb(), sessao.usuarioId, entrada)
    return Response.json({ preferencias })
  } catch (erro) {
    if (erro instanceof PayloadMuitoGrandeError) {
      return Response.json({ erro: 'payload muito grande' }, { status: 413 })
    }
    if (erro instanceof ZodError || erro instanceof SyntaxError) {
      return Response.json({ erro: 'preferência inválida' }, { status: 400 })
    }
    throw erro
  }
}
