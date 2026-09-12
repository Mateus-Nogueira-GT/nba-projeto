import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'
import { carregarRuleset } from '../ruleset/carregar'
import { faixaDaConfianca } from '../confianca'

const ruleset = carregarRuleset(yamlBruto)

describe('faixa de confiança exibida', () => {
  it('mapeia as bordas exatas de cada faixa', () => {
    // O RÓTULO vem do ruleset, nunca de um literal aqui: trocá-lo no YAML não
    // pode quebrar teste (regra 1). O que este teste trava são as BORDAS.
    const rotuloDo = (grau: number) =>
      ruleset.confianca_exibicao.faixas.find((f) => f.grau === grau)!.rotulo
    expect(faixaDaConfianca(80, ruleset)).toEqual({ grau: 1, rotulo: rotuloDo(1) })
    expect(faixaDaConfianca(82.9, ruleset)?.grau).toBe(1)
    expect(faixaDaConfianca(83, ruleset)?.grau).toBe(2)
    expect(faixaDaConfianca(86, ruleset)?.grau).toBe(3)
    expect(faixaDaConfianca(89, ruleset)?.grau).toBe(4)
    expect(faixaDaConfianca(93, ruleset)).toEqual({ grau: 5, rotulo: rotuloDo(5) })
    expect(faixaDaConfianca(95, ruleset)?.grau).toBe(5)
  })

  it('abaixo da primeira faixa cai no grau 1; null não tem faixa', () => {
    expect(faixaDaConfianca(60, ruleset)?.grau).toBe(1)
    expect(faixaDaConfianca(null, ruleset)).toBeNull()
  })

  it('trocar limiar no YAML muda a faixa sem mudar código', () => {
    const alterado = structuredClone(ruleset)
    alterado.confianca_exibicao.faixas = [
      { de: 0, grau: 1, rotulo: 'BAIXA' },
      { de: 90, grau: 5, rotulo: 'MÁXIMA' },
    ]
    expect(faixaDaConfianca(85, alterado)?.grau).toBe(1)
    expect(faixaDaConfianca(91, alterado)?.grau).toBe(5)
  })
})
