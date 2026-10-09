import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { calcularConfianca, linhasDoNivel } from '../confianca'
import { deltaOscilacao, marcosDoNivel, origemDoAtributo } from '../atributos'
import { limiarOscilacao } from '../lista-secreta/oscilacao'
import { avaliarFireLive } from '../fire-live/avaliar'
import { marcosAtingidos } from '../fire-live/green'
import { agregar } from '../odds/agregar'
import { carregarRuleset } from '../ruleset/carregar'
import type { Ruleset } from '../ruleset/schema'

const ruleset = carregarRuleset(yamlBruto)

/** O ruleset sem nenhum bloco por atributo — o estado homologado puro. */
function soPontos(): Ruleset {
  const copia = structuredClone(ruleset)
  copia.por_atributo = {}
  return copia
}

/**
 * Em produção `niveis.atributos` é `[PONTOS]` (ver o comentário no ruleset):
 * rebotes e assistências ficam desligados até o CJ mandar % e odds. Os testes
 * abaixo auditam o comportamento dos três atributos, então religam REBOTES e
 * ASSISTENCIAS só nesta cópia — nunca no arquivo de produção.
 */
function comTresAtributos(): Ruleset {
  const copia = structuredClone(ruleset)
  copia.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
  return copia
}

describe('pontos não muda — o bloco homologado é intocável', () => {
  it('as linhas de MVP continuam sendo as da tabela do CJ', () => {
    expect(linhasDoNivel('MVP', 'PONTOS', ruleset)).toEqual([20, 25, 30, 35])
  })

  it('a âncora A15 sobrevive: MVP na linha 25, nível 3 → 94', () => {
    expect(calcularConfianca('MVP', 'PONTOS', 25, 3, ruleset)).toBe(94)
  })

  it('a exceção nominal do Luka continua valendo só em pontos', () => {
    expect(deltaOscilacao('MVP', 'PONTOS', 'luka-doncic', ruleset)).toBe(7)
    expect(deltaOscilacao('MVP', 'PONTOS', 'jokic', ruleset)).toBe(6)
  })

  it('pontos é declarado homologado', () => {
    expect(origemDoAtributo('PONTOS', ruleset)).toBe('homologado')
  })
})

describe('rebotes e assistências têm escala própria', () => {
  it('as linhas de rebotes não são linhas de pontos', () => {
    const rebotes = linhasDoNivel('MVP', 'REBOTES', ruleset)

    expect(rebotes).toEqual([8, 10, 12])
    // O defeito que este bloco corrige: antes, um MVP classificado em rebotes
    // recebia as linhas de PONTOS — "35 REBOTES" saía no card.
    expect(rebotes).not.toEqual(linhasDoNivel('MVP', 'PONTOS', ruleset))
  })

  it('o delta de rebotes é menor que o de pontos', () => {
    const rebotes = deltaOscilacao('MVP', 'REBOTES', 'jokic', ruleset)
    const pontos = deltaOscilacao('MVP', 'PONTOS', 'jokic', ruleset)

    expect(rebotes).toBe(4)
    expect(rebotes!).toBeLessThan(pontos!)
  })

  it('o limiar sai da média com o delta do atributo', () => {
    // Jokic, 12,9 rpg, MVP, delta 4 (documento de 21/09) → 8,9
    expect(limiarOscilacao(12.9, 'MVP', 'REBOTES', 'jokic', ruleset)).toBeCloseTo(8.9, 10)
  })

  it('assistências não têm nota de confiança (CJ, 09/10): vale a cor do apito', () => {
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 1, ruleset)).toBeNull()
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 3, ruleset)).toBeNull()
  })

  it('se um dia o atributo ganhar tabela, a confiança sai da tabela dele', () => {
    const comTabela = structuredClone(ruleset)
    comTabela.por_atributo.ASSISTENCIAS!.confianca = {
      base: { MVP: { 7: 85 }, ALL_STAR: {}, SUPORTE: {}, RANDOLA: {} },
      bonus_por_nivel_apito: { MVP: { 3: 4 }, ALL_STAR: {}, SUPORTE: {}, RANDOLA: {} },
    }
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 1, comTabela)).toBe(85)
    expect(calcularConfianca('MVP', 'ASSISTENCIAS', 7, 3, comTabela)).toBe(89)
  })

  it('green de rebotes usa os marcos de rebotes', () => {
    expect(marcosDoNivel('MVP', 'REBOTES', ruleset)).toEqual([10, 12, 15, 18, 20])
    expect(marcosAtingidos('MVP', 'REBOTES', 13, ruleset)).toEqual([10, 12])
  })

  it('a odd de fallback sai da tabela do atributo', () => {
    const faixa = agregar([], 'MVP', 'REBOTES', 10, ruleset)
    expect(faixa).toEqual({ min: 1.9, max: 2.4, mediana: 2.15, qtdCasas: 0, origem: 'TABELA_ESTATICA' })
  })

  it('são declarados como demonstração, não homologados', () => {
    expect(origemDoAtributo('REBOTES', ruleset)).toBe('demonstracao')
    expect(origemDoAtributo('ASSISTENCIAS', ruleset)).toBe('demonstracao')
  })
})

