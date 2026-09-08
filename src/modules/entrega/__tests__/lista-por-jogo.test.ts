import { describe, expect, it } from 'vitest'

import {
  agruparPorJogo,
  cartoesPorJogador,
  confrontoDoItem,
  estadoDoCiclo,
  ordenarPorSinal,
  posicoesNaHierarquia,
} from '../lista-por-jogo'
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

    const ordem = ordenarPorSinal([n1, n2, n3grau3, n3grau4, turbo, n3grau4mais]).map(
      (i) => i.chave,
    )
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
  const j1 = jogo({
    id: 'j1',
    dataHoraUtc: new Date('2026-09-07T23:00:00.000Z'),
    casaSigla: 'SAS',
    visitanteSigla: 'PHI',
  })
  const j2 = jogo({
    id: 'j2',
    dataHoraUtc: new Date('2026-09-07T22:30:00.000Z'),
    status: 'AO_VIVO',
    quartoAtual: 1,
    placarCasa: 33,
    placarVisitante: 48,
  })
  const j3 = jogo({
    id: 'j3',
    dataHoraUtc: new Date('2026-09-08T01:30:00.000Z'),
    casaSigla: 'BOS',
    visitanteSigla: 'NOP',
  })

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
    expect(grupos[1]).toMatchObject({
      jogoId: 'orfao',
      casaSigla: '—',
      visitanteSigla: '—',
      status: 'AGENDADO',
    })
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

/**
 * UM CARD POR JOGADOR (spec 04, §4.1). A regra é da ENTREGA, não da tela: o
 * Fire Live (task 2.2) precisa do mesmo card, e o que mora em `page.tsx` só é
 * testável renderizando a tela inteira.
 */
describe('cartoesPorJogador — o mesmo jogador em dois atributos é UM card', () => {
  it('agrupa por jogador e o principal é o de MAIOR sinal, na ordem em que a lista veio', () => {
    const forte = item({ jogadorId: 'p1', atributo: 'PONTOS', nivelApito: 3 })
    const fraco = item({ jogadorId: 'p1', atributo: 'REBOTES', nivelApito: 1 })
    const outro = item({ jogadorId: 'p2', atributo: 'PONTOS', nivelApito: 2 })

    const cartoes = cartoesPorJogador(ordenarPorSinal([fraco, outro, forte]))
    expect(cartoes.map((c) => c.principal.jogadorId)).toEqual(['p1', 'p2'])
    expect(cartoes[0]!.principal.atributo).toBe('PONTOS')
    expect(cartoes[0]!.atributos).toHaveLength(2)
  })

  it('as abas saem em ordem FIXA PTS · REB · AST, igual em todos os cards', () => {
    // Numa tela de varredura, rodapé que muda de ordem de card para card
    // obriga a LER em vez de varrer — o artboard fixa PTS · REB · AST.
    const cartoes = cartoesPorJogador(
      ordenarPorSinal([
        item({ jogadorId: 'p1', atributo: 'ASSISTENCIAS', nivelApito: 3 }),
        item({ jogadorId: 'p1', atributo: 'REBOTES', nivelApito: 2 }),
        item({ jogadorId: 'p1', atributo: 'PONTOS', nivelApito: 1 }),
      ]),
    )
    expect(cartoes[0]!.atributos.map((i) => i.atributo)).toEqual([
      'PONTOS',
      'REBOTES',
      'ASSISTENCIAS',
    ])
    // a ordem das abas NÃO mexe em quem manda: o principal segue o maior sinal
    expect(cartoes[0]!.principal.atributo).toBe('ASSISTENCIAS')
  })

  it('a aba aberta troca o apito VISÍVEL, nunca o principal — o card não pula de lugar', () => {
    const itens = ordenarPorSinal([
      item({ jogadorId: 'p1', atributo: 'PONTOS', nivelApito: 3 }),
      item({ jogadorId: 'p1', atributo: 'REBOTES', nivelApito: 1 }),
      item({ jogadorId: 'p2', atributo: 'PONTOS', nivelApito: 2 }),
    ])
    const cartoes = cartoesPorJogador(itens, (id) => (id === 'p1' ? 'REBOTES' : undefined))
    expect(cartoes[0]!.visivel.atributo).toBe('REBOTES')
    expect(cartoes[0]!.principal.atributo).toBe('PONTOS')
    // o card do vizinho não se mexeu
    expect(cartoes[1]!.visivel.atributo).toBe('PONTOS')
  })

  it('aba pedida que o jogador não tem hoje cai no principal, sem card vazio', () => {
    const cartoes = cartoesPorJogador(
      [item({ jogadorId: 'p1', atributo: 'PONTOS' })],
      () => 'REBOTES',
    )
    expect(cartoes[0]!.visivel.atributo).toBe('PONTOS')
  })
})

describe('confrontoDoItem — mandante e visitante, como o artboard escreve', () => {
  const j = jogo({ id: 'j1', casaSigla: 'IND', visitanteSigla: 'MIA' })

  it('jogador do time da casa recebe "vs"; o do visitante, "@"', () => {
    expect(confrontoDoItem({ timeSigla: 'IND' }, j)).toEqual({
      adversarioSigla: 'MIA',
      emCasa: true,
    })
    expect(confrontoDoItem({ timeSigla: 'MIA' }, j)).toEqual({
      adversarioSigla: 'IND',
      emCasa: false,
    })
  })

  it('time que não é nenhum dos dois lados não vira confronto inventado', () => {
    // O vínculo jogador↔time é curadoria do CJ e pode não bater com a partida
    // real (Giannis no Miami). Sem certeza, o card não fala em confronto.
    expect(confrontoDoItem({ timeSigla: 'LAL' }, j)).toBeNull()
    expect(confrontoDoItem({ timeSigla: 'IND' }, null)).toBeNull()
  })
})

describe('posicoesNaHierarquia — a lente HIERARQUIA lê a lista do CJ', () => {
  const linhas = [
    { jogadorId: 'p1', timeId: 't1', atributo: 'PONTOS' as const, posicaoHierarquia: 1 },
    { jogadorId: 'p2', timeId: 't1', atributo: 'PONTOS' as const, posicaoHierarquia: 2 },
    { jogadorId: 'p3', timeId: 't1', atributo: 'PONTOS' as const, posicaoHierarquia: 3 },
    { jogadorId: 'p1', timeId: 't1', atributo: 'REBOTES' as const, posicaoHierarquia: 2 },
    { jogadorId: 'p9', timeId: 't2', atributo: 'PONTOS' as const, posicaoHierarquia: 1 },
  ]

  it('devolve a posição no time E o total daquele time NAQUELE atributo', () => {
    const mapa = posicoesNaHierarquia(linhas, [
      { jogadorId: 'p2', atributo: 'PONTOS' },
      { jogadorId: 'p1', atributo: 'REBOTES' },
      { jogadorId: 'p9', atributo: 'PONTOS' },
    ])
    expect(mapa.get('p2:PONTOS')).toEqual({ posicao: 2, total: 3 })
    // o total é do atributo pedido: em REBOTES só há um jogador cadastrado
    expect(mapa.get('p1:REBOTES')).toEqual({ posicao: 2, total: 1 })
    // e é do TIME do jogador, não da liga
    expect(mapa.get('p9:PONTOS')).toEqual({ posicao: 1, total: 1 })
  })

  it('jogador sem linha na versão ativa fica de fora — a lente escreve "—", nunca um palpite', () => {
    const mapa = posicoesNaHierarquia(linhas, [{ jogadorId: 'p4', atributo: 'PONTOS' }])
    expect(mapa.has('p4:PONTOS')).toBe(false)
  })
})
