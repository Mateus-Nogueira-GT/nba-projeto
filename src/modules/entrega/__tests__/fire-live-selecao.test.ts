import { describe, expect, it } from 'vitest'

import { selecionarJogoAoVivo } from '../fire-live/selecao'

const grupo = (
  jogoId: string,
  estado: 'EM_1Q' | 'AGUARDANDO' | 'FIM_1Q',
  jogadores: string[] = [],
) => ({ jogoId, estado, itens: jogadores.map((jogadorId) => ({ jogadorId })) })

describe('seleção do jogo no Fire Live', () => {
  const grupos = [
    grupo('ao-vivo-1', 'EM_1Q', ['jogador-a']),
    grupo('ao-vivo-2', 'EM_1Q', ['jogador-b']),
    grupo('agendado', 'AGUARDANDO'),
    grupo('encerrado', 'FIM_1Q'),
  ]

  it('preserva o jogo escolhido explicitamente na URL', () => {
    expect(selecionarJogoAoVivo(grupos, 'encerrado', new Set(['jogador-b']))).toEqual({
      grupo: grupos[3],
      jogoSolicitadoInvalido: false,
    })
  })

  it('prioriza o jogo ao vivo que contém atleta acompanhado', () => {
    expect(selecionarJogoAoVivo(grupos, undefined, new Set(['jogador-b'])).grupo?.jogoId).toBe(
      'ao-vivo-2',
    )
  })

  it('cai para o primeiro ao vivo e sinaliza link inválido sem quebrar a tela', () => {
    expect(selecionarJogoAoVivo(grupos, 'fora-da-rodada')).toEqual({
      grupo: grupos[0],
      jogoSolicitadoInvalido: true,
    })
  })

  it('prefere o próximo agendado e depois o encerrado mais recente', () => {
    expect(
      selecionarJogoAoVivo([grupo('proximo', 'AGUARDANDO'), grupo('fim', 'FIM_1Q')]).grupo?.jogoId,
    ).toBe('proximo')
    expect(
      selecionarJogoAoVivo([grupo('fim-antigo', 'FIM_1Q'), grupo('fim-recente', 'FIM_1Q')]).grupo
        ?.jogoId,
    ).toBe('fim-recente')
  })

  it('retorna vazio de forma explícita', () => {
    expect(selecionarJogoAoVivo([], 'ausente')).toEqual({
      grupo: null,
      jogoSolicitadoInvalido: true,
    })
  })
})
