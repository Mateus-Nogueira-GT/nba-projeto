import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executarCronProtegido } from '../cron/guarda'

describe.sequential('guarda compartilhada dos crons', () => {
  const segredoAnterior = process.env.CRON_SECRET

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (segredoAnterior === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = segredoAnterior
  })

  it('segredo ausente responde 503 sem executar qualquer I/O', async () => {
    delete process.env.CRON_SECRET
    const tarefa = vi.fn(async () => ({ ok: true }))

    const resposta = await executarCronProtegido(new Request('https://app.test/api/cron/x'), {
      rota: '/api/cron/x',
      tarefa,
    })

    expect(resposta.status).toBe(503)
    expect(tarefa).not.toHaveBeenCalled()
  })

  it('bearer ausente ou incorreto responde 401 sem executar qualquer I/O', async () => {
    process.env.CRON_SECRET = 'correto'
    const tarefa = vi.fn(async () => ({ ok: true }))

    const semBearer = await executarCronProtegido(new Request('https://app.test/api/cron/x'), {
      rota: '/api/cron/x',
      tarefa,
    })
    const incorreto = await executarCronProtegido(
      new Request('https://app.test/api/cron/x', {
        headers: { authorization: 'Bearer incorreto' },
      }),
      { rota: '/api/cron/x', tarefa },
    )

    expect(semBearer.status).toBe(401)
    expect(incorreto.status).toBe(401)
    expect(tarefa).not.toHaveBeenCalled()
  })

  it('bearer correto chega ao serviço e retorna o resultado', async () => {
    process.env.CRON_SECRET = 'correto'
    const tarefa = vi.fn(async () => ({ processados: 3 }))

    const resposta = await executarCronProtegido(
      new Request('https://app.test/api/cron/x', {
        headers: { authorization: 'Bearer correto' },
      }),
      { rota: '/api/cron/x', tarefa, quantidade: (resultado) => resultado.processados },
    )

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ processados: 3 })
    expect(tarefa).toHaveBeenCalledOnce()
  })
})
