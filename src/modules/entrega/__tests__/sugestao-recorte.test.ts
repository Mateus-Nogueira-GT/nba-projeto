import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { ItemRanqueado } from '../../motor/sugestao/taxa-na-linha'
import {
  atributoDaPergunta,
  mencionaTime,
  recortar,
} from '../sugestao/recorte'
import type { JogoRanqueado, RankingDoDia } from '../sugestao/tipos'

/**
 * O RECORTE é determinístico: os times são um conjunto fechado de 30, então
 * achar o time da pergunta é busca em lista, não trabalho de modelo. Testado
 * sem banco e sem LLM (spec §6.1).
 */
const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const item = (nome: string, bateu: number, apitadoHoje = false): ItemRanqueado => ({
  jogadorId: nome.toLowerCase(),
  nome,
  timeSigla: 'LAL',
  nivel: 'MVP',
  apitadoHoje,
  porLinha: [{ linha: 20, bateu, de: 10 }],
})

const jogo = (
  jogoId: string,
  casa: [string, string],
  fora: [string, string],
  itens: ItemRanqueado[],
): JogoRanqueado => ({
  jogoId,
  times: [
    { sigla: casa[0], nome: casa[1] },
    { sigla: fora[0], nome: fora[1] },
  ],
  porAtributo: [
    { atributo: 'PONTOS', itens },
    { atributo: 'REBOTES', itens: [] },
    { atributo: 'ASSISTENCIAS', itens: [] },
  ],
})

const ranking: RankingDoDia = {
  dataReferencia: '2026-09-19',
  jogos: [
    jogo('j1', ['LAL', 'Los Angeles Lakers'], ['BOS', 'Boston Celtics'], [item('LeBron', 8)]),
    jogo('j2', ['MIA', 'Miami Heat'], ['NYK', 'New York Knicks'], [item('Butler', 9)]),
    jogo('j3', ['GSW', 'Golden State Warriors'], ['PHX', 'Phoenix Suns'], [item('Curry', 7)]),
  ],
}

describe('achar o time na pergunta', () => {
  const lakers = { sigla: 'LAL', nome: 'Los Angeles Lakers' }

  it('acha pela sigla, pelo apelido e pelo nome inteiro', () => {
    expect(mencionaTime('em quem aposto no LAL hoje?', lakers)).toBe(true)
    expect(mencionaTime('e no Lakers?', lakers)).toBe(true)
    expect(mencionaTime('quero ver o los angeles lakers', lakers)).toBe(true)
  })

  it('ignora acento e caixa', () => {
    expect(mencionaTime('E NO LAKERS?', lakers)).toBe(true)
  })

  it('a sigla precisa de fronteira de palavra: não casa dentro de outra', () => {
    // Sem a fronteira, "BOS" casaria em "bosque" e "LAL" em "palavra".
    expect(mencionaTime('tem um bosque perto', { sigla: 'BOS', nome: 'Boston Celtics' })).toBe(false)
    expect(mencionaTime('qual a palavra certa?', lakers)).toBe(false)
  })

  it('não inventa time onde não há', () => {
    expect(mencionaTime('em quem eu aposto hoje?', lakers)).toBe(false)
  })
})

describe('achar o atributo na pergunta', () => {
  it('acha pontos, rebotes e assistências, com e sem acento', () => {
    expect(atributoDaPergunta('quem faz mais pontos?')).toBe('PONTOS')
    expect(atributoDaPergunta('e em rebotes?')).toBe('REBOTES')
    expect(atributoDaPergunta('quem da mais assistencias?')).toBe('ASSISTENCIAS')
  })

  it('devolve null quando a pergunta não diz em quê', () => {
    expect(atributoDaPergunta('em quem eu aposto no Lakers?')).toBeNull()
  })
})

describe('recortar o ranking do dia', () => {
  it('a pergunta nomeia um time: entra o JOGO inteiro, com o adversário', () => {
    const r = recortar(ranking, 'em quem aposto no Lakers?', [], ruleset)
    expect(r.forma).toBe('jogos')
    if (r.forma !== 'jogos') throw new Error('forma')
    expect(r.jogos.map((j) => j.jogoId)).toEqual(['j1'])
    // O adversário vem junto: a próxima pergunta costuma ser sobre ele.
    expect(r.jogos[0]!.times.map((t) => t.sigla)).toEqual(['LAL', 'BOS'])
  })

  it('a pergunta seguinte não nomeia ninguém: o jogo anterior CONTINUA nos fatos', () => {
    // É isto que faz "e o Davis?" funcionar logo depois de "e no Lakers?".
    const r = recortar(ranking, 'e o Davis?', ['em quem aposto no Lakers?'], ruleset)
    expect(r.forma).toBe('jogos')
    if (r.forma !== 'jogos') throw new Error('forma')
    expect(r.jogos.map((j) => j.jogoId)).toEqual(['j1'])
  })

  it('o assunto ATUAL vem primeiro, e o lembrado depois', () => {
    const r = recortar(ranking, 'e no Miami?', ['em quem aposto no Lakers?'], ruleset)
    if (r.forma !== 'jogos') throw new Error('forma')
    expect(r.jogos.map((j) => j.jogoId)).toEqual(['j2', 'j1'])
  })

  it('lembra no máximo `jogos_lembrados` partidas — o freio do validador', () => {
    const r = recortar(ranking, 'e no Miami?', ['no Lakers?', 'no Golden State?'], ruleset)
    if (r.forma !== 'jogos') throw new Error('forma')
    // 1 da pergunta + jogos_lembrados (2) = 3 no teto; aqui há exatamente 3.
    expect(r.jogos).toHaveLength(1 + ruleset.sugestao_estatistica.contexto.jogos_lembrados)
  })

  it('baixar `jogos_lembrados` no ruleset aperta a malha sem tocar código (regra 1)', () => {
    const semMemoria = structuredClone(ruleset)
    semMemoria.sugestao_estatistica.contexto.jogos_lembrados = 0
    const r = recortar(ranking, 'e o Davis?', ['em quem aposto no Lakers?'], semMemoria)
    // Sem memória, "e o Davis?" não acha time e cai no topo do dia.
    expect(r.forma).toBe('topo-do-dia')
  })

  it('ninguém nomeado: os melhores do dia, POR ATRIBUTO e já ordenados', () => {
    const r = recortar(ranking, 'em quem eu aposto hoje?', [], ruleset)
    expect(r.forma).toBe('topo-do-dia')
    if (r.forma !== 'topo-do-dia') throw new Error('forma')
    // Só PONTOS tem itens nesta fixture; os vazios não viram seção.
    expect(r.porAtributo.map((p) => p.atributo)).toEqual(['PONTOS'])
    expect(r.porAtributo[0]!.itens.map((i) => i.nome)).toEqual(['Butler', 'LeBron', 'Curry'])
  })

  it('o topo do dia respeita o teto do ruleset', () => {
    const teto1 = structuredClone(ruleset)
    teto1.sugestao_estatistica.contexto.topo_do_dia = 1
    const r = recortar(ranking, 'em quem eu aposto hoje?', [], teto1)
    if (r.forma !== 'topo-do-dia') throw new Error('forma')
    expect(r.porAtributo[0]!.itens.map((i) => i.nome)).toEqual(['Butler'])
  })
})
