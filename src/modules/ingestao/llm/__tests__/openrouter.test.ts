import { describe, expect, it, vi } from 'vitest'

import { LLMFake } from '../fake'
import { portaLLMDoAmbiente } from '../index'
import { OpenRouter } from '../openrouter'
import { ErroLLM } from '../porta'

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const OK = {
  model: 'google/gemini-2.0-flash-001',
  choices: [{ message: { content: 'Texto gerado.' } }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
}

describe('adapter OpenRouter', () => {
  it('manda a CADEIA de modelos do perfil, não um só', async () => {
    // O fallback do OpenRouter é o array `models`. Mandar um modelo só
    // desliga exatamente o que justifica usar o roteador.
    const fetchMock = vi.fn<typeof fetch>(async () => resposta(OK))
    await new OpenRouter('chave', fetchMock).gerar('narrativa', { sistema: 's', usuario: 'u' })

    const corpo = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
    expect(Array.isArray(corpo.models)).toBe(true)
    expect(corpo.models.length).toBeGreaterThan(1)
    expect(corpo.model).toBeUndefined()
  })

  it('devolve o modelo que REALMENTE respondeu, não o primário pedido', async () => {
    // Com fallback, saber quem respondeu é o que permite ler custo depois.
    const fetchMock = vi.fn<typeof fetch>(async () =>
      resposta({ ...OK, model: 'openai/gpt-4o-mini' }),
    )
    const r = await new OpenRouter('chave', fetchMock).gerar('narrativa', {
      sistema: 's',
      usuario: 'u',
    })
    expect(r.modelo).toBe('openai/gpt-4o-mini')
    expect(r.tokensEntrada).toBe(120)
    expect(r.tokensSaida).toBe(30)
    expect(r.texto).toBe('Texto gerado.')
  })

  it('manda a credencial no cabeçalho Authorization', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => resposta(OK))
    await new OpenRouter('chave-secreta', fetchMock).gerar('chat', { sistema: 's', usuario: 'u' })
    const cabecalhos = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>
    expect(cabecalhos.Authorization).toBe('Bearer chave-secreta')
  })

  it('traduz 429 para limite-de-taxa e 402 para sem-saldo', async () => {
    for (const [status, motivo] of [
      [429, 'limite-de-taxa'],
      [402, 'sem-saldo'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => resposta({ error: 'x' }, status))
      const erro = await new OpenRouter('chave', fetchMock)
        .gerar('narrativa', { sistema: 's', usuario: 'u' })
        .catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(ErroLLM)
      expect((erro as ErroLLM).motivo).toBe(motivo)
    }
  })

  it('resposta sem texto vira resposta-invalida, não string vazia', async () => {
    // Deixar passar "" faria o card publicar uma narrativa em branco.
    const fetchMock = vi.fn<typeof fetch>(async () => resposta({ ...OK, choices: [] }))
    const erro = await new OpenRouter('chave', fetchMock)
      .gerar('narrativa', { sistema: 's', usuario: 'u' })
      .catch((e: unknown) => e)
    expect((erro as ErroLLM).motivo).toBe('resposta-invalida')
  })

  it('tenta UMA vez de novo em falha de transporte', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(resposta(OK))
    const r = await new OpenRouter('chave', fetchMock).gerar('narrativa', {
      sistema: 's',
      usuario: 'u',
    })
    expect(r.texto).toBe('Texto gerado.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('desiste depois do retry — não fica tentando para sempre', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'))
    await expect(
      new OpenRouter('chave', fetchMock).gerar('narrativa', { sistema: 's', usuario: 'u' }),
    ).rejects.toBeInstanceOf(ErroLLM)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('seleção por ambiente', () => {
  it('sem OPENROUTER_API_KEY devolve o FAKE — o app funciona sem chave', () => {
    expect(portaLLMDoAmbiente({} as NodeJS.ProcessEnv)).toBeInstanceOf(LLMFake)
  })

  it('com chave devolve o adapter real', () => {
    const porta = portaLLMDoAmbiente({ OPENROUTER_API_KEY: 'x' } as unknown as NodeJS.ProcessEnv)
    expect(porta).toBeInstanceOf(OpenRouter)
  })

  it('chave em branco conta como ausente', () => {
    // String vazia num painel de env é o acidente mais comum; tratar como
    // "tem chave" produziria 401 em produção em vez de cair no fake.
    expect(
      portaLLMDoAmbiente({ OPENROUTER_API_KEY: '   ' } as unknown as NodeJS.ProcessEnv),
    ).toBeInstanceOf(LLMFake)
  })
})
