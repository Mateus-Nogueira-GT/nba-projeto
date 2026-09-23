import { describe, expect, it, vi } from 'vitest'

/**
 * PORTÃO BARATO, ANTES DO BANCO (auditoria de 23/09).
 *
 * As telas de estatística resolviam ~10 consultas antes de pedir login. Sem
 * cookie de sessão nenhum, esse trabalho era desperdício — e carga de graça
 * para qualquer robô.
 */

const estado = vi.hoisted(() => ({ token: null as string | null, bancoUsado: false }))

vi.mock('../auth/cookies', () => ({
  tokenDaSessaoAtual: async () => estado.token,
  sessaoAtual: async () => null,
}))
vi.mock('../../dominio/db/cliente', () => ({
  getDb: () => {
    estado.bancoUsado = true
    throw new Error('não deveria tocar o banco')
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
}))

import { exigirCookieDeSessao } from '../assinatura/guarda'

describe('portão de cookie', () => {
  it('sem cookie, redireciona para entrar sem tocar o banco', async () => {
    estado.token = null
    await expect(exigirCookieDeSessao('/estatisticas/jogador/x')).rejects.toThrow(
      'REDIRECT /entrar?destino=%2Festatisticas%2Fjogador%2Fx',
    )
    expect(estado.bancoUsado).toBe(false)
  })

  it('com cookie, segue', async () => {
    estado.token = 'tok'
    await expect(exigirCookieDeSessao('/x')).resolves.toBeUndefined()
  })
})
