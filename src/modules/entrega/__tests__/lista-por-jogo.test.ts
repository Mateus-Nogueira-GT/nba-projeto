import { describe, expect, it } from 'vitest'

import { agruparPorJogo, estadoDoCiclo, ordenarPorSinal } from '../lista-por-jogo'
import type { JogoResumo } from '../lista-por-jogo'
import type { ItemFeed } from '../tipos-feed'

/**
 * A GRAMÁTICA DA VARREDURA (identidade 04): a Lista Secreta e o Fire Live são
 * lidos por jogo, com o cabeçalho do jogo como única fronteira de seção; dentro
 * de cada jogo, o sinal mais forte primeiro. Tudo aqui é função pura sobre o
 * snapshot — a tela ordena e agrupa, o feed não muda.
 */

let seq = 0
function item(sobre: Partial<ItemFeed> = {}): ItemFeed {
  seq += 1
  return {
    chave: `c${seq}`,
    jogoId: 'j1',
    jogadorId: `p${seq}`,
    nome: `Jogador ${seq}`,
    timeSigla: 'MIA',
    timeNome: 'Miami',
    fotoUrl: null,
    atributo: 'PONTOS',
    nivelJogador: 'SUPORTE',
    nivelApito: 1,
    turbo: false,
    modoFire: false,
    opdOrigemNivel: null,
    linha: 10,
    confianca: 80,
    grauConfianca: 1,
    alvo1Q: null,
    metodo: 'OSCILACAO',
    posicao: 'F',
    ultimos5: [],
    mediaTemporada: 12,
    oddFaixa: null,
    ...sobre,
  }
}

function jogo(sobre: Partial<JogoResumo> & { id: string }): JogoResumo {
  return {
    casaSigla: 'IND',
    visitanteSigla: 'MIA',
    dataHoraUtc: new Date('2026-09-07T22:30:00.000Z'),
    status: 'AGENDADO',
    quartoAtual: null,
    placarCasa: null,
    placarVisitante: null,
    ...sobre,
  }
}

describe('ordenarPorSinal — dentro do jogo, o sinal mais forte primeiro', () => {
  it('turbo antes de N3 antes de N2 antes de N1; empate por grau, depois por confiança', () => {
    const n1 = item({ nivelApito: 1, grauConfianca: 2, confianca: 85 })
    const n2 = item({ nivelApito: 2, grauConfianca: 1, confianca: 80 })
    const n3grau3 = item({ nivelApito: 3, grauConfianca: 3, confianca: 86 })
    const n3grau4 = item({ nivelApito: 3, grauConfianca: 4, confianca: 90 })
    const n3grau4mais = item({ nivelApito: 3, grauConfianca: 4, confianca: 91 })
    const turbo = item({ nivelApito: 3, turbo: true, grauConfianca: 2, confianca: 84 })

    const ordem = ordenarPorSinal([n1, n2, n3grau3, n3grau4, turbo, n3grau4mais]).map((i) => i.chave)
    expect(ordem).toEqual([turbo, n3grau4mais, n3grau4, n3grau3, n2, n1].map((i) => i.chave))
  })

  it('é estável e não muta a entrada', () => {
    const lista = [item({ nivelApito: 2 }), item({ nivelApito: 2 })]
    const copia = [...lista]
    const ordem = ordenarPorSinal(lista)
    expect(ordem.map((i) => i.chave)).toEqual(copia.map((i) => i.chave))
    expect(lista).toEqual(copia)
  })
})

describe('agruparPorJogo — um grupo por jogo, em ordem de horário', () => {
  const j1 = jogo({ id: 'j1', dataHoraUtc: new Date('2026-09-07T23:00:00.000Z'), casaSigla: 'SAS', visitanteSigla: 'PHI' })
  const j2 = jogo({ id: 'j2', dataHoraUtc: new Date('2026-09-07T22:30:00.000Z'), status: 'AO_VIVO', quartoAtual: 1, placarCasa: 33, placarVisitante: 48 })
  const j3 = jogo({ id: 'j3', dataHoraUtc: new Date('2026-09-08T01:30:00.000Z'), casaSigla: 'BOS', visitanteSigla: 'NOP' })

  it('agrupa pelo jogoId, ordena os grupos pelo horário e os itens pelo sinal', () => {
    const itens = [
      item({ jogoId: 'j1', nivelApito: 1 }),
      item({ jogoId: 'j3', nivelApito: 2 }),
      item({ jogoId: 'j1', nivelApito: 3 }),
      item({ jogoId: 'j2', nivelApito: 2 }),
    ]
    const grupos = agruparPorJogo(itens, [j1, j2, j3])

    expect(grupos.map((g) => g.jogoId)).toEqual(['j2', 'j1', 'j3'])
    expect(grupos[1]!.itens.map((i) => i.nivelApito)).toEqual([3, 1])
    // nenhum item perdido
    expect(grupos.reduce((n, g) => n + g.itens.length, 0)).toBe(itens.length)
  })

  it('carrega o que o cabeçalho de jogo mostra: siglas, horário, status e placar', () => {
    const grupos = agruparPorJogo([item({ jogoId: 'j2' })], [j2])
    expect(grupos[0]).toMatchObject({
      jogoId: 'j2',
      casaSigla: 'IND',
      visitanteSigla: 'MIA',
      status: 'AO_VIVO',
      quartoAtual: 1,
      placarCasa: 33,
      placarVisitante: 48,
    })
    expect(grupos[0]!.dataHoraUtc).toEqual(j2.dataHoraUtc)
  })

  it('jogo do dia SEM apito não vira grupo — a Lista só mostra onde há sinal', () => {
    const grupos = agruparPorJogo([item({ jogoId: 'j1' })], [j1, j2, j3])
    expect(grupos.map((g) => g.jogoId)).toEqual(['j1'])
  })

  it('item cujo jogo não está na lista do dia NÃO é engolido: vai para um grupo "jogo desconhecido" no fim', () => {
    // Snapshot e jogos podem divergir por um instante (jogo reagendado).
    // Perder o apito em silêncio seria pior do que mostrá-lo sem cabeçalho.
    const grupos = agruparPorJogo([item({ jogoId: 'j1' }), item({ jogoId: 'orfao' })], [j1])
    expect(grupos).toHaveLength(2)
    expect(grupos[1]).toMatchObject({ jogoId: 'orfao', casaSigla: '—', visitanteSigla: '—', status: 'AGENDADO' })
  })
})

describe('estadoDoCiclo — o card sabe em que ponto da noite está', () => {
  const Q1 = 1
  it.each([
    [{ status: 'AGENDADO', quartoAtual: null }, false, 'PRE'],
    [{ status: 'AO_VIVO', quartoAtual: 1 }, false, 'Q1'],
    [{ status: 'AO_VIVO', quartoAtual: 2 }, false, 'FIM_Q1'],
    [{ status: 'AO_VIVO', quartoAtual: 4 }, true, 'FIM_Q1'],
    [{ status: 'ENCERRADO', quartoAtual: null }, false, 'AGUARDANDO_OFICIAL'],
    [{ status: 'ENCERRADO', quartoAtual: null }, true, 'CONFERIDO'],
  ] as const)('%o com box=%s → %s', (jogo, temBox, esperado) => {
    expect(estadoDoCiclo(jogo, temBox, Q1)).toBe(esperado)
  })

  it('o quarto do Fire Live vem do ruleset, não é 1 por decreto', () => {
    // Se o CJ um dia observar outro quarto, o estado acompanha sem código novo.
    expect(estadoDoCiclo({ status: 'AO_VIVO', quartoAtual: 2 }, false, 2)).toBe('Q1')
  })
})
