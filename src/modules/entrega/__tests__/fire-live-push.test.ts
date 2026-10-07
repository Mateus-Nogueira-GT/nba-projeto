import { describe, expect, it } from 'vitest'
import { mensagemDeApito, mensagemDeGreen } from '../fire-live/push'
import type { Apito } from '../../motor/tipos'
import type { Green } from '../../motor/fire-live/avaliar'

const AGORA = new Date('2026-11-04T00:30:00Z')
const EXIBICAO = { nome: 'Jokic', timeSigla: 'DEN' }

function apito(atributo: Apito['atributo'], alvo1Q: number): Apito {
  return {
    chaveDeduplicacao: `j1|p1|${atributo}|FIRE_LIVE|`,
    jogoId: 'j1',
    jogadorId: 'p1',
    atributo,
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
  } as Apito
}

function green(atributo: Green['atributo'], marco: number, valor: number): Green {
  return { jogoId: 'j1', jogadorId: 'p1', atributo, nivelJogador: 'MVP', marco, valor }
}

describe('push do Fire Live — rótulo do atributo', () => {
  it('o corpo do apito escreve o atributo com acento ("assistências")', () => {
    const m = mensagemDeApito(apito('ASSISTENCIAS', 3), EXIBICAO, AGORA)
    expect(m.corpo).toBe('DEN · alvo 3 assistências')
  })

  it('o corpo do apito de pontos continua "alvo N pontos"', () => {
    const m = mensagemDeApito(apito('PONTOS', 8), EXIBICAO, AGORA)
    expect(m.corpo).toBe('DEN · alvo 8 pontos')
  })

  it('o título do green diz a unidade do marco ("bateu 10 rebotes")', () => {
    const m = mensagemDeGreen(green('REBOTES', 10, 11), EXIBICAO, AGORA)
    expect(m.titulo).toBe('Jokic bateu 10 rebotes')
    expect(m.corpo).toBe('DEN · 11 rebotes')
  })

  it('o green de assistências também leva acento no título e no corpo', () => {
    const m = mensagemDeGreen(green('ASSISTENCIAS', 10, 10), EXIBICAO, AGORA)
    expect(m.titulo).toBe('Jokic bateu 10 assistências')
    expect(m.corpo).toBe('DEN · 10 assistências')
  })
})
