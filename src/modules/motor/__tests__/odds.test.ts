import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { agregar } from '../odds/agregar'

const ruleset = carregarRuleset(yamlBruto)

const casa = (nome: string, oddOver: number | null) => ({ casa: nome, oddOver })

describe('agregação de odds', () => {
  it('duas casas produzem faixa com mediana', () => {
    const faixa = agregar([casa('a', 1.5), casa('b', 1.7)], 'MVP', 'PONTOS', 25, ruleset)
    expect(faixa).toEqual({ min: 1.5, max: 1.7, mediana: 1.6, qtdCasas: 2, origem: 'CASAS' })
  })

  it('mediana de 3 casas resiste a outlier', () => {
    const faixa = agregar([casa('a', 1.5), casa('b', 1.55), casa('c', 9.0)], 'MVP', 'PONTOS', 25, ruleset)
    expect(faixa).toMatchObject({ mediana: 1.55, min: 1.5, max: 9.0, qtdCasas: 3, origem: 'CASAS' })
  })

  it('mediana de 5 casas é o valor central', () => {
    const faixa = agregar(
      [casa('a', 2.0), casa('b', 1.8), casa('c', 2.2), casa('d', 1.9), casa('e', 2.1)],
      'MVP',
      'PONTOS',
      30,
      ruleset,
    )
    expect(faixa?.mediana).toBe(2.0)
  })

  it('uma casa só cai para a tabela estática do ruleset', () => {
    const faixa = agregar([casa('a', 1.5)], 'MVP', 'PONTOS', 25, ruleset)
    // ruleset: MVP { 25: [1.30, 1.70] }
    expect(faixa).toEqual({ min: 1.3, max: 1.7, mediana: 1.5, qtdCasas: 0, origem: 'TABELA_ESTATICA' })
  })

  it('cotação sem odd de over não conta como casa', () => {
    const faixa = agregar([casa('a', 1.5), casa('b', null)], 'MVP', 'PONTOS', 25, ruleset)
    expect(faixa?.origem).toBe('TABELA_ESTATICA')
  })

  it('linha sem entrada na tabela estática devolve null', () => {
    expect(agregar([], 'MVP', 'PONTOS', 999, ruleset)).toBeNull()
  })

  it('trocar casas_minimas no ruleset muda o comportamento sem mudar código', () => {
    const alterado = structuredClone(ruleset)
    alterado.odds.casas_minimas = 3
    const duasCasas = [casa('a', 1.5), casa('b', 1.7)]
    expect(agregar(duasCasas, 'MVP', 'PONTOS', 25, ruleset)?.origem).toBe('CASAS')
    expect(agregar(duasCasas, 'MVP', 'PONTOS', 25, alterado)?.origem).toBe('TABELA_ESTATICA')
  })
})
