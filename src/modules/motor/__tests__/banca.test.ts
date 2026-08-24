import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { limitesDoDia, sugerirEntrada, valorDaUnidade } from '../gestao/banca'
import type { Ruleset } from '../ruleset/schema'

const ruleset = carregarRuleset(yamlBruto)

function semModelo(): Ruleset {
  const copia = structuredClone(ruleset)
  delete copia.gestao_banca
  return copia
}

describe('gestão de banca', () => {
  it('a unidade é o percentual da banca declarado no ruleset', () => {
    expect(valorDaUnidade(1000, ruleset)).toBe(10)
  })

  it('o nível do apito define quantas unidades entram', () => {
    expect(sugerirEntrada(1000, 1, false, ruleset)).toMatchObject({ unidades: 0.5, valor: 5 })
    expect(sugerirEntrada(1000, 2, false, ruleset)).toMatchObject({ unidades: 1, valor: 10 })
    expect(sugerirEntrada(1000, 3, false, ruleset)).toMatchObject({ unidades: 2, valor: 20 })
  })

  it('o turbo soma meia unidade, não multiplica', () => {
    const comTurbo = sugerirEntrada(1000, 3, true, ruleset)
    expect(comTurbo).toMatchObject({ unidades: 2.5, valor: 25, limitadoPeloTeto: false })
  })

  it('o teto por entrada corta o valor e diz que cortou', () => {
    const apertado = structuredClone(ruleset)
    apertado.gestao_banca!.teto_por_entrada_percentual = 1.0

    const entrada = sugerirEntrada(1000, 3, true, apertado)
    expect(entrada).toMatchObject({ unidades: 2.5, valor: 10, limitadoPeloTeto: true })
  })

  it('os limites de sessão saem do ruleset', () => {
    expect(limitesDoDia(1000, ruleset)).toEqual({
      stopWin: 100,
      stopLoss: 60,
      tetoPorEntrada: 30,
    })
  })

  it('sem o bloco no ruleset não existe sugestão — nunca um número inventado', () => {
    const sem = semModelo()
    expect(valorDaUnidade(1000, sem)).toBeNull()
    expect(sugerirEntrada(1000, 3, true, sem)).toBeNull()
    expect(limitesDoDia(1000, sem)).toBeNull()
  })

  it('trocar o modelo no YAML muda a sugestão sem tocar em código', () => {
    const outro = structuredClone(ruleset)
    outro.gestao_banca!.unidade_percentual_banca = 2.0
    outro.gestao_banca!.unidades_por_nivel_apito['3'] = 1.0

    expect(sugerirEntrada(1000, 3, false, outro)).toMatchObject({ unidades: 1, valor: 20 })
  })
})
