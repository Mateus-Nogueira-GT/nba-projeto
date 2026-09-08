import { ZodError } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import type { Db } from '@/modules/dominio/db/tipos'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  AlvoExperienciaNaoEncontradoError,
  estadoExperienciaDoUsuario,
} from '@/modules/plataforma/experiencia/servico'
import {
  conteudoJson,
  lerJsonLimitado,
  origemDaMutacaoValida,
  PayloadMuitoGrandeError,
} from '@/modules/plataforma/push/http'

export async function respostaExperiencia(db: Db, usuarioId: string): Promise<Response> {
  return Response.json(
    { estado: await estadoExperienciaDoUsuario(db, usuarioId) },
    {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    },
  )
}

/** A identidade vem exclusivamente da sessão, nunca do corpo da requisição. */
export async function mutarExperiencia(
  request: Request,
  mutacao: (db: Db, usuarioId: string, entrada: unknown) => Promise<void>,
): Promise<Response> {
  if (!origemDaMutacaoValida(request))
    return Response.json({ erro: 'origem inválida' }, { status: 403 })
  if (!conteudoJson(request))
    return Response.json({ erro: 'content-type deve ser application/json' }, { status: 415 })
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })
  try {
    const entrada = await lerJsonLimitado(request)
    const db = getDb()
    await mutacao(db, sessao.usuarioId, entrada)
    return respostaExperiencia(db, sessao.usuarioId)
  } catch (erro) {
    if (erro instanceof PayloadMuitoGrandeError)
      return Response.json({ erro: 'payload muito grande' }, { status: 413 })
    if (erro instanceof ZodError || erro instanceof SyntaxError)
      return Response.json({ erro: 'preferência inválida' }, { status: 400 })
    if (erro instanceof AlvoExperienciaNaoEncontradoError)
      return Response.json({ erro: erro.message }, { status: 404 })
    throw erro
  }
}
