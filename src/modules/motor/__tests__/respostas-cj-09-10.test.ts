import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { avaliar } from '../index'
import { calcularConfianca, linhasDoNivel } from '../confianca'
import { alvoFireLive } from '../fire-live/alvo'
import { avaliarFireLive } from '../fire-live/avaliar'
import { carregarRuleset } from '../ruleset/carregar'
import type { Ruleset } from '../ruleset/schema'
import { NIVEIS } from '../tipos'
import type { Atributo, Fatos, JogadorFato, NivelApito } from '../tipos'

/**
 * RESPOSTAS DO CJ DE 09/10. Ver a spec 2026-10-09-respostas-cj-matchup-design.md.
 *
 * 2. "Assistências (e rebotes) não têm % de confiança: vale a cor do apito."
 * 3. "Média mínima 4 em REB e AST (...) no Fire Live é basicamente isso também."
 */
const ruleset = carregarRuleset(yamlBruto)

describe('N1 · rebotes e assistências sem nota de confiança', () => {
  it('o ruleset não traz tabela de confiança para REB e AST', () => {
    expect(ruleset.por_atributo.REBOTES?.confianca).toBeUndefined()
    expect(ruleset.por_atributo.ASSISTENCIAS?.confianca).toBeUndefined()
  })

  it.each<Atributo>(['REBOTES', 'ASSISTENCIAS'])(
    '%s: a confiança é nula em todo nível do jogador, linha e nível do apito',
    (atributo) => {
      for (const nivel of NIVEIS) {
        for (const linha of linhasDoNivel(nivel, atributo, ruleset)) {
          for (const nivelApito of [1, 2, 3] as NivelApito[]) {
            expect(calcularConfianca(nivel, atributo, linha, nivelApito, ruleset)).toBeNull()
          }
        }
      }
    },
  )

  it('as linhas continuam existindo — sem nota não é sem apito', () => {
    expect(linhasDoNivel('MVP', 'REBOTES', ruleset)).toEqual([8, 10, 12])
    expect(linhasDoNivel('MVP', 'ASSISTENCIAS', ruleset)).toEqual([5, 7, 9])
    expect(linhasDoNivel('SUPORTE', 'ASSISTENCIAS', ruleset)).toEqual([3, 5])
  })

  it('PONTOS não muda: a âncora A15 continua 94', () => {
    expect(calcularConfianca('MVP', 'PONTOS', 25, 3, ruleset)).toBe(94)
  })

  it('um bloco de atributo sem `confianca` nem `linhas` é válido e não oferece linha', () => {
    const copia = structuredClone(ruleset)
    delete copia.por_atributo.REBOTES!.linhas
    expect(linhasDoNivel('MVP', 'REBOTES', copia)).toEqual([])
  })

  it('a Lista apita assistências com confiança nula', () => {
    const jogador: JogadorFato = {
      id: 'j1',
      nome: 'Armador',
      timeId: 't1',
      posicaoHierarquia: 3,
      classificacoes: { PONTOS: 'SUPORTE', ASSISTENCIAS: 'SUPORTE' },
      medias: { PONTOS: 12, ASSISTENCIAS: 5 },
      historico: [
        { jogoId: 'h1', data: '2026-01-04', jogou: true, pontos: 12, rebotes: 0, assistencias: 0 },
        { jogoId: 'h2', data: '2026-01-02', jogou: true, pontos: 12, rebotes: 0, assistencias: 0 },
      ],
    }
    const fatos: Fatos = {
      dataReferencia: '2026-01-05',
      times: [
        { id: 't1', sigla: 'AAA', jogadores: [jogador] },
        { id: 't2', sigla: 'BBB', jogadores: [] },
      ],
      jogos: [
        { id: 'g1', timeCasaId: 't1', timeVisitanteId: 't2', quartoAtual: null, escalacao: {}, estatisticasQuarto: [] },
      ],
    }
    const apitos = avaliar(fatos, ruleset).filter((a) => a.atributo === 'ASSISTENCIAS')
    expect(apitos.length).toBeGreaterThan(0)
    expect(apitos.every((a) => a.confianca === null)).toBe(true)
  })
})

describe('N2 · Fire Live: média mínima 4 em rebotes', () => {
  const alvo = (media: number) =>
    alvoFireLive({ mediaPorJogo: media, atributo: 'REBOTES', nivel: 'SUPORTE' }, ruleset)

  it('a chave vive no ruleset, ao lado da de assistências', () => {
    expect(ruleset.fire_live.rebotes.media_minima).toBe(4)
    expect(ruleset.fire_live.assistencias.media_minima).toBe(4)
  })

  it('média 3,9 não tem alvo de rebotes', () => {
    // 3,9 / 4 × 2 = 1,95 → 2, que a trava (> 2) já reprova. O controle abaixo
    // mostra que é o mínimo, e não a trava, quem barra.
    expect(alvo(3.9)).toBeNull()
  })

  it('controle: com o mínimo mais baixo, a trava é quem decide', () => {
    const copia: Ruleset = structuredClone(ruleset)
    copia.fire_live.rebotes.media_minima = 0
    copia.fire_live.travas.rebotes_alvo_minimo = 0
    expect(alvoFireLive({ mediaPorJogo: 3.9, atributo: 'REBOTES', nivel: 'SUPORTE' }, copia)).not.toBeNull()

    const comMinimo: Ruleset = structuredClone(copia)
    comMinimo.fire_live.rebotes.media_minima = 4
    expect(alvoFireLive({ mediaPorJogo: 3.9, atributo: 'REBOTES', nivel: 'SUPORTE' }, comMinimo)).toBeNull()
  })

  it('média 4,0 entra — o mínimo é inclusivo ("de 4 para cima")', () => {
    const copia: Ruleset = structuredClone(ruleset)
    copia.fire_live.travas.rebotes_alvo_minimo = 0
    expect(alvoFireLive({ mediaPorJogo: 4, atributo: 'REBOTES', nivel: 'SUPORTE' }, copia)).toBe(2)
  })

  it('o avaliador do 1º quarto não apita rebote de quem tem média 3,9', () => {
    const copia: Ruleset = structuredClone(ruleset)
    copia.fire_live.travas.rebotes_alvo_minimo = 0
    const pivo: JogadorFato = {
      id: 'pivo',
      nome: 'Pivô',
      timeId: 'TIME',
      posicaoHierarquia: 4,
      classificacoes: { REBOTES: 'SUPORTE' },
      medias: { REBOTES: 3.9 },
      historico: [],
    }
    const jogo = {
      id: 'jogo',
      timeCasaId: 'TIME',
      timeVisitanteId: 'OUTRO',
      quartoAtual: copia.fire_live.quarto,
      escalacao: {},
      estatisticasQuarto: [
        { jogadorId: 'pivo', quarto: copia.fire_live.quarto, pontos: 0, rebotes: 6, assistencias: 0 },
      ],
    }
    const time = { id: 'TIME', sigla: 'TIM', jogadores: [pivo] }
    const deRebotes = (r: Ruleset) =>
      avaliarFireLive(time, jogo, r, { opdPreLive: new Map() }).apitos.filter((a) => a.atributo === 'REBOTES')

    expect(deRebotes(copia)).toEqual([])
    const semMinimo: Ruleset = structuredClone(copia)
    semMinimo.fire_live.rebotes.media_minima = 0
    expect(deRebotes(semMinimo)).toHaveLength(1)
  })
})
