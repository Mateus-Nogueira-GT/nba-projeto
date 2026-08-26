import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { validarTexto } from '../../ingestao/llm'
import { METODOLOGIA } from '../metodologia'

describe('metodologia no prompt', () => {
  it('NÃO cita número nenhum', () => {
    // O validador reprova qualquer número que não esteja nos fatos DAQUELE
    // item. Um número que entra pela metodologia — "modo fire é 75% da média"
    // — é um número que o modelo repete e que o validador não reconhece: a
    // resposta certa seria descartada e o assinante leria "indisponível".
    expect(METODOLOGIA).not.toMatch(/\d/)
  })

  it('passa pelo próprio validador do produto', () => {
    // Se o texto que ENSINA o modelo já violasse as regras que ele vai
    // cobrar, a incoerência estaria dentro do prompt.
    const r = validarTexto(METODOLOGIA, { numeros: [], limiteCaracteres: METODOLOGIA.length })
    expect(r.ok).toBe(true)
  })

  it('cobre o vocabulário que o assinante pergunta', () => {
    // "o que é OPD?" tem que ter resposta sem a LLM inventar regra do CJ
    // (regra 3 do projeto).
    const texto = METODOLOGIA.toLowerCase()
    expect(texto).toContain('opd')
    expect(texto).toContain('oportunidade por desfalque')
    expect(texto).toContain('oscilação')
    expect(texto).toContain('randola')
    expect(texto).toContain('turbo')
    expect(texto).toContain('modo fire')
    expect(texto).toContain('nota de confiança')
  })

  it('não confunde os dois "níveis" nem estica o Fire Live', () => {
    expect(METODOLOGIA).toContain('Nível do JOGADOR')
    expect(METODOLOGIA).toContain('Nível do APITO')
    expect(METODOLOGIA.toLowerCase()).toContain('apenas no primeiro quarto')
    // A OPD exige desfalque em PREFIXO da hierarquia — a armadilha registrada
    // no CLAUDE.md. Ensinar errado aqui é ensinar errado ao assinante.
    expect(METODOLOGIA.toLowerCase()).toContain('prefixo da hierarquia')
  })

  it('os DOIS prompts a carregam', () => {
    for (const caminho of ['src/modules/entrega/narrativa.ts', 'src/modules/entrega/chat.ts']) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, `${caminho} não inclui a metodologia`).toContain('METODOLOGIA')
    }
  })
})
