import { describe, expect, it } from 'vitest'

import { validarTexto } from '../../ingestao/llm'
import { CONHECIMENTO } from '../chat-conhecimento'

describe('CONHECIMENTO da plataforma', () => {
  // Mesma trava de `metodologia.test.ts`, pela mesma razão: o validador reprova
  // número que não esteja nos fatos, e um número que entra pelo texto fixo é um
  // número que o modelo repete e que o validador não reconhece — a resposta
  // certa seria descartada e a cota, gasta à toa.
  it('não tem dígito nenhum', () => {
    expect(CONHECIMENTO).not.toMatch(/\d/)
  })

  it('passa pelo próprio validador do produto', () => {
    // Não recolar a regex do validador à mão: o cabeçalho de `regras-do-texto.ts`
    // registra o dia em que o prompt da narrativa e o do chat proibiam palavras
    // diferentes e o validador reprovava os dois — a cópia à mão tinha divergido
    // do original. Rodar pelo `validarTexto` de verdade prende essa divergência
    // aqui também, e não só nos textos que ele já cobria.
    const r = validarTexto(CONHECIMENTO, { numeros: [], limiteCaracteres: CONHECIMENTO.length })
    expect(r.ok).toBe(true)
  })

  it('cobre os assuntos de suporte que o agente precisa responder', () => {
    for (const assunto of [
      '- ASSINATURA:',
      '- CONTA:',
      'FIRE LIVE:',
      'curadoria NIP',
      'nota de confiança',
      'STATS',
    ]) {
      // Rótulo de seção, não palavra solta: 'conta' e 'assinatura', por
      // exemplo, também aparecem soltas em frases sobre outro assunto (o
      // disclaimer de apostas, a lista de abas) — um `toContain` de palavra
      // solta passaria mesmo com o bloco de verdade apagado. Os rótulos vão em
      // CAIXA ALTA no texto (âncoras de prompt, deliberado); a comparação
      // ignora caixa para não travar por isso.
      expect(CONHECIMENTO.toLowerCase()).toContain(assunto.toLowerCase())
    }
  })

  it('manda dizer que não sabe em vez de inventar', () => {
    expect(CONHECIMENTO.toLowerCase()).toContain('não sabe')
  })
})
