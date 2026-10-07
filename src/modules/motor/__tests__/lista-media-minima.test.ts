import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { avaliar } from '../index'
import { carregarRuleset } from '../ruleset/carregar'
import type { Ruleset } from '../ruleset/schema'
import type { Atributo, Fatos, JogadorFato } from '../tipos'

/**
 * REUNIÃO DE 23/09 (CJ): "a Lista Secreta só apita quem tem média de 4 ou mais
 * em assistências e rebotes — fora do Fire Live". Ver a spec
 * 2026-10-06-ajustes-reuniao-23-09-design.md, §2.2.
 */
const ruleset = carregarRuleset(yamlBruto)

function semMinimo(): Ruleset {
  const copia = structuredClone(ruleset)
  for (const bloco of Object.values(copia.por_atributo)) delete bloco?.lista_media_minima
  return copia
}

/**
 * Suporte em assistências que zerou nos dois últimos jogos — apita por
 * oscilação no nível 2 (o Suporte só entra na Lista a partir do nível 2).
 */
function fatosCom(atributo: Atributo, media: number): Fatos {
  const jogador: JogadorFato = {
    id: 'j1',
    nome: 'Armador',
    timeId: 't1',
    posicaoHierarquia: 3,
    classificacoes: { PONTOS: 'SUPORTE', [atributo]: 'SUPORTE' },
    medias: { PONTOS: 12, [atributo]: media },
    historico: [
      { jogoId: 'h1', data: '2026-01-04', jogou: true, pontos: 12, rebotes: 0, assistencias: 0 },
      { jogoId: 'h2', data: '2026-01-02', jogou: true, pontos: 12, rebotes: 0, assistencias: 0 },
    ],
  }
  return {
    dataReferencia: '2026-01-05',
    times: [
      { id: 't1', sigla: 'AAA', jogadores: [jogador] },
      { id: 't2', sigla: 'BBB', jogadores: [] },
    ],
    jogos: [
      {
        id: 'g1',
        timeCasaId: 't1',
        timeVisitanteId: 't2',
        quartoAtual: null,
        escalacao: {},
        estatisticasQuarto: [],
      },
    ],
  }
}

const daLista = (r: Ruleset, f: Fatos, atributo: Atributo) =>
  avaliar(f, r).filter((a) => a.estrategia === 'LISTA_SECRETA' && a.atributo === atributo)

describe('Lista Secreta: média mínima de 4 em assistências e rebotes', () => {
  it('o ruleset liga os três atributos e põe 4 em REB e AST — PONTOS sem mínimo', () => {
    expect(ruleset.niveis.atributos).toEqual(['PONTOS', 'REBOTES', 'ASSISTENCIAS'])
    expect(ruleset.por_atributo.REBOTES?.lista_media_minima).toBe(4)
    expect(ruleset.por_atributo.ASSISTENCIAS?.lista_media_minima).toBe(4)
    expect(ruleset.por_atributo.PONTOS).toBeUndefined()
  })

  it('controle: sem o mínimo, a média 3,9 apitaria', () => {
    expect(daLista(semMinimo(), fatosCom('ASSISTENCIAS', 3.9), 'ASSISTENCIAS').length).toBeGreaterThan(0)
  })

  it('média 3,9 em assistências não apita na Lista', () => {
    expect(daLista(ruleset, fatosCom('ASSISTENCIAS', 3.9), 'ASSISTENCIAS')).toEqual([])
  })

  it('média 4,0 apita — o mínimo é inclusivo ("de 4 para cima")', () => {
    expect(daLista(ruleset, fatosCom('ASSISTENCIAS', 4), 'ASSISTENCIAS').length).toBeGreaterThan(0)
  })

  it('pontos não tem mínimo: o jogador continua apitando em pontos', () => {
    const fatos = fatosCom('ASSISTENCIAS', 3.9)
    const comPontos = structuredClone(fatos)
    for (const jogo of comPontos.times[0]!.jogadores[0]!.historico) jogo.pontos = 0
    expect(daLista(ruleset, comPontos, 'PONTOS').length).toBeGreaterThan(0)
  })
})
