import { NextResponse } from 'next/server'

import { dataDeReferencia, intervaloDoDia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { getDb } from '@/modules/dominio/db/cliente'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { configuracaoChat, conversaDoDia, responder } from '@/modules/entrega/chat'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

export const dynamic = 'force-dynamic'

/**
 * A conversa de hoje, para o painel mostrar ao abrir. Sem isto a gaveta abre
 * vazia toda vez, enquanto o modelo "lembra" de um histórico que a tela não
 * mostra — e "e o outro?" vira resposta a uma pergunta invisível.
 */
export async function GET(): Promise<Response> {
  if (!configuracaoChat().habilitado) {
    return NextResponse.json({ erro: 'desabilitado' }, { status: 503 })
  }

  try {
    const sessao = await sessaoAtual()
    if (!sessao) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })

    const ruleset = await rulesetAtivo()
    const { fuso } = ruleset.rodada
    const mensagens = await conversaDoDia(
      getDb(),
      sessao.usuarioId,
      dataDeReferencia(new Date(), fuso),
      fuso,
    )
    return NextResponse.json({ mensagens })
  } catch {
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}

/**
 * Chat de suporte. Sessão válida continua obrigatória (401 sem ela); direito
 * de assinatura ativo NÃO é — ele decide o CONTEÚDO da resposta, não a porta.
 * Ver o comentário junto de `avaliarAcesso`, abaixo.
 */
export async function POST(requisicao: Request): Promise<Response> {
  if (!configuracaoChat().habilitado) {
    return NextResponse.json({ erro: 'desabilitado' }, { status: 503 })
  }

  const corpo = (await requisicao.json().catch(() => null)) as { texto?: unknown } | null
  const texto = typeof corpo?.texto === 'string' ? corpo.texto : ''

  // Sessão e acesso ficam DENTRO do try: os dois vão ao banco, e um banco fora
  // do ar aqui subia como 500 cru — o painel só traduz motivo que chega em
  // JSON, e um 500 vira "fora do ar" por acidente, não por desenho.
  try {
    const sessao = await sessaoAtual()
    if (!sessao) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })

    const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
    // Sem direito NÃO é barreira. O suporte sobre a plataforma serve
    // principalmente a quem ainda está decidindo assinar; o direito decide o
    // CONTEÚDO (a lista do dia entra ou não), não a porta.

    const ruleset = await rulesetAtivo()
    const agora = new Date()
    const dataReferencia = dataDeReferencia(agora, ruleset.rodada.fuso)
    const r = await responder(getDb(), portaLLMDoAmbiente(), {
      usuarioId: sessao.usuarioId,
      texto,
      dataReferencia,
      fuso: ruleset.rodada.fuso,
      // A temporada é calculada AQUI porque é aqui que o ruleset existe:
      // `responder` não o recebe, e passá-lo só para isto arrastaria o motor
      // para dentro do chat.
      temporada: temporadaDe(
        intervaloDoDia(dataReferencia, ruleset.rodada.fuso).inicio,
        calendarioDoRuleset(ruleset),
      ),
      agora,
      comDireito: acesso.permitido,
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
    // (sessão, acesso, ruleset, conexão) para nunca subir como 500 não tratado.
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
