import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { avaliar } from '../index'
import { deltaOscilacao, faixaDeClassificacao } from '../atributos'
import { avaliarFireLive } from '../fire-live/avaliar'
import { blocoDeTopo } from '../fire-live/bloco-topo'
import { avaliarOscilacao } from '../lista-secreta/oscilacao'
import { carregarRuleset } from '../ruleset/carregar'
import { rulesetSchema } from '../ruleset/schema'
import type { Ruleset } from '../ruleset/schema'
import type { Atributo, JogadorFato, JogoFato, Nivel, TimeFato } from '../tipos'

const homologado = carregarRuleset(yamlBruto)

// `niveis.atributos` em produção é [PONTOS]: rebotes e assistências estão
// desligados até o CJ mandar % e odds (ver o comentário no ruleset). Estes
// testes auditam as regras dos três atributos, então religam os três AQUI —
// nunca no arquivo de produção.
const tresAtributos = structuredClone(homologado)
tresAtributos.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']

it('aliases reconciliados não escolhem silenciosamente entre exceções conflitantes', () => {
  const configurado = structuredClone(homologado)
  configurado.oscilacao.excecoes_por_jogador = { 'nome-editorial': 7, 'alias-confirmado': 6 }
  expect(() => deltaOscilacao('MVP', 'PONTOS', ['nome-editorial', 'alias-confirmado'], configurado))
    .toThrow('Exceções de oscilação conflitantes')
})

/**
 * Fonte: introducao-extraida.txt, P347/P348. Os limiares/tabelas que já eram
 * demonstração continuam assim: o teste isola os níveis permitidos, não os
 * homologa. O YAML de produção não é modificado.
 */
function comRegrasDeRebotes(): Ruleset {
  const rebotes = tresAtributos.por_atributo.REBOTES!
  return rulesetSchema.parse({
    ...tresAtributos,
    por_atributo: {
      ...tresAtributos.por_atributo,
      REBOTES: {
        ...rebotes,
        oscilacao: {
          ...rebotes.oscilacao,
          nivel_minimo_apito: { MVP: 1, ALL_STAR: 1, SUPORTE: 1, RANDOLA: 1 },
        },
        opd: { janela: 2, mapa_nivel: { 1: 3, 2: 2 } },
      },
    },
  })
}

type JogadorComHierarquia = JogadorFato & {
  posicaoHierarquiaPorAtributo?: Partial<Record<Atributo, number>>
}

function jogador(id: string, posicao: number, nivel: Nivel): JogadorComHierarquia {
  return {
    id,
    nome: id,
    timeId: 'NYK',
    posicaoHierarquia: posicao,
    classificacoes: { REBOTES: nivel },
    medias: {},
    historico: [],
  }
}

function partida(fora: string[] = []): JogoFato {
  return {
    id: 'jogo-auditado',
    timeCasaId: 'NYK',
    timeVisitanteId: 'ADV',
    quartoAtual: null,
    escalacao: Object.fromEntries(fora.map((id) => [id, 'FORA' as const])),
    estatisticasQuarto: [],
  }
}

function apitos(time: TimeFato, jogo: JogoFato, ruleset: Ruleset) {
  return avaliar({ dataReferencia: '2026-09-08', times: [time], jogos: [jogo] }, ruleset)
}

