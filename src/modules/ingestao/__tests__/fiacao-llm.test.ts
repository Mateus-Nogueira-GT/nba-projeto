import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * QUEM PUBLICA A LISTA PRECISA LEVAR A PORTA DE LLM JUNTO.
 *
 * A narrativa só é gerada na TRANSIÇÃO de hash: quem grava o snapshot
 * primeiro, sem `llm`, fixa o hash sem texto — e todo ciclo seguinte conclui
 * "não mudou" e nunca gera. Um único ponto de entrada esquecido deixa o dia
 * inteiro sem narrativa, sem erro nenhum aparecer.
 *
 * O script da demo é o caso que mais dói: é o que o operador roda À MÃO antes
 * de uma apresentação, e foi exatamente o que ficou para trás quando os crons
 * foram corrigidos. Só um teste de FIAÇÃO pega isso — ele não tem
 * comportamento observável para afirmar em runtime.
 */
const PONTOS_DE_ENTRADA = [
  'scripts/demo-seed.ts',
  'src/app/api/cron/demo/route.ts',
  'src/app/api/cron/lista-secreta/route.ts',
]

describe('fiação da porta de LLM', () => {
  it.each(PONTOS_DE_ENTRADA)('%s passa a porta de LLM adiante', (caminho) => {
    const fonte = readFileSync(caminho, 'utf8')
    expect(fonte, `${caminho} não importa portaLLMDoAmbiente`).toContain('portaLLMDoAmbiente')
    // Importar não basta: tem que CHAMAR e entregar o resultado.
    expect(fonte, `${caminho} importa mas não chama portaLLMDoAmbiente()`).toMatch(
      /portaLLMDoAmbiente\(\)/,
    )
  })

  it('o script da demo entrega a porta ao semearDemo, não a deixa no chão', () => {
    const fonte = readFileSync('scripts/demo-seed.ts', 'utf8')
    expect(fonte).toMatch(/semearDemo\([^\n]*portaLLMDoAmbiente\(\)/)
  })
})
