import { describe, expect, it } from 'vitest'

import { historicoOscilacao, mediaDe, posicaoDe } from '../demo/dados'

describe('helpers determinísticos da demonstração', () => {
  it('a posição é estável e cobre G, F e C', () => {
    const nomes = ['Luka Doncic', 'Jokic', 'Curry', 'Wembayama', 'Tatum', 'Embid', 'Sengun']
    const posicoes = nomes.map(posicaoDe)
    expect(posicoes.every((p) => ['G', 'F', 'C'].includes(p))).toBe(true)
    // Reexecução do seed não pode mudar a posição de ninguém.
    expect(nomes.map(posicaoDe)).toEqual(posicoes)
    expect(new Set(posicoes).size).toBeGreaterThan(1)
  })

  it('usa os números que o documento do CJ declara', () => {
    // "Shai Gilgeous-Alexander é nivel MVP em pontos, pois tem uma média de 31 ppg"
    expect(mediaDe('Shai', 'MVP').ppg).toBe(31)
    // "Nikola Jokic é nivel MVP em Rebotes, pois tem média de 12.9 RPG"
    expect(mediaDe('Jokic', 'MVP').rpg).toBe(12.9)
    // "Karl Anthony towns é nivel all star em pontos... média de 20 ppg"
    expect(mediaDe('Towns', 'ALL_STAR').ppg).toBe(20)
    // "Aaron gordon é nivel suporte em pontos, pois tem média de 16 ppg"
    expect(mediaDe('Gordon', 'SUPORTE').ppg).toBe(16)
    // "Simone fontecchio é nivel randola pois tem media de 8,5 pontos"
    expect(mediaDe('Fontenchhio', 'RANDOLA').ppg).toBe(8.5)
    // "Jamal murray é nivel all star em assistências pois tem uma média de 7 apg"
    expect(mediaDe('Jamal Murray', 'ALL_STAR').apg).toBe(7)
    // "A média do lebron sendo 25,7 ppg"
    expect(mediaDe('LeBron James', 'SUPORTE').ppg).toBe(25.7)
  })

  it('nome desconhecido cai na faixa do nível e é estável', () => {
    const faixas: Record<string, [number, number]> = {
      MVP: [27, 31],
      ALL_STAR: [18, 23],
      SUPORTE: [11, 16],
      RANDOLA: [5, 9],
    }
    for (const [nivel, [min, max]] of Object.entries(faixas)) {
      const m = mediaDe('Jogador Inventado da Demo', nivel as keyof typeof faixas)
      expect(m.ppg).toBeGreaterThanOrEqual(min)
      expect(m.ppg).toBeLessThanOrEqual(max)
      expect(mediaDe('Jogador Inventado da Demo', nivel as keyof typeof faixas)).toEqual(m)
    }
  })

  it('histórico de oscilação produz a sequência exata que o motor precisa', () => {
    // LeBron: média 25,7 · delta 5 → limiar 20,7 · 1 jogo abaixo = nível 1
    const h = historicoOscilacao(25.7, 5, 1)
    expect(h[0]!).toBeLessThanOrEqual(20.7)
    expect(h.slice(1).every((p) => p > 20.7)).toBe(true)

    // 3 jogos abaixo = nível 3 (o mais recente primeiro)
    const h3 = historicoOscilacao(30, 6, 3)
    expect(h3.slice(0, 3).every((p) => p <= 24)).toBe(true)
    expect(h3[3]!).toBeGreaterThan(24)
  })

  it('nunca devolve pontuação negativa', () => {
    expect(historicoOscilacao(5, 4, 3).every((p) => p >= 0)).toBe(true)
  })
})