describe('auditoria da fonte nova · regras explícitas de rebotes', () => {
  it('P347/P348: Towns fora libera Hart N3 e Drummond N2, sem terceiro beneficiado N1', () => {
    const time: TimeFato = {
      id: 'NYK',
      sigla: 'NYK',
      jogadores: [
        jogador('towns', 1, 'MVP'),
        jogador('hart', 2, 'ALL_STAR'),
        jogador('drummond', 3, 'SUPORTE'),
        jogador('anunoby', 4, 'SUPORTE'),
      ],
    }
    const resultado = apitos(time, partida(['towns']), comRegrasDeRebotes())
    expect(Object.fromEntries(resultado.map((a) => [a.jogadorId, a.nivelApito]))).toEqual({
      hart: 3,
      drummond: 2,
    })
  })

  it('P347: Suporte em rebotes pode apitar já no primeiro jogo abaixo do limiar', () => {
    const suporte = jogador('suporte-rebotes', 3, 'SUPORTE')
    suporte.medias.REBOTES = 6
    suporte.historico = [
      {
        jogoId: 'anterior',
        data: '2026-09-07',
        jogou: true,
        pontos: 10,
        rebotes: 0,
        assistencias: 0,
      },
    ]
    expect(avaliarOscilacao(suporte, 'REBOTES', comRegrasDeRebotes())).toEqual({
      nivelApito: 1,
      turbo: false,
    })
  })

  it('P10/P11 versus P360/P361: a hierarquia de pontos não bloqueia a OPD de rebotes', () => {
    const brunson = jogador('brunson', 1, 'MVP')
    brunson.classificacoes = { PONTOS: 'MVP' }
    brunson.posicaoHierarquiaPorAtributo = { PONTOS: 1 }
    const towns = jogador('towns', 2, 'MVP')
    towns.classificacoes.PONTOS = 'ALL_STAR'
    towns.posicaoHierarquiaPorAtributo = { PONTOS: 2, REBOTES: 1 }
    const hart = jogador('hart', 5, 'ALL_STAR')
    hart.classificacoes.PONTOS = 'SUPORTE'
    hart.posicaoHierarquiaPorAtributo = { PONTOS: 5, REBOTES: 2 }
    const drummond = jogador('drummond', 8, 'SUPORTE')
    drummond.classificacoes.PONTOS = 'RANDOLA'
    drummond.posicaoHierarquiaPorAtributo = { PONTOS: 8, REBOTES: 3 }
    const time = { id: 'NYK', sigla: 'NYK', jogadores: [brunson, towns, hart, drummond] }
    const resultado = apitos(time, partida(['towns']), comRegrasDeRebotes())
    expect(resultado.filter((a) => a.atributo === 'PONTOS')).toEqual([])
    expect(
      Object.fromEntries(
        resultado.filter((a) => a.atributo === 'REBOTES').map((a) => [a.jogadorId, a.nivelApito]),
      ),
    ).toEqual({ hart: 3, drummond: 2 })
  })
})

describe('auditoria da fonte nova · seção de assistências', () => {
  /** Um fato de assistências: nível, média e os jogos, do mais recente. */
  function armador(nivel: Nivel, media: number, jogos: number[]): JogadorFato {
    return {
      id: 'armador',
      nome: 'armador',
      timeId: 'NYK',
      posicaoHierarquia: 1,
      classificacoes: { ASSISTENCIAS: nivel },
      medias: { ASSISTENCIAS: media },
      historico: jogos.map((assistencias, i) => ({
        jogoId: `anterior-${i}`,
        data: '2026-09-07',
        jogou: true,
        pontos: 0,
        rebotes: 0,
        assistencias,
      })),
    }
  }

  /**
   * "Mvp - média de 8 em diante apita quando o jogador desse nível fizer 4
   * assistências ou menos abaixo da média dele em algum jogo"; All Star e
   * Suporte, 3.
   *
   * O bloco geral do mesmo documento diz "<=2 abaixo da média" para
   * assistências, sem separar nível — e era de lá que estes deltas saíam.
   * Vale a seção (decisão do parceiro, 22/09/2026). Se alguém voltar ao "<=2",
   * este teste cai.
   */
  it('o delta por nível é o da seção, não o "<=2" do bloco geral', () => {
    const delta = (nivel: Nivel) =>
      deltaOscilacao(nivel, 'ASSISTENCIAS', 'jogador-sem-excecao', tresAtributos)
    expect(delta('MVP')).toBe(4)
    expect(delta('ALL_STAR')).toBe(3)
    expect(delta('SUPORTE')).toBe(3)
  })

  it('MVP com 8 apg apita ao fazer 4 assistências, e não apita ao fazer 5', () => {
    expect(avaliarOscilacao(armador('MVP', 8, [4]), 'ASSISTENCIAS', tresAtributos)).toEqual({
      nivelApito: 1,
      turbo: false,
    })
    expect(avaliarOscilacao(armador('MVP', 8, [5]), 'ASSISTENCIAS', tresAtributos)).toBeNull()
  })

  it('All Star com 6 apg apita ao fazer 3, e não apita ao fazer 4', () => {
    expect(avaliarOscilacao(armador('ALL_STAR', 6, [3]), 'ASSISTENCIAS', tresAtributos)).toEqual({
      nivelApito: 1,
      turbo: false,
    })
    expect(avaliarOscilacao(armador('ALL_STAR', 6, [4]), 'ASSISTENCIAS', tresAtributos)).toBeNull()
  })

  /**
   * As faixas de média que definem o nível, nas duas tabelas do documento:
   * "Classificação de jogadores rebotes" e a abertura da seção de
   * assistências. Nenhuma regra do motor classifica por média — o nível vem
   * da lista curada —, mas os números são dele e o teste os trava no ruleset.
   */
  it('as faixas de classificação são as das tabelas do documento', () => {
    const faixa = (nivel: Nivel, atributo: Atributo) =>
      faixaDeClassificacao(nivel, atributo, tresAtributos)

    expect(faixa('MVP', 'REBOTES')).toEqual({ min: 10 })
    expect(faixa('ALL_STAR', 'REBOTES')).toEqual({ min: 7, max: 9.8 })
    expect(faixa('SUPORTE', 'REBOTES')).toEqual({ min: 4, max: 6.9 })

    expect(faixa('MVP', 'ASSISTENCIAS')).toEqual({ min: 8 })
    expect(faixa('ALL_STAR', 'ASSISTENCIAS')).toEqual({ min: 6, max: 7.9 })
    expect(faixa('SUPORTE', 'ASSISTENCIAS')).toEqual({ min: 4, max: 5.9 })

    // O documento não classifica randola em nenhum dos dois, e PONTOS ele
    // classifica por lista, sem faixa. Inventar qualquer uma seria inventar
    // regra — ver as perguntas 2 e 4 de docs/05-perguntas-abertas.md.
    expect(faixa('RANDOLA', 'REBOTES')).toBeUndefined()
    expect(faixa('RANDOLA', 'ASSISTENCIAS')).toBeUndefined()
    expect(faixa('MVP', 'PONTOS')).toBeUndefined()
  })
})

