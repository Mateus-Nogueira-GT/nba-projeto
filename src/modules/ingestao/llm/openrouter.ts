import { z } from 'zod'

import { modelosDoPerfil, parametrosDoPerfil } from './perfis'
import {
  ErroLLM,
  type MotivoErroLLM,
  type PedidoGeracao,
  type PerfilLLM,
  type PortaLLM,
  type TextoGerado,
} from './porta'

/**
 * Adapter do OpenRouter — o roteador de modelos.
 *
 * O fallback é NATIVO: manda-se o array `models` e o OpenRouter tenta na
 * ordem, caindo para o próximo quando o modelo está fora, sem saldo ou em
 * limite de taxa. Por isso não existe laço de fallback aqui — reimplementá-lo
 * seria duplicar o serviço que estamos pagando.
 *
 * `fetchFn` entra por injeção: o teste passa um mock, a produção passa o
 * fetch real. Mesmo padrão dos adapters da NBA.
 */

const respostaSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullish() }).partial(),
        finish_reason: z.string().nullish(),
      }),
    )
    .default([]),
  usage: z
    .object({ prompt_tokens: z.number().nullish(), completion_tokens: z.number().nullish() })
    .nullish(),
})

const TIMEOUT_MS = 15_000

function motivoDoStatus(status: number): MotivoErroLLM {
  if (status === 429) return 'limite-de-taxa'
  if (status === 402) return 'sem-saldo'
  return 'transporte'
}

export class OpenRouter implements PortaLLM {
  readonly nome = 'openrouter'

  constructor(
    private readonly chave: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
  ) {}

  async gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado> {
    const { maxTokens, temperatura } = parametrosDoPerfil(perfil)
    const corpo = JSON.stringify({
      models: modelosDoPerfil(perfil),
      messages: [
        { role: 'system', content: pedido.sistema },
        { role: 'user', content: pedido.usuario },
      ],
      max_tokens: pedido.maxTokens ?? maxTokens,
      temperature: temperatura,
    })

    // Uma repetição só: falha de transporte costuma ser transitória, mas
    // insistir mais que isso segura o cron e multiplica a conta.
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await this.chamar(corpo)
      } catch (erro) {
        // Erro de negócio (sem saldo, resposta inválida) não melhora com
        // repetição — só transporte e timeout merecem segunda chance.
        if (erro instanceof ErroLLM && erro.motivo !== 'transporte' && erro.motivo !== 'timeout') {
          throw erro
        }
        ultimoErro = erro
      }
    }
    throw ultimoErro instanceof ErroLLM
      ? ultimoErro
      : new ErroLLM('transporte', String(ultimoErro))
  }

  private async chamar(corpo: string): Promise<TextoGerado> {
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS)
    try {
      const resposta = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.chave}`,
          'Content-Type': 'application/json',
        },
        body: corpo,
        signal: controle.signal,
      })

      if (!resposta.ok) {
        throw new ErroLLM(motivoDoStatus(resposta.status), `openrouter: HTTP ${resposta.status}`)
      }

      const bruta = respostaSchema.safeParse(await resposta.json())
      if (!bruta.success) throw new ErroLLM('resposta-invalida', 'formato inesperado')

      const texto = bruta.data.choices[0]?.message?.content?.trim() ?? ''
      if (texto.length === 0) throw new ErroLLM('resposta-invalida', 'resposta sem texto')

      return {
        texto,
        modelo: bruta.data.model ?? 'desconhecido',
        tokensEntrada: bruta.data.usage?.prompt_tokens ?? 0,
        tokensSaida: bruta.data.usage?.completion_tokens ?? 0,
        // Não vira erro aqui: o texto veio e foi cobrado. Cada consumidor
        // decide se texto cortado serve (o chat decide que não).
        truncado: bruta.data.choices[0]?.finish_reason === 'length',
      }
    } catch (erro) {
      if (erro instanceof ErroLLM) throw erro
      if (erro instanceof Error && erro.name === 'AbortError') {
        throw new ErroLLM('timeout', `openrouter: sem resposta em ${TIMEOUT_MS}ms`)
      }
      throw new ErroLLM('transporte', String(erro))
    } finally {
      clearTimeout(relogio)
    }
  }
}
