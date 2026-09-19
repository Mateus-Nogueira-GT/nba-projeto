import { NextResponse } from 'next/server'

import { dataDeReferencia, intervaloDoDia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { getDb } from '@/modules/dominio/db/cliente'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { configuracaoChat, conversaDoDia, responder } from '@/modules/entrega/chat'
import { rankingDoDia } from './ranking'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { atende, type NivelPago } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

export const dynamic = 'force-dynamic'

/**
 * A conversa de hoje, para o painel mostrar ao abrir. Sem isto a gaveta abre
 * vazia toda vez, enquanto o modelo "lembra" de um histórico que a tela não
 * mostra — e "e o outro?" vira resposta a uma pergunta invisível.
 */
export async function GET(): Promise<Response> {
  const config = configuracaoChat()
  if (!config.habilitado || !config.cotaDiariaPorNivel) {
    return NextResponse.json({ erro: 'desabilitado' }, { status: 503 })
  }

  try {
    const sessao = await sessaoAtual()
    if (!sessao) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })

    const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
    // O assistente começa no MVP (spec, decisão 7), a mesma régua do POST:
    // a conversa salva é conteúdo do assistente, não existe para quem não
    // tem nível para ele.
    if (acesso.nivel === null) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })
    if (!atende(acesso.nivel, 'MVP')) {
      return NextResponse.json({ erro: 'nivel-insuficiente' }, { status: 403 })
    }

    const ruleset = await rulesetAtivo()
    const { fuso } = ruleset.rodada
    const mensagens = await conversaDoDia(
      getDb(),
      sessao.usuarioId,
      dataDeReferencia(new Date(), fuso),
      fuso,
      config.cotaDiariaPorNivel[acesso.nivel as NivelPago],
    )
    return NextResponse.json({ mensagens })
  } catch {
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}

/**
 * Chat de suporte. Sessão válida continua obrigatória (401 sem ela); a
 * partir daqui, direito de assinatura MVP+ também é (403 abaixo disso —
 * spec, decisão 7). Antes desta task o direito só mudava o CONTEÚDO da
 * resposta; agora é portão: cada pergunta é uma chamada paga de LLM, e uma
 * conta que não paga perguntando é prejuízo direto, não só conteúdo dado.
 */
export async function POST(requisicao: Request): Promise<Response> {
  const config = configuracaoChat()
  if (!config.habilitado || !config.cotaDiariaPorNivel) {
    return NextResponse.json({ erro: 'fora-do-ar' }, { status: 503 })
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
    // `nivel: null` só acontece por bloqueio administrativo aqui (o usuarioId
    // já é válido) — tratado como sessão inválida, não como "sem nível
    // suficiente": quem foi bloqueado não tem conta para negociar plano.
    if (acesso.nivel === null) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })
    // O assistente começa no MVP (spec, decisão 7). É portão, não conteúdo:
    // quem não tem nível não chega à LLM, e a resposta diz o motivo em JSON
    // para o painel traduzir.
    if (!atende(acesso.nivel, 'MVP')) {
      return NextResponse.json({ erro: 'nivel-insuficiente' }, { status: 403 })
    }
    const cotaDiaria = config.cotaDiariaPorNivel[acesso.nivel as NivelPago]

    const ruleset = await rulesetAtivo()
    const agora = new Date()
    const dataReferencia = dataDeReferencia(agora, ruleset.rodada.fuso)

    // A SUGESTÃO ESTATÍSTICA (ADR-0012). Lida AQUI, e não dentro de
    // `responder`, porque o cache é `next/cache` e nenhum módulo do projeto
    // importa Next. Falhando a leitura, `rankingDoDia` devolve undefined e o
    // assistente responde como antes dela — a dica é acréscimo, não requisito.
    const ranking = await rankingDoDia(dataReferencia, ruleset)
    const sugestao = ranking === undefined ? undefined : { ruleset, ranking }

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
      cotaDiaria,
      sugestao,
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