describe('sem bloco, o atributo simplesmente não existe', () => {
  const sem = soPontos()

  it('não oferece linha nenhuma', () => {
    expect(linhasDoNivel('MVP', 'REBOTES', sem)).toEqual([])
  })

  it('não calcula confiança', () => {
    expect(calcularConfianca('MVP', 'REBOTES', 10, 3, sem)).toBeNull()
  })

  it('não tem limiar, então a oscilação nem é avaliada', () => {
    expect(limiarOscilacao(12.9, 'MVP', 'REBOTES', 'jokic', sem)).toBeNull()
  })

  it('não gera green — nenhum push sai por engano', () => {
    expect(marcosAtingidos('MVP', 'REBOTES', 99, sem)).toEqual([])
  })

  it('mas pontos continua intacto', () => {
    expect(linhasDoNivel('MVP', 'PONTOS', sem)).toEqual([20, 25, 30, 35])
    expect(calcularConfianca('MVP', 'PONTOS', 25, 3, sem)).toBe(94)
  })
})

describe('o interruptor de atributo', () => {
  it('rebotes e assistências ligados (06/10) — e as tabelas deles seguem marcadas como demonstração', () => {
    // `niveis.atributos` é o array que motor/index.ts e fire-live/avaliar.ts
    // iteram: ele é o liga-desliga. O parceiro religou REB e AST em 06/10,
    // ciente de que a confiança e a odd dos dois são NOSSAS, não do CJ. O que
    // este teste trava agora é a etiqueta: enquanto o CJ não mandar as
    // tabelas, elas não podem passar por homologadas.
    expect(ruleset.niveis.atributos).toEqual(['PONTOS', 'REBOTES', 'ASSISTENCIAS'])
    expect(origemDoAtributo('REBOTES', ruleset)).toBe('demonstracao')
    expect(origemDoAtributo('ASSISTENCIAS', ruleset)).toBe('demonstracao')
  })
})

describe('o green carrega o atributo em que foi batido', () => {
  it('12 rebotes no 1º quarto viram green de REBOTES, não de PONTOS', () => {
    const pivo = {
      id: 'pivo',
      nome: 'Pivô',
      timeId: 'TIME',
      posicaoHierarquia: 1,
      classificacoes: { PONTOS: 'MVP' as const, REBOTES: 'MVP' as const },
      medias: { PONTOS: 20, REBOTES: 11 },
      historico: [],
    }
    const time = { id: 'TIME', sigla: 'TIM', jogadores: [pivo] }
    const jogo = {
      id: 'jogo',
      timeCasaId: 'TIME',
      timeVisitanteId: 'OUTRO',
      quartoAtual: ruleset.fire_live.quarto,
      escalacao: {},
      estatisticasQuarto: [
        { jogadorId: 'pivo', quarto: ruleset.fire_live.quarto, pontos: 4, rebotes: 12, assistencias: 0 },
      ],
    }

    const { greens } = avaliarFireLive(time, jogo, comTresAtributos(), { opdPreLive: new Map() })
    const deRebotes = greens.filter((g) => g.atributo === 'REBOTES')

    // MVP em rebotes: marcos 10 e 12 caem com 12 rebotes.
    expect(deRebotes.map((g) => g.marco).sort((a, b) => a - b)).toEqual([10, 12])
    // 4 pontos não cruza marco de pontos nenhum — não pode existir green de PONTOS.
    expect(greens.filter((g) => g.atributo === 'PONTOS')).toEqual([])
  })
})
