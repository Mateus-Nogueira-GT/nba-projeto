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
  // `configuracaoChat().habilitado` também exige as DUAS cotas por nível
  // (spec §14): sem elas, o chat conta como desligado mesmo com a flag
  // ligada, e é exatamente esse degradar que o teste abaixo (env vazio)
  // verifica.
  vi.stubEnv('CHAT_COTA_DIARIA_MVP', '20')
  vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '60')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

describe('o botão do assistente na Moldura', () => {
  it('aparece nas telas com barra de abas, quando o nível dá direito', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: true, children: null }))
    expect(html).toContain('Abrir o assistente')
  })

  it('não aparece nas telas sem barra — detalhe e teoria não são o lugar dele', () => {
    const html = renderToStaticMarkup(Moldura({ aba: null, assistente: true, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })

  it('o botão é um botão de verdade, com rótulo acessível', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: true, children: null }))
    expect(html).toMatch(/<button[^>]*aria-label="Abrir o assistente"/)
  })

  it('com CHAT_HABILITADO desligada, a Moldura com aba não renderiza o botão', () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: true, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })

  it('sem `assistente` — o nível não dá — a Moldura com aba e flag ligada NÃO monta o botão', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: false, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })

  it('com CHAT_HABILITADO ligada mas uma cota vazia, o botão não é montado (degradar, spec §14)', () => {
    // As duas cotas são obrigatórias para `habilitado`, não só a flag — um
    // valor vazio é o acidente mais comum de env mal preenchido, e aqui vira
    // "sem botão" em vez de um botão que só sabe dizer "fora do ar".
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '')
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: true, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })
})
