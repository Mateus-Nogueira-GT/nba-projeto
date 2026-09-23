import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O CRON DA DEMO NÃO SEMEIA MAIS: ELE AVANÇA A TEMPORADA.
 *
 * Aqui não sobe PGlite. O que precisa ser verdade nesta fronteira é fiação —
 * a guarda `DEMO_AUTOSSEMEADURA`, o orçamento que cabe no `maxDuration`, a
 * porta de LLM entregue e o resumo devolvido ao operador. O comportamento de
 * `simularAte` tem a suíte de integração dele (`ingestao/__tests__/temporada`).
 */

const RESUMO = {
  inicio: '2026-07-20',
  hoje: '2026-09-07',
  diasProduzidos: 1,
  diasRestantes: 0,
  jogosCriados: 7,
  boxScores: 96,
  publicacoes: 1,
  jogosHoje: 7,
  itensListaSecreta: 42,
  apitosFireLive: 3,
  linhasComOdd: 42,
  classificados: 30,
  times: 30,
  jogadores: 230,
  versaoNiveis: 'lista-cj-2025-26',
}

const mocks = vi.hoisted(() => ({
  db: { teste: true },
  ruleset: { rodada: { fuso: 'America/Sao_Paulo' } },
  porta: { nome: 'llm-de-mentira' },
  simularAte: vi.fn(),
  revalidateTag: vi.fn(),
}))

const guarda = vi.hoisted(() => ({ motivo: null as string | null }))
vi.mock('@/modules/ingestao/demo/autossemeadura', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/modules/ingestao/demo/autossemeadura')>()
  return { ...real, motivoParaNaoSemear: async () => guarda.motivo }
})
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => mocks.db }))
vi.mock('@/modules/entrega/ruleset-ativo', () => ({ rulesetAtivo: async () => mocks.ruleset }))
vi.mock('@/modules/ingestao/llm', () => ({ portaLLMDoAmbiente: () => mocks.porta }))
vi.mock('@/modules/ingestao/demo/temporada', () => ({ simularAte: mocks.simularAte }))
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  // `leitura.ts` chama `unstable_cache` ao ser importado (a rota importa
  // `TAG_LATERAL` de lá); devolver a função crua é o bastante — este teste
  // não lê a lateral.
  unstable_cache: (fn: unknown) => fn,
}))

import { GET, maxDuration } from '../route'

describe.sequential('/api/cron/demo', () => {
  const ambiente = { ...process.env }
  let registros: string[] = []

  beforeEach(() => {
    registros = []
    vi.spyOn(console, 'info').mockImplementation((linha: unknown) => {
      registros.push(String(linha))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.simularAte.mockReset()
    mocks.simularAte.mockResolvedValue(RESUMO)
    mocks.revalidateTag.mockReset()
    guarda.motivo = null
    process.env.CRON_SECRET = 'segredo'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ambiente }
  })

  const pedir = () =>
    GET(
      new Request('https://app.test/api/cron/demo', {
        headers: { authorization: 'Bearer segredo' },
      }),
    )

  it('sem DEMO_AUTOSSEMEADURA pula sem tocar na temporada', async () => {
    delete process.env.DEMO_AUTOSSEMEADURA

    const resposta = await pedir()

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({
      executado: false,
      motivo: 'DEMO_AUTOSSEMEADURA_DESLIGADA',
    })
    expect(mocks.simularAte).not.toHaveBeenCalled()
  })

  it('com a variável ligada avança a temporada com o orçamento e a porta de LLM', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'

    const resposta = await pedir()

    expect(resposta.status).toBe(200)
    expect(mocks.simularAte).toHaveBeenCalledTimes(1)
    expect(mocks.simularAte).toHaveBeenCalledWith(mocks.db, mocks.ruleset, expect.any(Date), {
      llm: mocks.porta,
      orcamentoMs: 240_000,
    })
  })

  it('depois de avançar a temporada, invalida a lateral — que é cacheada por uma hora', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'

    await pedir()

    expect(mocks.revalidateTag).toHaveBeenCalledWith('lateral', 'max')
    expect(mocks.revalidateTag).toHaveBeenCalledWith('feed', 'max')
    // depois de simular, não antes
    expect(mocks.simularAte.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.revalidateTag.mock.invocationCallOrder[0]!,
    )
  })

  it('com dado real no banco, não chama simularAte — mesmo com a variável ligada', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    guarda.motivo = 'DADO_REAL_PRESENTE'

    const resposta = await pedir()

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ executado: false, motivo: 'DADO_REAL_PRESENTE' })
    expect(mocks.simularAte).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('pular (sem a variável) não invalida nada', async () => {
    delete process.env.DEMO_AUTOSSEMEADURA

    await pedir()

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('o orçamento deixa folga para o resumo sair antes do corte da Vercel', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'

    await pedir()

    const opcoes = mocks.simularAte.mock.calls[0]![3] as { orcamentoMs: number }
    // A folga é o que garante que a função devolva 200 com o resumo em vez de
    // ser cortada no meio do último dia. Se `maxDuration` mudar, o orçamento
    // tem de mudar junto — este teste é o lembrete.
    expect(maxDuration).toBe(300)
    expect(opcoes.orcamentoMs).toBeLessThanOrEqual((maxDuration - 30) * 1000)
  })

  it('devolve o resumo inteiro — inclusive os dias que ainda faltam', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    mocks.simularAte.mockResolvedValue({ ...RESUMO, diasProduzidos: 3, diasRestantes: 12 })

    const resposta = await pedir()

    expect(await resposta.json()).toMatchObject({
      executado: true,
      resumo: { diasProduzidos: 3, diasRestantes: 12, itensListaSecreta: 42 },
    })
  })

  it('a quantidade registrada é o que ESTA execução produziu: dias', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    mocks.simularAte.mockResolvedValue({ ...RESUMO, diasProduzidos: 3, diasRestantes: 12 })

    await pedir()

    const concluido = registros
      .map((linha) => JSON.parse(linha) as { evento: string; quantidade: number | null })
      .find((r) => r.evento === 'cron_concluido')
    // `itensListaSecreta` é ESTADO da rodada de hoje e repete o mesmo número na
    // segunda execução do dia — no log de um cron isso se lê como trabalho
    // feito duas vezes. Dias produzidos é o que a execução de fato fez.
    expect(concluido?.quantidade).toBe(3)
  })

  it('pular também aparece no log, com quantidade zero', async () => {
    delete process.env.DEMO_AUTOSSEMEADURA

    await pedir()

    const concluido = registros
      .map((linha) => JSON.parse(linha) as { evento: string; quantidade: number | null })
      .find((r) => r.evento === 'cron_concluido')
    expect(concluido?.quantidade).toBe(0)
  })
})
