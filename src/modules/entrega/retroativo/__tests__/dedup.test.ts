import { describe, expect, it } from 'vitest'

import type { Apito } from '../../../motor/tipos'
import { chaveDeApito, primeiroDeCada } from '../executar'

const fire = (jogoId: string, jogadorId: string, alvo1Q: number): Apito =>
  ({
    jogoId,
    jogadorId,
    atributo: 'PONTOS',
    estrategia: 'FIRE_LIVE',
    metodo: null,
    nivelJogador: 'MVP',
    nivelApito: 1,
    turbo: false,
    modoFire: false,
    opdOrigemNivel: null,
    linha: null,
    confianca: null,
    alvo1Q,
  }) as unknown as Apito

describe('dois jogos do mesmo time na rodada (08/11/2025)', () => {
  it('o apito repetido pela chave da regra 5 sai; fica o primeiro', () => {
    // DEN×GSW (da noite anterior, meia-noite de Brasília) e DEN×IND na mesma
    // rodada: o motor emitiu duas vezes o mesmo Fire Live do mesmo jogo.
    const apitos = [fire('DEN-IND', 'jokic', 9), fire('DEN-IND', 'jokic', 9), fire('DEN-GSW', 'jokic', 9)]

    const unicos = primeiroDeCada(apitos, chaveDeApito)

    expect(unicos.map((a) => a.jogoId)).toEqual(['DEN-IND', 'DEN-GSW'])
  })

  it('linha diferente é outro apito', () => {
    const a = { ...fire('j', 'p', 1), estrategia: 'LISTA_SECRETA', linha: 10 } as Apito
    const b = { ...a, linha: 5 } as Apito

    expect(primeiroDeCada([a, b], chaveDeApito)).toHaveLength(2)
  })
})
