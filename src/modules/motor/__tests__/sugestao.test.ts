import { describe, expect, it } from 'vitest'
// `?raw` e não `node:fs`: o motor não importa builtin de Node nem no teste —
// é o que mantém o backtest rodando fora deste processo (ADR-0002).
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { linhasDoNivel } from '../atributos'
import { ranquearPorTaxaNaLinha, type JogadorParaRanquear } from '../sugestao/taxa-na-linha'

/**
 * A SUGESTÃO ESTATÍSTICA — função PURA, sem banco e sem mock.
 *
 * Quem ordena é o motor; a IA só narra a lista pronta (ADR-0012). É por isso
 * que estes testes existem sem nenhuma infraestrutura: se o ranking precisasse
 * de mock, a regra 2 do projeto teria sido violada.
 */
const ruleset = carregarRuleset(yamlBruto)

/** Um jogador com os jogos que quisermos, do mais recente para o mais antigo. */
const jogador = (
  nome: string,
  nivel: JogadorParaRanquear['nivel'],
  jogos: number[],
  apitadoHoje = false,
): JogadorParaRanquear => ({
  jogadorId: nome.toLowerCase(),
  nome,
  timeSigla: 'LAL',
  nivel,
  jogos,
  apitadoHoje,
})

/** Dez jogos em que o valor bate a linha `quantas` vezes. */
const dezJogos = (acima: number, quantas: number, abaixo: number): number[] => [
  ...Array.from({ length: quantas }, () => acima),
  ...Array.from({ length: 10 - quantas }, () => abaixo),
]

describe('linhas do nível', () => {
  it('são as do ruleset, em ordem crescente — e cada nível tem as suas', () => {
    // O motor já respondia a isto (`linhasDoNivel`); a sugestão reaproveita em
    // vez de abrir uma segunda fonte de linhas, que divergiria na primeira vez
    // que alguém mexesse numa das duas.
    expect(linhasDoNivel('MVP', 'PONTOS', ruleset)).toEqual([20, 25, 30, 35])
    expect(linhasDoNivel('RANDOLA', 'PONTOS', ruleset)).toEqual([5, 10])
  })
})

describe('ranquear por taxa na linha', () => {
  it('conta quantas vezes o jogador passou de CADA linha do nível dele', () => {
    // 8 jogos de 26 e 2 de 12: passa de 20 em 8, de 25 em 8, de 30 em 0.
    const [item] = ranquearPorTaxaNaLinha([jogador('A', 'MVP', dezJogos(26, 8, 12))], 'PONTOS', ruleset)

    expect(item!.porLinha).toEqual([
      { linha: 20, bateu: 8, de: 10 },
      { linha: 25, bateu: 8, de: 10 },
      { linha: 30, bateu: 0, de: 10 },
      { linha: 35, bateu: 0, de: 10 },
    ])
  })

  it('bater a linha é ALCANÇÁ-LA: 20 pontos batem a linha de 20', () => {
    // "20+" no produto significa 20 ou mais, e é assim que o card escreve.
    // Exigir superação faria o card prometer uma coisa e o ranking contar
    // outra.
    const [item] = ranquearPorTaxaNaLinha(
      [jogador('A', 'MVP', Array.from({ length: 10 }, () => 20))],
      'PONTOS',
      ruleset,
    )
    expect(item!.porLinha[0]).toEqual({ linha: 20, bateu: 10, de: 10 })
  })

  it('ordena pela MENOR linha do nível (ruleset: ordenacao)', () => {
    const itens = ranquearPorTaxaNaLinha(
      [
        jogador('Fraco', 'MVP', dezJogos(26, 3, 10)),
        jogador('Forte', 'MVP', dezJogos(26, 9, 10)),
        jogador('Medio', 'MVP', dezJogos(26, 6, 10)),
      ],
      'PONTOS',
      ruleset,
    )
    expect(itens.map((i) => i.nome)).toEqual(['Forte', 'Medio', 'Fraco'])
  })

  it('quem não tem jogos suficientes NÃO entra — 2 de 2 não é 100%', () => {
    // Sem este corte, quem voltou de lesão ontem lideraria o ranking.
    const itens = ranquearPorTaxaNaLinha(
      [jogador('Novato', 'MVP', [30, 30]), jogador('Titular', 'MVP', dezJogos(26, 5, 10))],
      'PONTOS',
      ruleset,
    )
    expect(itens.map((i) => i.nome)).toEqual(['Titular'])
  })

  it('a janela corta os jogos mais ANTIGOS: conta os 10 mais recentes', () => {
    // 12 jogos: os 2 mais antigos (no fim da lista) ficam de fora.
    const jogos = [...Array.from({ length: 10 }, () => 10), 99, 99]
    const [item] = ranquearPorTaxaNaLinha([jogador('A', 'MVP', jogos)], 'PONTOS', ruleset)
    expect(item!.porLinha[0]).toEqual({ linha: 20, bateu: 0, de: 10 })
  })

  it('carrega o marcador de apitado, que é quem separa as duas vozes', () => {
    const itens = ranquearPorTaxaNaLinha(
      [
        jogador('Apitado', 'MVP', dezJogos(26, 5, 10), true),
        jogador('Livre', 'MVP', dezJogos(26, 9, 10), false),
      ],
      'PONTOS',
      ruleset,
    )
    expect(itens.find((i) => i.nome === 'Apitado')!.apitadoHoje).toBe(true)
    expect(itens.find((i) => i.nome === 'Livre')!.apitadoHoje).toBe(false)
  })

  it('nível sem linha no ruleset devolve lista vazia, não erro', () => {
    // Quem não tem linha não tem o que contar. Silêncio é a resposta certa.
    const semLinhas = structuredClone(ruleset)
    semLinhas.confianca.base.MVP = {}
    expect(
      ranquearPorTaxaNaLinha([jogador('A', 'MVP', dezJogos(26, 9, 10))], 'PONTOS', semLinhas),
    ).toEqual([])
  })

  it('trocar a janela no ruleset muda o resultado sem tocar código (regra 1)', () => {
    // Cinco jogos bons recentes e cinco ruins antes: com janela 10 a taxa é
    // 5 de 10; com janela 5, é 5 de 5.
    const jogos = [...Array.from({ length: 5 }, () => 26), ...Array.from({ length: 5 }, () => 10)]
    const janela5 = structuredClone(ruleset)
    janela5.sugestao_estatistica.janela_jogos = 5
    janela5.sugestao_estatistica.minimo_jogos = 5

    const [com10] = ranquearPorTaxaNaLinha([jogador('A', 'MVP', jogos)], 'PONTOS', ruleset)
    const [com5] = ranquearPorTaxaNaLinha([jogador('A', 'MVP', jogos)], 'PONTOS', janela5)

    expect(com10!.porLinha[0]).toEqual({ linha: 20, bateu: 5, de: 10 })
    expect(com5!.porLinha[0]).toEqual({ linha: 20, bateu: 5, de: 5 })
  })
})
