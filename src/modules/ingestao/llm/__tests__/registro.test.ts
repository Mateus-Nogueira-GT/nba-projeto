import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { llmChamadas } from '../../../dominio/db/schema'
import { registrarChamada } from '../registro'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 120_000)
afterAll(async () => banco.fechar())

describe('registro de chamadas de LLM', () => {
  it('grava sucesso com tokens — é o que responde "quanto está custando"', async () => {
    await registrarChamada(banco.db, {
      perfil: 'narrativa',
      modelo: 'google/gemini-2.0-flash-001',
      tokensEntrada: 120,
      tokensSaida: 30,
      ok: true,
      erro: null,
      duracaoMs: 800,
    })
    const linhas = await banco.db.select().from(llmChamadas)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.ok).toBe(true)
    expect(linhas[0]!.tokensSaida).toBe(30)
  })

  it('grava FALHA também — perfil que só falha precisa aparecer', async () => {
    // Registrar só o sucesso esconderia exatamente o que se quer investigar.
    await registrarChamada(banco.db, {
      perfil: 'chat',
      modelo: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      ok: false,
      erro: 'limite-de-taxa',
      duracaoMs: 15_000,
    })
    const falhas = (await banco.db.select().from(llmChamadas)).filter((l) => !l.ok)
    expect(falhas).toHaveLength(1)
    expect(falhas[0]!.erro).toBe('limite-de-taxa')
    expect(falhas[0]!.modelo).toBeNull()
  })

  it('registrar NUNCA lança — observabilidade não pode derrubar a feature', async () => {
    // Se gravar métrica quebrasse a publicação, a métrica viraria o risco.
    const bancoQuebrado = {
      insert: () => {
        throw new Error('banco fora')
      },
    } as unknown as typeof banco.db
    await expect(
      registrarChamada(bancoQuebrado, {
        perfil: 'admin',
        modelo: null,
        tokensEntrada: 0,
        tokensSaida: 0,
        ok: false,
        erro: 'x',
        duracaoMs: 1,
      }),
    ).resolves.toBeUndefined()
  })
})