describe('auditoria da configurabilidade · CLAUDE.md regra 1', () => {
  it('acumula_bonus=false desliga o bônus do turbo sem desligar o turbo', () => {
    const mvp = jogador('mvp-pontos', 1, 'MVP')
    mvp.classificacoes = { PONTOS: 'MVP' }
    mvp.medias.PONTOS = 30
    mvp.historico = [20, 21, 22].map((pontos, i) => ({
      jogoId: `anterior-${i}`,
      data: '2026-09-07',
      jogou: true,
      pontos,
      rebotes: 0,
      assistencias: 0,
    }))
    const time = { id: 'NYK', sigla: 'NYK', jogadores: [mvp] }
    const semAcumulo = structuredClone(homologado)
    semAcumulo.oscilacao.turbo.acumula_bonus = false
    const linha25 = (ruleset: Ruleset) =>
      apitos(time, partida(), ruleset).find((a) => a.atributo === 'PONTOS' && a.linha === 25)

    // P9 permanece homologada: ligado = 90 + 4. Só o clone muda a opção.
    expect(linha25(homologado)).toMatchObject({ turbo: true, confianca: 94 })
    expect(linha25(semAcumulo)).toMatchObject({ turbo: true, confianca: 90 })
  })
})

describe('auditoria do Fire Live · fronteira entre atributos', () => {
  it('P663: a OPD pré-live de pontos só aparece no apito ao vivo de pontos', () => {
    const atleta = jogador('atleta-com-tres-atributos', 1, 'ALL_STAR')
    atleta.classificacoes = { PONTOS: 'ALL_STAR', REBOTES: 'ALL_STAR', ASSISTENCIAS: 'ALL_STAR' }
    atleta.medias = { PONTOS: 24, REBOTES: 10, ASSISTENCIAS: 8 }
    const time = { id: 'NYK', sigla: 'NYK', jogadores: [atleta] }
    const jogo = partida()
    jogo.quartoAtual = 1
    jogo.estatisticasQuarto = [
      { jogadorId: atleta.id, quarto: 1, pontos: 9, rebotes: 5, assistencias: 3 },
    ]

    const resultado = avaliarFireLive(time, jogo, tresAtributos, {
      opdPreLive: new Map([[atleta.id, 1]]),
    })
    expect(Object.fromEntries(resultado.apitos.map((a) => [a.atributo, a.opdOrigemNivel]))).toEqual(
      {
        PONTOS: 1,
        REBOTES: null,
        ASSISTENCIAS: null,
      },
    )
  })

  it('P5/P6: um classificado somente em rebotes não libera o bloqueio dos suportes em pontos', () => {
    const especialista = jogador('somente-rebotes', 1, 'MVP')
    especialista.posicaoHierarquiaPorAtributo = { REBOTES: 1 }
    const topo = jogador('primeiro-em-pontos', 2, 'ALL_STAR')
    topo.classificacoes = { PONTOS: 'ALL_STAR' }
    topo.posicaoHierarquiaPorAtributo = { PONTOS: 1 }
    const suporte = jogador('suporte-em-pontos', 3, 'SUPORTE')
    suporte.classificacoes = { PONTOS: 'SUPORTE' }
    suporte.posicaoHierarquiaPorAtributo = { PONTOS: 2 }
    suporte.medias.PONTOS = 16
    const time = { id: 'NYK', sigla: 'NYK', jogadores: [especialista, topo, suporte] }
    const jogo = partida([especialista.id])
    jogo.quartoAtual = 1
    jogo.estatisticasQuarto = [
      { jogadorId: suporte.id, quarto: 1, pontos: 6, rebotes: 0, assistencias: 0 },
    ]

    // Gap pré-existente, não consequência de `niveis.atributos`: este teste
    // NÃO exercita hoje um vazamento de hierarquia entre atributos, com
    // nenhum dos dois rulesets. `avaliarFireLive` descarta jogadores FORA
    // antes do loop `for (const atributo of ruleset.niveis.atributos)`
    // (`fire-live/avaliar.ts:90`, antes da linha 97) — `especialista` sai do
    // cálculo ali, qualquer que seja o array. E `topoLiberado` só é chamado
    // sob `atributo === 'PONTOS'`, fixo em `avaliar.ts:124`; não há caminho
    // que leve `blocoDeTopo`/`topoLiberado` por REBOTES. `blocoDeTopo(time,
    // 'PONTOS')` também filtra por `classificacoes['PONTOS'] !== undefined`,
    // e `especialista` só tem `{ REBOTES: 'MVP' }` — fora da hierarquia de
    // PONTOS de qualquer forma. O teste passa porque `topo` (o líder real de
    // PONTOS) está em quadra e bloqueia `suporte`, não por causa de nada
    // cross-atributo. Trocar para `tresAtributos` aqui seria um no-op.
    const resultado = avaliarFireLive(time, jogo, homologado, { opdPreLive: new Map() })
    expect(resultado.apitos.filter((a) => a.jogadorId === suporte.id)).toEqual([])
  })

  it('P6: sem MVP, escolhe o primeiro do atributo e não a posição legada de outro atributo', () => {
    const primeiroEmRebotes = jogador('primeiro-em-rebotes', 1, 'ALL_STAR')
    primeiroEmRebotes.classificacoes.PONTOS = 'SUPORTE'
    primeiroEmRebotes.posicaoHierarquiaPorAtributo = { REBOTES: 1, PONTOS: 2 }
    const primeiroEmPontos = jogador('primeiro-em-pontos', 3, 'SUPORTE')
    primeiroEmPontos.classificacoes.PONTOS = 'ALL_STAR'
    primeiroEmPontos.posicaoHierarquiaPorAtributo = { REBOTES: 3, PONTOS: 1 }
    const time = { id: 'NYK', sigla: 'NYK', jogadores: [primeiroEmRebotes, primeiroEmPontos] }

    expect(blocoDeTopo(time, 'PONTOS').map((j) => j.id)).toEqual([primeiroEmPontos.id])
  })
})

// A virada da temporada exibida é calendário operacional, não estratégia — mas
// vive no ruleset pela mesma razão que `mes_inicio`: nenhum número de
// calendário solto no código (regra 1).
describe('piso de virada da temporada exibida', () => {
  it('o ruleset homologado declara o piso', () => {
    expect(homologado.temporada.minimo_jogos_para_exibir).toBe(1)
  })

  it('o schema recusa o piso ausente em vez de assumir um default', () => {
    const semPiso = structuredClone(homologado) as Record<string, unknown>
    const temporada = { ...(semPiso['temporada'] as Record<string, unknown>) }
    delete temporada['minimo_jogos_para_exibir']
    semPiso['temporada'] = temporada

    expect(() => rulesetSchema.parse(semPiso)).toThrow()
  })

  it('o schema recusa piso zero: a temporada sem jogo nenhum nunca é a exibida', () => {
    const zerado = structuredClone(homologado) as Record<string, unknown>
    zerado['temporada'] = {
      ...(zerado['temporada'] as Record<string, unknown>),
      minimo_jogos_para_exibir: 0,
    }

    expect(() => rulesetSchema.parse(zerado)).toThrow()
  })
})
