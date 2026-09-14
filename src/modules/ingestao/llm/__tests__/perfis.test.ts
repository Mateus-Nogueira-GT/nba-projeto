import { describe, expect, it } from 'vitest'

import { LLMFake } from '../fake'
import { PERFIS, modelosDoPerfil, parametrosDoPerfil } from '../perfis'
import type { PerfilLLM } from '../porta'

const TODOS: PerfilLLM[] = ['narrativa', 'resumo', 'chat', 'admin']

describe('perfis de roteamento', () => {
  it('todo perfil tem ao menos um FALLBACK, não só o primário', () => {
    // O fallback é o motivo de usar OpenRouter: um modelo fora do ar não pode
    // derrubar a feature. Perfil com lista de um elemento é config incompleta.
    for (const perfil of TODOS) {
      expect(modelosDoPerfil(perfil).length, perfil).toBeGreaterThan(1)
    }
  })

  it('nenhum perfil repete modelo na cadeia de fallback', () => {
    // Repetir o mesmo modelo como fallback dele mesmo não é fallback nenhum.
    for (const perfil of TODOS) {
      const modelos = modelosDoPerfil(perfil)
      expect(new Set(modelos).size, perfil).toBe(modelos.length)
    }
  })

  it('todo perfil tem teto de tokens — texto sem limite é conta sem limite', () => {
    for (const perfil of TODOS) {
      const p = parametrosDoPerfil(perfil)
      expect(p.maxTokens, perfil).toBeGreaterThan(0)
      expect(p.temperatura, perfil).toBeGreaterThanOrEqual(0)
    }
  })

  it('narrativa e resumo cabem no limite do card (280 caracteres)', () => {
    // 280 caracteres ≈ 100 tokens em pt-BR. Pedir muito mais é pagar por texto
    // que o validador vai reprovar por tamanho.
    expect(parametrosDoPerfil('narrativa').maxTokens).toBeLessThanOrEqual(200)
    expect(parametrosDoPerfil('resumo').maxTokens).toBeLessThanOrEqual(400)
  })

  it('PERFIS cobre exatamente os quatro perfis, sem sobra', () => {
    expect(Object.keys(PERFIS).sort()).toEqual([...TODOS].sort())
  })
})

describe('adapter fake', () => {
  it('é determinístico: mesmo pedido, mesmo texto', async () => {
    const fake = new LLMFake()
    const pedido = { sistema: 's', usuario: 'Curry 20 pontos' }
    const a = await fake.gerar('narrativa', pedido)
    const b = await fake.gerar('narrativa', pedido)
    expect(a.texto).toBe(b.texto)
    expect(a.texto.length).toBeGreaterThan(0)
  })

  it('registra as chamadas para o teste inspecionar', async () => {
    const fake = new LLMFake()
    await fake.gerar('chat', { sistema: 's', usuario: 'oi' })
    expect(fake.chamadas).toHaveLength(1)
    expect(fake.chamadas[0]!.perfil).toBe('chat')
  })

  it('pode ser mandado a falhar — o caminho de erro precisa ser testável', async () => {
    const fake = new LLMFake({ falhar: true })
    await expect(fake.gerar('narrativa', { sistema: 's', usuario: 'x' })).rejects.toThrow()
  })
})

describe('os ids apontam para modelos que existem (medido em 14/09/2026)', () => {
  // `google/gemini-2.0-flash-001` e `anthropic/claude-3-5-haiku` saíram do
  // catálogo da OpenRouter. Eram o PRIMEIRO da fila de três perfis: as cadeias
  // de fallback, que existem para um modelo indisponível não derrubar a
  // feature, estavam reduzidas a um único modelo vivo.
  const MORTOS = ['google/gemini-2.0-flash-001', 'anthropic/claude-3-5-haiku']

  it('nenhum perfil referencia um id morto', () => {
    for (const [nome, perfil] of Object.entries(PERFIS))
      for (const morto of MORTOS) expect(perfil.modelos, nome).not.toContain(morto)
  })

  it('todo perfil tem pelo menos dois modelos — a cadeia de fallback é o ponto dela', () => {
    for (const [nome, perfil] of Object.entries(PERFIS))
      expect(perfil.modelos.length, nome).toBeGreaterThanOrEqual(2)
  })

  it('o chat usa o DeepSeek V4 Flash na frente', () => {
    expect(PERFIS.chat.modelos[0]).toBe('deepseek/deepseek-v4-flash')
  })
})
