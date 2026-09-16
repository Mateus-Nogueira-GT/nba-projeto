import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { politicaHomologacaoDoAmbiente } from '@/modules/entrega/push/fanout'
import { lerConfiguracaoPush } from '@/modules/entrega/push/configuracao'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import {
  conteudoJson,
  lerJsonLimitado,
  origemDaMutacaoValida,
  PayloadMuitoGrandeError,
} from '@/modules/plataforma/push/http'
import {
  DispositivoDaSessaoAusenteError,
  InscricaoJaExpiradaError,
  invalidarInscricoesDoDispositivo,
  registrarInscricaoPush,
  schemaInscricaoPush,
} from '@/modules/plataforma/push/inscricoes'

export const dynamic = 'force-dynamic'

function indisponivel(): boolean {
  return !lerConfiguracaoPush().habilitado
}

export async function POST(request: Request): Promise<Response> {
  if (!origemDaMutacaoValida(request)) {
    return Response.json({ erro: 'origem inválida' }, { status: 403 })
  }
  if (!conteudoJson(request)) {
    return Response.json({ erro: 'content-type deve ser application/json' }, { status: 415 })
  }
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })
  const politica = politicaHomologacaoDoAmbiente()
  const homologada = politica.permitido({
    id: sessao.usuarioId,
    email: sessao.email,
    direitoAtivo: false,
  })
  const acesso = homologada ? null : await avaliarAcesso(getDb(), sessao.usuarioId)
  if (
    !homologada &&
    !politica.permitido({
      id: sessao.usuarioId,
      email: sessao.email,
      direitoAtivo: acesso?.nivel != null && atende(acesso.nivel, 'MVP'),
    })
  ) {
    return Response.json({ erro: 'Push ainda não liberado para esta conta' }, { status: 403 })
  }
  if (indisponivel()) return Response.json({ erro: 'Push indisponível' }, { status: 503 })

  try {
    const entrada = schemaInscricaoPush.parse(await lerJsonLimitado(request))
    const resultado = await registrarInscricaoPush(getDb(), sessao, entrada)
    return Response.json(resultado, { status: resultado.criada ? 201 : 200 })
  } catch (erro) {
    if (erro instanceof PayloadMuitoGrandeError) {
      return Response.json({ erro: 'payload muito grande' }, { status: 413 })
    }
    if (
      erro instanceof ZodError ||
      erro instanceof SyntaxError ||
      erro instanceof InscricaoJaExpiradaError
    ) {
      return Response.json({ erro: 'inscrição inválida' }, { status: 400 })
    }
    if (erro instanceof DispositivoDaSessaoAusenteError) {
      return Response.json({ erro: 'sessão sem dispositivo' }, { status: 409 })
    }
    throw erro
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!origemDaMutacaoValida(request)) {
    return Response.json({ erro: 'origem inválida' }, { status: 403 })
  }
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })
  if (!sessao.dispositivoId) {
    return Response.json({ erro: 'sessão sem dispositivo' }, { status: 409 })
  }

  const removidas = await invalidarInscricoesDoDispositivo(
    getDb(),
    sessao.usuarioId,
    sessao.dispositivoId,
    'desativada pelo usuário',
  )
  return Response.json({ removidas })
}
