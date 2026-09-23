import { describe, expect, it, vi } from 'vitest'

import { criarPool, opcoesDoPool } from '../db/cliente'

describe('pool do banco', () => {
  it('o máximo vem de DB_POOL_MAX, com 5 como padrão', () => {
    expect(opcoesDoPool({}).max).toBe(5)
    expect(opcoesDoPool({ DB_POOL_MAX: '8' }).max).toBe(8)
    expect(opcoesDoPool({ DB_POOL_MAX: 'abc' }).max).toBe(5)
    expect(opcoesDoPool({ DB_POOL_MAX: '0' }).max).toBe(5)
    expect(opcoesDoPool({}).connectionTimeoutMillis).toBe(5_000)
  })

  it('erro de conexão ociosa é registrado, não derruba o processo', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // Pool não conecta até a primeira consulta: nada vai à rede aqui.
    const pool = criarPool('postgres://u:s@127.0.0.1:1/db', {})
    expect(pool.listenerCount('error')).toBe(1)
    expect(() => pool.emit('error', new Error('conexão ociosa caiu'))).not.toThrow()
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})
