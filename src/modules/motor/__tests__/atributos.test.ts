import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { calcularConfianca, linhasDoNivel } from '../confianca'
import { deltaOscilacao, marcosDoNivel, origemDoAtributo } from '../atributos'
import { limiarOscilacao } from '../lista-secreta/oscilacao'
import { marcosAtingidos } from '../fire-live/green'
import { agregar } from '../odds/agregar'
import { carregarRuleset } from '../ruleset/carregar'
import type { Ruleset } from '../ruleset/schema'

const ruleset = carregarRuleset(yamlBruto)

/** O ruleset sem nenhum bloco por atributo — o estado homologado puro. */
function soPontos(): Ruleset {
  const copia = structuredClone(ruleset)
  copia.por_atributo = {}
  return copia
}

describe('pontos não muda — o bloco homologado é intocável', () => {
  it('as linhas de MVP continuam sendo as da tabela do CJ', () => {
    expect(linhasDoNivel('MVP', 'PONTOS', ruleset)).toEqual([20, 25, 30, 35])
  })

  it('a âncora A15 sobrevive: MVP na linha 25, nível 3 → 94', () => {
    expect(calcularConfianca('MVP', 'PONTOS', 25, 3, ruleset)).toBe(94)
  })

  it('a exceção nominal do Luka continua valendo só em pontos', () => {
    expect(deltaOscilacao('MVP', 'PONTOS', 'luka-doncic', ruleset)).toBe(7)
    expect(deltaOscilacao('MVP', 'PONTOS', 'jokic', ruleset)).toBe(6)
  })

  it('pontos é declarado homologado', () => {
    expect(origemDoAtributo('PONTOS', ruleset)).toBe('homologado')
  })
})

describe('rebotes e assistências têm escala própria', () => {
  it('as linhas de rebotes não são linhas de pontos', () => {
    const rebotes = linhasDoNivel('MVP', 'REBOTES', ruleset)

    expect(rebotes).toEqual([8, 10, 12])
    // O defeito que este bloco corrige: antes, um MVP classificado em rebotes
    // recebia as linhas de PONTOS — "35 REBOTES" saía no card.
    expect(rebotes).not.toEqual(linhasDoNivel('MVP', 'PONTOS', ruleset))
  })

  it('o delta de rebotes é menor que o de pontos', () => {
    const rebotes = deltaOscilacao('MVP', 'REBOTES', 'jokic', ruleset)
    const pontos = deltaOscilacao('MVP', 'PONTOS', 'jokic', ruleset)

    expect(rebotes).toBe(3)
    expect(rebotes!).toBeLessThan(pontos!)
  })

  it('o limiar sai da média com o delta do atributo', () => {
    // Jokic, 12,9 rpg, MVP, delta 3 → 9,9
    expect(limiarOscilacao(12.9, 'MVP', 'REBOTES', 'jokic', ruleset)).toBeCloseTo(9.9, 10)
  })

  it('a confiança de assistências vem da tabela de assistências', () => {
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 1, ruleset)).toBe(85)
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 3, ruleset)).toBe(89)
  })

  it('green de rebotes usa os marcos de rebotes', () => {
    expect(marcosDoNivel('MVP', 'REBOTES', ruleset)).toEqual([10, 12, 15, 18, 20])
    expect(marcosAtingidos('MVP', 'REBOTES', 13, ruleset)).toEqual([10, 12])
  })

  it('a odd de fallback sai da tabela do atributo', () => {
    const faixa = agregar([], 'MVP', 'REBOTES', 10, ruleset)
    expect(faixa).toEqual({ min: 1.9, max: 2.4, mediana: 2.15, qtdCasas: 0, origem: 'TABELA_ESTATICA' })
  })

  it('são declarados como demonstração, não homologados', () => {
    expect(origemDoAtributo('REBOTES', ruleset)).toBe('demonstracao')
    expect(origemDoAtributo('ASSISTENCIAS', ruleset)).toBe('demonstracao')
  })
})

describe('sem bloco, o atributo simplesmente não existe', () => {
  const sem = soPontos()

  it('não oferece linha nenhuma', () => {
    expect(linhasDoNivel('MVP', 'REBOTES', sem)).toEqual([])
  })

  it('não calcula confiança', () => {
    expect(calcularConfianca('MVP', 'REBOTES', 10, 3, sem)).toBeNull()
  })

  it('não tem limiar, então a oscilação nem é avaliada', () => {
    expect(limiarOscilacao(12.9, 'MVP', 'REBOTES', 'jokic', sem)).toBeNull()
  })

  it('não gera green — nenhum push sai por engano', () => {
    expect(marcosAtingidos('MVP', 'REBOTES', 99, sem)).toEqual([])
  })

  it('mas pontos continua intacto', () => {
    expect(linhasDoNivel('MVP', 'PONTOS', sem)).toEqual([20, 25, 30, 35])
    expect(calcularConfianca('MVP', 'PONTOS', 25, 3, sem)).toBe(94)
  })
})
