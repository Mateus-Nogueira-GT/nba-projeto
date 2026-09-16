import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../../../modules/dominio/__tests__/ajuda-banco'
import { chatMensagens, usuarios } from '../../../../modules/dominio/db/schema'
import { LLMFake } from '../../../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../../../modules/plataforma/assinatura/nivel-do-plano'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let sessao: { usuarioId: string; email: string } | null = null
let nivelNoTeste: NivelDoPlano = 'MVP'
// Quando o banco cai no meio da avaliação de acesso: a rota tem de degradar
// para 503 legível, nunca subir como 500 cru (o painel traduz o motivo; um
// 500 sem corpo vira "fora do ar" por acidente, não por desenho).
let acessoLanca = false

// A PORTA COMPARTILHADA — o mesmo LLMFake que `portaLLMDoAmbiente()` devolve
// dentro da rota, para o teste contar `chamadas`. Sem isto, cada requisição
// instanciaria seu próprio fake e "a LLM não foi chamada" não teria como ser
// medido — só o status HTTP, que não prova gasto zero. `importOriginal`
// preserva `validarTexto`/`numerosDoTexto`, que `chat.ts` e `chat-contexto.ts`
// também importam deste módulo.
let llmFake = new LLMFake()

vi.mock('../../../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db }))
vi.mock('../../../../modules/plataforma/auth/cookies', () => ({ sessaoAtual: async () => sessao }))
vi.mock('../../../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../../../modules/plataforma/__tests__/acesso-de-teste')
  return {
    avaliarAcesso: async () => {
      if (acessoLanca) throw new Error('banco fora')
      return acessoDeTeste(nivelNoTeste)
    },
  }
})
vi.mock('../../../../modules/ingestao/llm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../modules/ingestao/llm')>()
  return { ...real, portaLLMDoAmbiente: () => llmFake }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  vi.stubEnv('CHAT_HABILITADO', 'true')
  banco = await bancoDeTeste()
  // `chat_mensagens.usuario_id` tem FK para `usuarios`: sem uma linha de
  // verdade aqui, a reserva de vaga dentro de `responder` estoura por erro de
  // banco, e o teste provaria uma falha de FK — nada sobre o status HTTP.
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'sem-assinatura@teste.com', senhaHash: 'x' })
    .returning()
  usuarioId = u!.id
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

// Todo estado mockado volta ao padrão a cada teste, env inclusive: uma
// restauração escrita no corpo do `it` não sobrevive a um `expect` que
// lança, e o teste seguinte falharia por um motivo que não é o dele — a
// mesma dívida de ordem que já existe em outros 28 testes do repositório, e
// que este arquivo não deve aumentar.
beforeEach(() => {
  sessao = { usuarioId, email: 'sem-assinatura@teste.com' }
  nivelNoTeste = 'MVP'
  acessoLanca = false
  llmFake = new LLMFake()
  vi.stubEnv('CHAT_HABILITADO', 'true')
  // Cotas generosas por padrão: os testes que não são SOBRE a cota não podem
  // esbarrar nela. O teste que testa a cota fixa os próprios valores, mais
  // apertados, e limpa `chat_mensagens` antes de medir.
  vi.stubEnv('CHAT_COTA_DIARIA_MVP', '1000')
  vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '1000')
})

