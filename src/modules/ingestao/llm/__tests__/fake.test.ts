import { describe, expect, it } from 'vitest'

import { LLMFake } from '../fake'
import { validarTexto } from '../validador'

const SISTEMA = 'instrução idêntica para todos os itens'

async function narrar(usuario: string): Promise<string> {
  const r = await new LLMFake().gerar('narrativa', { sistema: SISTEMA, usuario })
  return r.texto
}

describe('LLMFake — texto de demonstração', () => {
  it('o MESMO pedido devolve sempre o mesmo texto', async () => {
    // Determinismo é contrato: sem chave, o fake é quem escreve o snapshot da
    // demo, e texto sorteado mudaria o conteúdo a cada publicação.
    const a = await narrar('Jogador: LeBron James (LAL, nível MVP)')
    const b = await narrar('Jogador: LeBron James (LAL, nível MVP)')
    expect(a).toBe(b)
  })

  it('pedidos DIFERENTES devolvem textos diferentes — a lista não vira eco', async () => {
    // O ambiente de demonstração roda sem OPENROUTER_API_KEY, portanto sempre
    // no fake. Uma frase só para os quase cinquenta cards imprime a mesma
    // linha em itálico embaixo de todos eles, e isso lê como defeito.
    const fatos = Array.from({ length: 12 }, (_, i) => `Jogador: Atleta ${i} (TIM, nível MVP)`)
    const textos = await Promise.all(fatos.map(narrar))
    expect(new Set(textos).size).toBeGreaterThan(1)
  })

  it('nenhuma frase cita número — o validador reprovaria o que o fake inventasse', async () => {
    // O fake não conhece os fatos do item, então qualquer número que ele
    // escrevesse seria "número inventado" para o validador, e a narrativa
    // sumiria da tela justamente no ambiente em que ela deveria aparecer.
    const fatos = Array.from({ length: 30 }, (_, i) => `Jogador: Atleta ${i}`)
    for (const usuario of fatos) {
      const texto = await narrar(usuario)
      // Sem número nenhum permitido: só passa quem não cita número.
      expect(validarTexto(texto, { numeros: [], limiteCaracteres: 280 }).ok).toBe(true)
    }
  })

  it('cada perfil fala do seu assunto', async () => {
    const resumo = await new LLMFake().gerar('resumo', { sistema: SISTEMA, usuario: 'x' })
    const chat = await new LLMFake().gerar('chat', { sistema: SISTEMA, usuario: 'x' })
    expect(resumo.texto).not.toBe(chat.texto)
  })
})
