import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { avaliarOpd } from '../lista-secreta/opd'
import type { JogadorFato, JogoFato, Nivel, TimeFato } from '../tipos'

/**
 * DESEMPATE DE POSIÇÃO NA HIERARQUIA (debug de 07/10). Dois jogadores na
 * mesma posição — a lista de REB/AST da demo inventava isso — faziam a OPD
 * depender da ORDEM em que os fatos chegavam do banco. O critério estável é
 * (posição, id do jogador), o mesmo do detalhe do apito.
 */
const ruleset = carregarRuleset(yamlBruto)

function jogador(id: string, posicao: number, nivel: Nivel): JogadorFato {
  return {
    id,
    nome: id,
    timeId: 'T',
    posicaoHierarquia: posicao,
    classificacoes: { PONTOS: nivel },
    medias: {},
    historico: [],
  }
}

const jogo: JogoFato = {
  id: 'g1',
  timeCasaId: 'T',
  timeVisitanteId: 'ADV',
  quartoAtual: null,
  escalacao: { topo: 'FORA' },
  estatisticasQuarto: [],
}

function time(jogadores: JogadorFato[]): TimeFato {
  return { id: 'T', sigla: 'T', jogadores }
}

describe('OPD — desempate estável de posição', () => {
  const topo = jogador('topo', 1, 'MVP')
  const zeta = jogador('b-zeta', 2, 'SUPORTE')
  const alfa = jogador('a-alfa', 2, 'SUPORTE')
  const resto = jogador('c-resto', 3, 'RANDOLA')

  it('empate na posição desempata pelo id do jogador, qualquer que seja a ordem de chegada', () => {
    const umaOrdem = avaliarOpd(time([topo, zeta, alfa, resto]), jogo, ruleset)
    const outraOrdem = avaliarOpd(time([resto, alfa, topo, zeta]), jogo, ruleset)

    expect(umaOrdem).toEqual(outraOrdem)
    expect(umaOrdem.map((a) => a.jogadorId)).toEqual(['a-alfa', 'b-zeta', 'c-resto'])
  })
})
