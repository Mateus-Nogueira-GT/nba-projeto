import { describe, expect, it } from 'vitest'

import { bancoDeTeste } from './ajuda-banco'

describe('bancoDeTeste.fechar', () => {
  it('espera a consulta em voo antes de fechar — sem isso o worker gira para sempre', async () => {
    const banco = await bancoDeTeste()
    // Uma consulta que demora, disparada SEM await: é o estado em que um teste
    // que falha no meio de um Promise.all deixa o banco quando o afterAll roda.
    const emVoo = banco.pg.query('select pg_sleep(0.3)').catch(() => undefined)
    const inicio = Date.now()
    await banco.fechar()
    // Fechou DEPOIS da consulta, não durante: provado pelo tempo que esperou.
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(250)
    await emVoo
  }, 10_000)
})
