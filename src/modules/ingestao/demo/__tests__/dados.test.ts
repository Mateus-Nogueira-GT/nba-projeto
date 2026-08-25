import { describe, expect, it } from 'vitest'

import { nomeDeExibicao, posicaoDe, rodadaDoDia } from '../dados'

const TIMES = ['OKC', 'DEN', 'LAL', 'PHI', 'GSW', 'BOS', 'MIA', 'NYK'] as const

describe('rodízio de confrontos da demonstração', () => {
  it('toda rodada usa os oito times, uma vez cada', () => {
    for (let r = 0; r < 7; r++) {
      const pares = rodadaDoDia(TIMES, r)
      expect(pares).toHaveLength(4)
      expect(new Set(pares.flat())).toEqual(new Set(TIMES))
    }
  })

  it('sete rodadas seguidas NÃO repetem confronto (a regressão)', () => {
    // O histórico repetia os mesmos quatro jogos todo dia: GSW × BOS sete
    // vezes seguidas, duas com placar idêntico.
    const vistos = new Set<string>()
    for (let r = 0; r < 7; r++) {
      for (const [a, b] of rodadaDoDia(TIMES, r)) {
        const chave = [a, b].sort().join('|')
        expect(vistos.has(chave)).toBe(false)
        vistos.add(chave)
      }
    }
    expect(vistos.size).toBe(28)
  })

  it('é determinístico: mesma rodada, mesmos pares', () => {
    expect(rodadaDoDia(TIMES, 3)).toEqual(rodadaDoDia(TIMES, 3))
  })

  it('número ímpar de times é erro, não silêncio', () => {
    expect(() => rodadaDoDia(['A', 'B', 'C'], 0)).toThrow(/PAR/)
  })
})

describe('posição do jogador', () => {
  it('quem o CJ nomeia recebe a posição REAL, não o hash', () => {
    // O hash escalava Curry de pivô e Giannis de armador.
    expect(posicaoDe('stephen Curry')).toBe('G')
    expect(posicaoDe('Giannis')).toBe('F')
    expect(posicaoDe('Jokic')).toBe('C')
    expect(posicaoDe('LeBron James')).toBe('F')
  })

  it('quem não está na tabela cai no hash, e o hash é estável', () => {
    expect(posicaoDe('Fulano Desconhecido')).toBe(posicaoDe('Fulano Desconhecido'))
    expect(['G', 'F', 'C']).toContain(posicaoDe('Fulano Desconhecido'))
  })
})

describe('nome de exibição', () => {
  it('sobe a inicial de palavra minúscula', () => {
    expect(nomeDeExibicao('stephen Curry')).toBe('Stephen Curry')
    expect(nomeDeExibicao('podzienki')).toBe('Podzienki')
    expect(nomeDeExibicao('luka doncic')).toBe('Luka Doncic')
  })

  it('NÃO estraga maiúscula no meio da palavra', () => {
    // Title-case ingênuo transformaria LeBron em Lebron.
    expect(nomeDeExibicao('LeBron James')).toBe('LeBron James')
    expect(nomeDeExibicao('DeMar DeRozan')).toBe('DeMar DeRozan')
  })

  it('NÃO corrige a grafia do CJ — isso é pergunta, não palpite', () => {
    expect(nomeDeExibicao('Porzigins')).toBe('Porzigins')
    expect(nomeDeExibicao('Kesller')).toBe('Kesller')
  })
})
