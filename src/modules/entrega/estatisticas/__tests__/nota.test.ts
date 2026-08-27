import { describe, expect, it } from 'vitest'

import { gameScore, notaDaPartida, MINUTOS_MINIMOS, type LinhaDeBox } from '../nota'

/** Linha neutra: tudo zero, para os testes mexerem só no que importa. */
function linha(parcial: Partial<LinhaDeBox> = {}): LinhaDeBox {
  return {
    minutos: 30,
    pontos: 0,
    cestasC: 0,
    cestasT: 0,
    lanceC: 0,
    lanceT: 0,
    rebotesOf: 0,
    rebotesDef: 0,
    roubos: 0,
    assistencias: 0,
    bloqueios: 0,
    faltas: 0,
    turnovers: 0,
    ...parcial,
  }
}

describe('game score', () => {
  it('confere com a conta feita à mão', () => {
    // 20 pts, 8/15 de quadra, 4/5 de lance, 2 of + 6 def, 1 roubo, 5 ast,
    // 1 toco, 3 faltas, 2 turnovers.
    //   20 + 0.4*8 - 0.7*15 - 0.4*(5-4) + 0.7*2 + 0.3*6 + 1 + 0.7*5 + 0.7*1
    //      - 0.4*3 - 2
    // = 20 + 3.2 - 10.5 - 0.4 + 1.4 + 1.8 + 1 + 3.5 + 0.7 - 1.2 - 2 = 17.5
    const g = gameScore(
      linha({
        pontos: 20,
        cestasC: 8,
        cestasT: 15,
        lanceC: 4,
        lanceT: 5,
        rebotesOf: 2,
        rebotesDef: 6,
        roubos: 1,
        assistencias: 5,
        bloqueios: 1,
        faltas: 3,
        turnovers: 2,
      }),
    )
    expect(g).toBeCloseTo(17.5, 5)
  })

  it('linha zerada é game score zero', () => {
    expect(gameScore(linha())).toBe(0)
  })

  it('arremesso errado PESA contra — tentar não é o mesmo que acertar', () => {
    // 0/10 de quadra sem nenhum ponto é a pior linha possível de ataque.
    expect(gameScore(linha({ cestasT: 10 }))).toBeCloseTo(-7, 5)
  })
})

describe('nota da partida', () => {
  it('o desempenho de referência (game score 10) vale 6,5', () => {
    // Titular mediano. 10 pontos com 5/10 é game score exatamente 10:
    //   10 + 0.4*5 - 0.7*10 = 10 + 2 - 7 = 5 ... então soma-se rebote:
    // usa-se pontos direto para não depender de conta longa.
    const nota = notaDaPartida(linha({ pontos: 10 }))
    // game score 10 -> 6.5
    expect(nota).toBeCloseTo(6.5, 5)
  })

  it('jogo grande sobe a nota, jogo apagado desce', () => {
    const grande = notaDaPartida(linha({ pontos: 30 }))!
    const apagado = notaDaPartida(linha({ pontos: 2 }))!
    expect(grande).toBeGreaterThan(6.5)
    expect(apagado).toBeLessThan(6.5)
  })

  it('nunca sai da escala 3..10, por pior ou melhor que seja', () => {
    // Uma atuação absurda não vira 12; um desastre não vira 0.
    const absurda = notaDaPartida(linha({ pontos: 200 }))!
    const desastre = notaDaPartida(linha({ cestasT: 100, turnovers: 30 }))!
    expect(absurda).toBe(10)
    expect(desastre).toBe(3)
  })

  it('menos de 5 minutos NÃO tem nota — é ruído, não desempenho', () => {
    // Quem entrou no lixo-time do último quarto não é comparável com quem
    // jogou 35 minutos. Nota aqui enganaria mais do que informaria.
    expect(notaDaPartida(linha({ minutos: 4.9, pontos: 6 }))).toBeNull()
    expect(notaDaPartida(linha({ minutos: MINUTOS_MINIMOS, pontos: 6 }))).not.toBeNull()
  })

  it('minutos ausentes NÃO tem nota', () => {
    // Sem minutos não dá para saber se o desempenho é comparável.
    expect(notaDaPartida(linha({ minutos: null, pontos: 20 }))).toBeNull()
  })

  it('é monotônica em pontos: marcar mais nunca baixa a nota', () => {
    // Propriedade que protege contra erro de sinal na fórmula.
    let anterior = -Infinity
    for (let pontos = 0; pontos <= 40; pontos += 2) {
      const nota = notaDaPartida(linha({ pontos }))!
      expect(nota).toBeGreaterThanOrEqual(anterior)
      anterior = nota
    }
  })

  it('arredonda para UMA casa — a tela imprime o que a função devolve', () => {
    // Sem isto, 6.949999 viraria "6,9" na tela e 6.95 no teste seguinte.
    const nota = notaDaPartida(linha({ pontos: 13, assistencias: 3 }))!
    expect(Number(nota.toFixed(1))).toBe(nota)
  })
})
