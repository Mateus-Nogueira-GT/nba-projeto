import { describe, expect, it } from 'vitest'

import { configuracaoChat } from '../chat-limites'

/**
 * `configuracaoChat` isolado de banco e de LLM — é config pura sobre
 * `NodeJS.ProcessEnv`, por isso mora num arquivo à parte de `chat.test.ts`
 * (que precisa de banco de verdade). Ver o comentário de `chat-limites.ts`.
 */
describe('configuracaoChat por nível', () => {
  it('com as duas cotas, liga e devolve cada uma', () => {
    const c = configuracaoChat({
      CHAT_HABILITADO: 'true',
      CHAT_COTA_DIARIA_MVP: '20',
      CHAT_COTA_DIARIA_ALL_STAR: '60',
    } as unknown as NodeJS.ProcessEnv)
    expect(c).toEqual({ habilitado: true, cotaDiariaPorNivel: { MVP: 20, ALL_STAR: 60 } })
  })

  it('cota faltando = chat DESLIGADO, não um padrão inventado (spec §14)', () => {
    expect(
      configuracaoChat({
        CHAT_HABILITADO: 'true',
        CHAT_COTA_DIARIA_MVP: '20',
      } as unknown as NodeJS.ProcessEnv).habilitado,
    ).toBe(false)
    expect(
      configuracaoChat({
        CHAT_HABILITADO: 'true',
        CHAT_COTA_DIARIA_MVP: 'x',
        CHAT_COTA_DIARIA_ALL_STAR: '60',
      } as unknown as NodeJS.ProcessEnv).habilitado,
    ).toBe(false)
    expect(
      configuracaoChat({
        CHAT_HABILITADO: 'true',
        CHAT_COTA_DIARIA_MVP: '0',
        CHAT_COTA_DIARIA_ALL_STAR: '60',
      } as unknown as NodeJS.ProcessEnv).habilitado,
    ).toBe(false)
  })

  it('a flag desligada vence, mesmo com as cotas', () => {
    expect(
      configuracaoChat({
        CHAT_HABILITADO: 'nao',
        CHAT_COTA_DIARIA_MVP: '20',
        CHAT_COTA_DIARIA_ALL_STAR: '60',
      } as unknown as NodeJS.ProcessEnv).habilitado,
    ).toBe(false)
  })
})