const pedir = async (texto: string) => {
  const { POST } = await import('../route')
  return POST(
    new Request('http://local/api/chat', {
      method: 'POST',
      body: JSON.stringify({ texto }),
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('POST /api/chat', () => {
  it('sem sessão, 401', async () => {
    sessao = null
    expect((await pedir('oi')).status).toBe(401)
  })

  it('GRATIS recebe 403 com motivo nivel-insuficiente — e a LLM não é chamada', async () => {
    nivelNoTeste = 'GRATIS'
    const resposta = await pedir('quantas perguntas tenho por dia?')
    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toEqual({ erro: 'nivel-insuficiente' })
    // A prova de que uma conta que não paga não gasta: não é só o status —
    // é a porta de LLM nunca ter sido chamada nenhuma vez.
    expect(llmFake.chamadas).toHaveLength(0)
  })

  it('MVP entra — o assistente começa no MVP (spec, decisão 7)', async () => {
    expect((await pedir('como funciona a NIP?')).status).toBe(200)
  })

  it('com a flag desligada, 503 e nenhuma chamada paga', async () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    expect((await pedir('oi')).status).toBe(503)
  })

  it('com CHAT_HABILITADO ligada mas uma cota vazia, a API não atende (degradar, spec §14)', async () => {
    // As duas variáveis são obrigatórias; uma vazia não pode virar um número
    // inventado — vira "chat desligado", o mesmo 503 da flag desligada.
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '')
    const resposta = await pedir('oi')
    expect(resposta.status).toBe(503)
    expect(llmFake.chamadas).toHaveLength(0)
  })

  it('pergunta vazia é recusada antes de qualquer gasto', async () => {
    expect((await pedir('   ')).status).toBe(400)
  })

  it('a cota diária que vale é a do nível', async () => {
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '1')
    vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '2')
    await banco.db.delete(chatMensagens)

    nivelNoTeste = 'ALL_STAR'
    expect((await pedir('pergunta um')).status).toBe(200)
    expect((await pedir('pergunta dois')).status).toBe(200)
    const terceira = await pedir('pergunta três')
    expect(terceira.status).toBe(429)
    expect(await terceira.json()).toEqual({ erro: 'cota-esgotada' })

    // Limpa antes de medir o MVP: mesmo `usuarioId`, e a cota é por usuário —
    // sem isto, as duas perguntas do ALL_STAR acima já teriam esgotado o
    // teto de 1 do MVP antes da primeira pergunta desta segunda metade.
    await banco.db.delete(chatMensagens)
    nivelNoTeste = 'MVP'
    expect((await pedir('pergunta mvp um')).status).toBe(200)
    const segundaMvp = await pedir('pergunta mvp dois')
    expect(segundaMvp.status).toBe(429)
  })
})

describe('GET /api/chat — a conversa do dia (spec §7: o painel mostra a conversa, não só o que acabou de digitar)', () => {
  const ler = async () => {
    const { GET } = await import('../route')
    return GET()
  }

  it('sem sessão, 401', async () => {
    sessao = null
    expect((await ler()).status).toBe(401)
  })

  // A revisão final mediu que GRATIS recebe 403 também no GET, mas nenhum
  // teste cobria isso — remover aquele portão não deixava nada vermelho.
  // Mesmo molde do POST logo acima: contar `llmFake.chamadas`, não só o
  // status, porque é a prova de que uma conta que não paga não gasta.
  it('GRATIS recebe 403 com motivo nivel-insuficiente — e a LLM não é chamada', async () => {
    nivelNoTeste = 'GRATIS'
    const resposta = await ler()
    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toEqual({ erro: 'nivel-insuficiente' })
    expect(llmFake.chamadas).toHaveLength(0)
  })

  it('devolve a conversa de hoje do usuário, pergunta antes da resposta', async () => {
    // Uma pergunta real (porta fake, sem custo) para haver o que ler.
    expect((await pedir('o que é o Fire Live?')).status).toBe(200)
    const resposta = await ler()
    expect(resposta.status).toBe(200)
    const corpo = (await resposta.json()) as { mensagens: { papel: string; texto: string }[] }
    expect(corpo.mensagens.length).toBeGreaterThanOrEqual(2)
    const ultimas = corpo.mensagens.slice(-2)
    expect(ultimas[0]!.papel).toBe('USUARIO')
    expect(ultimas[0]!.texto).toBe('o que é o Fire Live?')
    expect(ultimas[1]!.papel).toBe('ASSISTENTE')
  })

  it('com a flag desligada, 503', async () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    expect((await ler()).status).toBe(503)
  })
})

describe('POST /api/chat — quando o banco cai antes de responder', () => {
  it('degrada para 503 com motivo, em vez de subir um 500 cru', async () => {
    acessoLanca = true
    const resposta = await pedir('oi')
    expect(resposta.status).toBe(503)
    expect(await resposta.json()).toEqual({ erro: 'indisponivel' })
  })
})
