import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Assistente, mensagemDeRecusa } from '@/features/assistente/Assistente'

/**
 * O SIXTH MAN AI NO FRONT V2 (Tarefa 10) — herdeiro do teste do botão da
 * Moldura antiga.
 *
 * O que a Moldura decidia (flag `CHAT_HABILITADO`, as duas cotas, o nível
 * MVP+) agora é decisão da CASCA, `src/app/(app)/layout.tsx`, e está provado
 * em `features/shell/__tests__/layout-do-app.test.tsx`. Aqui fica o que é do
 * WIDGET: o botão de verdade com nome acessível, o contrato com a NOSSA
 * `/api/chat` (JSON same-origin, que a rota exige desde a Onda 1) e a tradução
 * de cada recusa que a rota sabe devolver — um código de erro na tela seria o
 * defeito, não o diagnóstico.
 */

/** O código sem os comentários — para afirmar sobre o que RODA, não sobre a prosa. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('o botão do Sixth Man AI', () => {
  it('é um botão de verdade, com rótulo acessível e o nome homologado (D6)', () => {
    const html = renderToStaticMarkup(createElement(Assistente))
    expect(html).toMatch(/<button[^>]*aria-label="Abrir o Sixth Man AI"/)
    expect(html).not.toContain('Abrir o assistente')
  })

  it('só é montado pela casca quando o nível E a flag dão direito', () => {
    // A casca calcula `assistente` (MVP+ e chat ligado) e o widget nunca é
    // montado fora dessa condição — o teste do layout prova o cálculo; este
    // prova que o widget está atrás dele, e não solto no layout raiz.
    const casca = semComentarios(readFileSync('src/app/(app)/layout.tsx', 'utf8'))
    expect(casca).toMatch(/\{assistente && <Assistente \/>\}/)
    const raiz = semComentarios(readFileSync('src/app/layout.tsx', 'utf8'))
    expect(raiz).not.toContain('<Assistente')
  })

  it('a gaveta é um diálogo rotulado, com caixa de texto e botão de fechar nomeado', () => {
    // Herdado do `PainelChat.test.tsx` do front antigo (Tarefa 12): o leitor
    // de tela precisa saber que entrou numa conversa e como sai dela. A gaveta
    // só entra no DOM depois de aberta (estado do cliente), e o arnês não
    // hidrata — a prova é de fonte. Fechada, o HTML tem só o botão.
    const html = renderToStaticMarkup(createElement(Assistente))
    expect(html).not.toContain('role="dialog"')
    const fonte = semComentarios(readFileSync('src/features/assistente/Assistente.tsx', 'utf8'))
    expect(fonte).toMatch(/<aside[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="titulo-assistente"/)
    expect(fonte).toContain('id="titulo-assistente"')
    expect(fonte).toContain('<textarea')
    expect(fonte).toContain('aria-label="Fechar o Sixth Man AI"')
  })

  it('a gaveta abre por INTENÇÃO, não por foco: quem navega por Tab passa sem abrir', () => {
    // Herdado do `doca.test.ts` do front antigo (correções UX 19/09, §4.10).
    const fonte = semComentarios(readFileSync('src/features/assistente/Assistente.tsx', 'utf8'))
    expect(fonte).not.toContain('onFocus')
  })

  it('no desktop o botão flutuante some: a gaveta abre pela sidebar', () => {
    const css = readFileSync('src/features/assistente/Assistente.module.css', 'utf8')
    expect(css).toMatch(/\.flutuante\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{\s*\.flutuante:not\(\[hidden\]\)\s*\{[^}]*display:\s*inline-flex/)
  })
})

describe('o contrato com a nossa /api/chat', () => {
  // As duas chamadas do widget, na ordem da fonte: a leitura do histórico
  // (GET, ao abrir) e o envio (POST). Cada trecho vai até o fim do próprio
  // objeto de opções, não até a chamada seguinte.
  const fonte = semComentarios(readFileSync('src/features/assistente/Assistente.tsx', 'utf8'))
  const chamadas = fonte.split("fetch('/api/chat'").slice(1)
  const leitura = chamadas.find((c) => !c.includes("method: 'POST'")) ?? ''
  const envio = chamadas.find((c) => c.includes("method: 'POST'")) ?? ''

  it('o envio é POST JSON same-origin — a rota recusa qualquer outra coisa (403/415)', () => {
    expect(chamadas).toHaveLength(2)
    const bloco = envio.slice(0, envio.indexOf('})') + 2)
    expect(bloco).toContain("'content-type': 'application/json'")
    expect(bloco).toContain("credentials: 'same-origin'")
  })

  it('a leitura do histórico também vai com a sessão da origem', () => {
    const bloco = leitura.slice(0, leitura.indexOf(')') + 1)
    expect(bloco).toContain("credentials: 'same-origin'")
  })
})

describe('cada recusa da rota vira frase', () => {
  // Os motivos são os que `src/app/api/chat/route.ts` e
  // `modules/entrega/chat.ts` devolvem em `{ erro }`; nenhum pode vazar
  // como código na tela.
  it.each([
    ['sem-sessao', 401, /entre na sua conta/i],
    ['nivel-insuficiente', 403, /plano MVP/],
    ['cota-esgotada', 429, /perguntas de hoje/i],
    ['limite-por-minuto', 429, /alguns segundos/i],
    ['vazio', 400, /escreva a sua pergunta/i],
    ['muito-longa', 400, /comprida demais/i],
    ['fora-do-ar', 503, /fora do ar/i],
    ['desabilitado', 503, /fora do ar/i],
    ['indisponivel', 503, /fora do ar/i],
    ['origem-invalida', 403, /recarregue/i],
    ['tipo-invalido', 415, /recarregue/i],
  ])('%s (%d)', (motivo, status, frase) => {
    const texto = mensagemDeRecusa(status, motivo)
    expect(texto).toMatch(frase)
    expect(texto).not.toContain(motivo)
  })

  it('a cota esgotada diz que amanhã recomeça, em vez de só negar', () => {
    expect(mensagemDeRecusa(429, 'cota-esgotada').toLowerCase()).toContain('amanhã')
  })

  it('nenhuma frase soa técnica: nada de "erro", "falha", "500" ou "undefined"', () => {
    for (const motivo of [
      'sem-sessao',
      'nivel-insuficiente',
      'cota-esgotada',
      'limite-por-minuto',
      'vazio',
      'muito-longa',
      'fora-do-ar',
      'desabilitado',
      'indisponivel',
      'origem-invalida',
      'tipo-invalido',
      'algo-novo',
    ]) {
      expect(mensagemDeRecusa(503, motivo), motivo).not.toMatch(/erro|falha|500|undefined/i)
    }
  })

  it('sem corpo legível, o status decide: 401 é sessão, 403 é nível, 429 é ritmo', () => {
    expect(mensagemDeRecusa(401, undefined)).toMatch(/entre na sua conta/i)
    expect(mensagemDeRecusa(403, undefined)).toMatch(/plano MVP/)
    expect(mensagemDeRecusa(429, undefined)).toMatch(/alguns segundos/i)
    expect(mensagemDeRecusa(500, undefined)).toMatch(/fora do ar/i)
  })

  it('um motivo desconhecido cai na frase genérica, nunca no código', () => {
    const texto = mensagemDeRecusa(503, 'algo-novo')
    expect(texto).toMatch(/fora do ar/i)
    expect(texto).not.toContain('algo-novo')
  })
})
