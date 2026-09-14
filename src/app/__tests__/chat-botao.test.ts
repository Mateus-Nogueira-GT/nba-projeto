import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Moldura } from '../../components/navegacao/Moldura'

// A Moldura só monta o botão com CHAT_HABILITADO ligada (achado CRITICAL da
// revisão final do branch: sem a checagem, a flag desligada — como este
// trabalho termina — publicava em produção um botão que só sabe dizer "fora
// do ar"). Mesmo padrão de restauração de `src/app/api/chat/__tests__/rota.test.ts`:
// o `beforeEach` religa a flag antes de CADA teste, nunca o corpo do teste —
// dívida de testes que dependem de ordem é coisa que este arquivo não pode
// aumentar.
beforeEach(() => {
  vi.stubEnv('CHAT_HABILITADO', 'true')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

describe('o botão do assistente na Moldura', () => {
  it('aparece nas telas com barra de abas', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', children: null }))
    expect(html).toContain('Abrir o assistente')
  })

  it('não aparece nas telas sem barra — detalhe e teoria não são o lugar dele', () => {
    const html = renderToStaticMarkup(Moldura({ aba: null, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })

  it('o botão é um botão de verdade, com rótulo acessível', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', children: null }))
    expect(html).toMatch(/<button[^>]*aria-label="Abrir o assistente"/)
  })

  it('com CHAT_HABILITADO desligada, a Moldura com aba não renderiza o botão', () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })
})
