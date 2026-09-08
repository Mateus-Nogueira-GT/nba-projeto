import { describe, expect, it } from 'vitest'

import { compararSnapshotsAoVivo, type SnapshotJogoAoVivo } from '../fire-live/movimento'

const snapshot = (parcial: Partial<SnapshotJogoAoVivo> = {}): SnapshotJogoAoVivo => ({
  jogoId: 'jogo-1',
  placarCasa: 20,
  placarVisitante: 18,
  alvos: [],
  ...parcial,
})

const alvo = (parcial: Partial<SnapshotJogoAoVivo['alvos'][number]> = {}) => ({
  chave: 'jogador-1|PONTOS',
  jogadorId: 'jogador-1',
  atributo: 'PONTOS' as const,
  observado: 2,
  alvo: 4,
  modoFire: false,
  apitadoEm: '2026-09-08T16:00:00.000Z',
  ...parcial,
})

describe('mudanças observáveis do Fire Live', () => {
  it('anima aumento do placar, mas trata correção para baixo como neutra', () => {
    expect(compararSnapshotsAoVivo(snapshot(), snapshot({ placarCasa: 21 })).placarSubiu).toBe(true)
    expect(compararSnapshotsAoVivo(snapshot(), snapshot({ placarCasa: 19 })).placarSubiu).toBe(
      false,
    )
  })

  it('separa progresso, alvo batido e entrada no modo fire', () => {
    const anterior = snapshot({ alvos: [alvo()] })
    const atual = snapshot({ alvos: [alvo({ observado: 4, modoFire: true })] })
    expect(compararSnapshotsAoVivo(anterior, atual)).toMatchObject({
      progresso: [{ chave: 'jogador-1|PONTOS', diferenca: 2, atributo: 'PONTOS' }],
      alvosBatidos: ['jogador-1|PONTOS'],
      modoFire: ['jogador-1|PONTOS'],
    })
  })

  it('um apito novo aparece uma vez como evento elegível', () => {
    const novo = alvo({ observado: 5 })
    const mudancas = compararSnapshotsAoVivo(snapshot(), snapshot({ alvos: [novo] }))
    expect(mudancas.novosApitos).toEqual([novo])
    expect(mudancas.alvosBatidos).toEqual([novo.chave])
  })

  it('trocar o jogo selecionado estabelece uma nova base sem replay', () => {
    const mudancas = compararSnapshotsAoVivo(
      snapshot({ alvos: [alvo()] }),
      snapshot({ jogoId: 'jogo-2', placarCasa: 40, alvos: [alvo({ observado: 10 })] }),
    )
    expect(mudancas).toEqual({
      placarSubiu: false,
      progresso: [],
      alvosBatidos: [],
      modoFire: [],
      novosApitos: [],
    })
  })
})
