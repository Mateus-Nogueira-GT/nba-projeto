import { NextResponse } from 'next/server'

import { dataDeReferencia } from '@/modules/dominio/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { configuracaoChat, responder } from '@/modules/entrega/chat'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

export const dynamic = 'force-dynamic'

/**
 * Chat do assinante. Mesma cadeia de acesso das telas: sessão válida e direito
 * ativo. Sem assinatura, sem chat.
 */
export async function POST(requisicao: Request): Promise<Response> {
  if (!configuracaoChat().habilitado) {
    return NextResponse.json({ erro: 'desabilitado' }, { status: 503 })
  }

  const sessao = await sessaoAtual()
  if (!sessao) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })

  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) return NextResponse.json({ erro: 'sem-direito' }, { status: 403 })

  const corpo = (await requisicao.json().catch(() => null)) as { texto?: unknown } | null
  const texto = typeof corpo?.texto === 'string' ? corpo.texto : ''

  try {
    const ruleset = await rulesetAtivo()
    const agora = new Date()
    const r = await responder(getDb(), portaLLMDoAmbiente(), {
      usuarioId: sessao.usuarioId,
      texto,
      dataReferencia: dataDeReferencia(agora, ruleset.rodada.fuso),
      fuso: ruleset.rodada.fuso,
      agora,
    })

    if (r.ok) return NextResponse.json({ texto: r.texto })
    // 429 para os dois freios de volume (dia e minuto), 400 para o que o
    // assinante pode corrigir sozinho (vazio, longa demais), 503 para o resto.
    const status =
      r.motivo === 'cota-esgotada' || r.motivo === 'limite-por-minuto'
        ? 429
        : r.motivo === 'vazio' || r.motivo === 'muito-longa'
          ? 400
          : 503
    return NextResponse.json({ erro: r.motivo }, { status })
  } catch {
    // `responder` já degrada internamente; isto cobre o que sobrar fora dele
    // (ruleset, conexão) para nunca subir como 500 não tratado ao assinante.
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
