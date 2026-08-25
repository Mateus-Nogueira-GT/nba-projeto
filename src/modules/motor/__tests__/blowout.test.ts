import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { emBlowout } from '../avisos/blowout'

// O ruleset REAL, como em toda a suíte âncora: sem fixture paralela.
const ruleset = carregarRuleset(yamlBruto)

const jogo4Q = (casa: number | null, visitante: number | null) => ({
  quartoAtual: 4,
  placarCasa: casa,
  placarVisitante: visitante,
})

describe('aviso de blowout', () => {
  it('25 de diferença no 4º quarto aciona', () => {
    expect(emBlowout(jogo4Q(110, 85), ruleset)).toBe(true)
  })

  it('24 de diferença não aciona', () => {
    expect(emBlowout(jogo4Q(110, 86), ruleset)).toBe(false)
  })

  it('o sinal da diferença não importa', () => {
    expect(emBlowout(jogo4Q(85, 110), ruleset)).toBe(true)
  })

  it('25 de diferença no 3º quarto não aciona', () => {
    expect(emBlowout({ quartoAtual: 3, placarCasa: 110, placarVisitante: 85 }, ruleset)).toBe(false)
  })

  it('jogo sem quarto corrente não aciona', () => {
    expect(emBlowout({ quartoAtual: null, placarCasa: 110, placarVisitante: 85 }, ruleset)).toBe(
      false,
    )
  })

  it('placar desconhecido não aciona', () => {
    expect(emBlowout(jogo4Q(null, null), ruleset)).toBe(false)
  })

  it('trocar o limiar no ruleset muda o resultado sem mudar código', () => {
    const alterado = structuredClone(ruleset)
    alterado.avisos.blowout.diferenca_pontos = 20
    expect(emBlowout(jogo4Q(110, 88), ruleset)).toBe(false)
    expect(emBlowout(jogo4Q(110, 88), alterado)).toBe(true)
  })
})
