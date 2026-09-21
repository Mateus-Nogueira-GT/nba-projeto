import { describe, it, expect } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '../ruleset/carregar'
import { avaliar } from '../index'
import { limiarOscilacao, avaliarOscilacao } from '../lista-secreta/oscilacao'
import { avaliarOpd } from '../lista-secreta/opd'
import { alvoFireLive } from '../fire-live/alvo'
import { emModoFire } from '../fire-live/modo-fire'
import { topoLiberado } from '../fire-live/bloco-topo'
import { calcularConfianca } from '../confianca'
import type {
  Atributo,
  Fatos,
  JogadorFato,
  JogoFato,
  JogoHistorico,
  Nivel,
  StatusEscalacao,
  TimeFato,
} from '../tipos'

// O ruleset REAL do projeto. Sem mock, sem fixture paralela: se o YAML mudar,
// estes testes mudam junto — que é exatamente o ponto da arquitetura.
const ruleset = carregarRuleset(yamlBruto)

// ---------------------------------------------------------------------------
// Construtores de fatos — dados puros, nenhum mock
// ---------------------------------------------------------------------------

function jogador(
  id: string,
  posicao: number,
  nivel: Nivel | null,
  extras: Partial<JogadorFato> = {},
): JogadorFato {
  return {
    id,
    nome: id,
    timeId: 'time',
    posicaoHierarquia: posicao,
    classificacoes: nivel ? { PONTOS: nivel } : {},
    medias: {},
    historico: [],
    ...extras,
  }
}

function comTime(time: string, jogadores: JogadorFato[]): JogadorFato[] {
  return jogadores.map((j) => ({ ...j, timeId: time }))
}

/** Lakers, hierarquia do documento do CJ. */
const LAKERS: TimeFato = {
  id: 'LAL',
  sigla: 'LAL',
  jogadores: comTime('LAL', [
    jogador('luka-doncic', 1, 'MVP'),
    jogador('austin-reaves', 2, 'ALL_STAR'),
    jogador('grimes', 3, 'SUPORTE'),
    jogador('kessler', 4, 'SUPORTE'),
    jogador('mamukelashvili', 5, 'RANDOLA'),
    jogador('sexton', 6, 'RANDOLA'),
    jogador('laravia', 7, 'RANDOLA'),
  ]),
}

/** Philadelphia — o único time com DOIS jogadores nível MVP (P7). */
const PHILADELPHIA: TimeFato = {
  id: 'PHI',
  sigla: 'PHI',
  jogadores: comTime('PHI', [
    jogador('embiid', 1, 'MVP'),
    jogador('jaylen-brown', 2, 'MVP'),
    jogador('maxey', 3, 'ALL_STAR'),
    jogador('lebron-james', 4, 'SUPORTE'),
    jogador('edgecombe', 5, 'SUPORTE'),
    jogador('simmons', 6, 'SUPORTE'),
    jogador('barlow', 7, 'RANDOLA'),
  ]),
}

/** Charlotte — um dos 15 times SEM nenhum jogador nível MVP (P6). */
const CHARLOTTE: TimeFato = {
  id: 'CHA',
  sigla: 'CHA',
  jogadores: comTime('CHA', [
    jogador('brandon-miller', 1, 'ALL_STAR'),
    jogador('knueppel', 2, 'SUPORTE'),
    jogador('coby-white', 3, 'SUPORTE'),
    jogador('naz-reid', 4, 'SUPORTE'),
    jogador('grayson-allen', 5, 'SUPORTE'),
    jogador('diabate', 6, 'RANDOLA'),
  ]),
}

function jogo(id: string, casa: string, fora: Record<string, StatusEscalacao> = {}): JogoFato {
  return {
    id,
    timeCasaId: casa,
    timeVisitanteId: 'ADV',
    quartoAtual: null,
    escalacao: fora,
    estatisticasQuarto: [],
  }
}

/** Histórico do mais recente para o mais antigo. `null` = DNP. */
function historico(pontos: (number | null)[]): JogoHistorico[] {
  return pontos.map((p, i) => ({
    jogoId: `j${i}`,
    data: `2026-08-${String(18 - i).padStart(2, '0')}`,
    jogou: p !== null,
    pontos: p ?? 0,
    rebotes: 0,
    assistencias: 0,
  }))
}

const PONTOS: Atributo = 'PONTOS'

// ===========================================================================
// A1..A9 — exemplos numéricos do documento do CJ
// ===========================================================================

describe('A1 · limiar de oscilação', () => {
  it('LeBron, média 25,7, Suporte (delta 5) → limiar 20,7; jogo de 20 conta como abaixo', () => {
    const limiar = limiarOscilacao(25.7, 'SUPORTE', PONTOS, 'lebron-james', ruleset)!

    expect(limiar).toBeCloseTo(20.7, 10)
    expect(20 <= limiar).toBe(true)
    expect(21 <= limiar).toBe(false)
  })

  it('Luka é a única exceção nominal: delta 7 em vez de 6', () => {
    expect(limiarOscilacao(30, 'MVP', PONTOS, 'luka-doncic', ruleset)).toBeCloseTo(23, 10)
    expect(limiarOscilacao(30, 'MVP', PONTOS, 'jokic', ruleset)).toBeCloseTo(24, 10)
  })
})

describe('A2..A5 · alvos do Fire Live no 1º quarto', () => {
  it('A2 · 24 ppg, classificado → alvo 9', () => {
    expect(alvoFireLive({ mediaPorJogo: 24, atributo: PONTOS, nivel: 'ALL_STAR' }, ruleset)).toBe(9)
  })

  it('A3 · 5,4 ppg, NÃO classificado → alvo 4', () => {
    expect(alvoFireLive({ mediaPorJogo: 5.4, atributo: PONTOS, nivel: null }, ruleset)).toBe(4)
  })

  it('jogador não classificado não recebe a trava mínima de pontos', () => {
    expect(alvoFireLive({ mediaPorJogo: 1.2, atributo: PONTOS, nivel: null }, ruleset)).toBe(1)
  })

  it('jogador não classificado continua inelegível em rebotes e assistências', () => {
    expect(alvoFireLive({ mediaPorJogo: 20, atributo: 'REBOTES', nivel: null }, ruleset)).toBeNull()
    expect(
      alvoFireLive({ mediaPorJogo: 20, atributo: 'ASSISTENCIAS', nivel: null }, ruleset),
    ).toBeNull()
  })

  it('A4 · 5 apg → alvo 2', () => {
    expect(
      alvoFireLive({ mediaPorJogo: 5, atributo: 'ASSISTENCIAS', nivel: 'ALL_STAR' }, ruleset),
    ).toBe(2)
  })

  it('A5 · 11 rpg → alvo 6', () => {
    expect(alvoFireLive({ mediaPorJogo: 11, atributo: 'REBOTES', nivel: 'MVP' }, ruleset)).toBe(6)
  })

  it('travas: pontos exige alvo >= 4, rebotes exige alvo > 2 (assimetria proposital)', () => {
    // 8 ppg -> 2 por quarto -> x1,5 = 3 -> abaixo de 4, não vale
    expect(
      alvoFireLive({ mediaPorJogo: 8, atributo: PONTOS, nivel: 'ALL_STAR' }, ruleset),
    ).toBeNull()
    // 4 rpg -> 1 por quarto -> x2 = 2 -> não PASSA de 2, não vale
    expect(alvoFireLive({ mediaPorJogo: 4, atributo: 'REBOTES', nivel: 'MVP' }, ruleset)).toBeNull()
    // assistências: só entra quem tem média >= 4 (documento de 21/09; a versão
    // anterior dizia >= 5)
    expect(
      alvoFireLive({ mediaPorJogo: 3.9, atributo: 'ASSISTENCIAS', nivel: 'MVP' }, ruleset),
    ).toBeNull()
  })

  it('Randola usa multiplicador 2,5 em vez de 1,5', () => {
    expect(alvoFireLive({ mediaPorJogo: 24, atributo: PONTOS, nivel: 'RANDOLA' }, ruleset)).toBe(15)
  })
})

describe('A6/A7 · OPD exige desfalque em prefixo da hierarquia', () => {
  it('A6 · Luka + Reaves fora → Grimes 3, Kessler 2, Mamukelashvili 1', () => {
    const partida = jogo('g1', 'LAL', { 'luka-doncic': 'FORA', 'austin-reaves': 'FORA' })

    expect(avaliarOpd(LAKERS, partida, ruleset)).toEqual([
      { jogadorId: 'grimes', nivelApito: 3 },
      { jogadorId: 'kessler', nivelApito: 2 },
      { jogadorId: 'mamukelashvili', nivelApito: 1 },
    ])
  })

  it('A7 · Reaves fora com Luka jogando → nenhum apito', () => {
    const partida = jogo('g1', 'LAL', { 'austin-reaves': 'FORA' })

    expect(avaliarOpd(LAKERS, partida, ruleset)).toEqual([])
  })

  it('só Luka fora → Reaves 3, Grimes 2, Kessler 1', () => {
    const partida = jogo('g1', 'LAL', { 'luka-doncic': 'FORA' })

    expect(avaliarOpd(LAKERS, partida, ruleset)).toEqual([
      { jogadorId: 'austin-reaves', nivelApito: 3 },
      { jogadorId: 'grimes', nivelApito: 2 },
      { jogadorId: 'kessler', nivelApito: 1 },
    ])
  })
})

describe('A8 · sequência de oscilação', () => {
  it('LeBron média 25, jogos 25/16/20 → oscilação nível 2', () => {
    // Suporte só apita a partir do nível 2 — este caso emite.
    const lebron = jogador('lebron-james', 4, 'SUPORTE', {
      medias: { PONTOS: 25 },
      historico: historico([20, 16, 25]),
    })

    expect(avaliarOscilacao(lebron, PONTOS, ruleset)).toEqual({ nivelApito: 2, turbo: false })
  })

  it('Suporte com apenas 1 jogo abaixo NÃO emite (nível mínimo 2)', () => {
    const lebron = jogador('lebron-james', 4, 'SUPORTE', {
      medias: { PONTOS: 25 },
      historico: historico([16, 25, 25]),
    })

    expect(avaliarOscilacao(lebron, PONTOS, ruleset)).toBeNull()
  })

  it('critério é o LIMIAR, não a média pura: 23 com limiar 20 não conta', () => {
    const lebron = jogador('lebron-james', 4, 'SUPORTE', {
      medias: { PONTOS: 25 },
      historico: historico([19, 23, 25]),
    })

    // 19 conta (<=20); 23 não conta (>20). Sequência = 1 -> Suporte não emite.
    expect(avaliarOscilacao(lebron, PONTOS, ruleset)).toBeNull()
  })
})

describe('A9 · determinismo e chave de deduplicação', () => {
  const fatos: Fatos = {
    dataReferencia: '2026-08-18',
    times: [LAKERS],
    jogos: [jogo('g1', 'LAL', { 'luka-doncic': 'FORA', 'austin-reaves': 'FORA' })],
  }

  it('avaliar() duas vezes devolve resultado idêntico', () => {
    expect(avaliar(fatos, ruleset)).toEqual(avaliar(fatos, ruleset))
  })

  it('produz apitos e cada um carrega chave (jogo|jogador|atributo|estrategia|linha)', () => {
    const apitos = avaliar(fatos, ruleset)
    expect(apitos.length).toBeGreaterThan(0)

    for (const a of apitos) {
      expect(a.chaveDeduplicacao).toBe(
        [a.jogoId, a.jogadorId, a.atributo, a.estrategia, a.linha ?? ''].join('|'),
      )
    }
  })

  it('nenhuma chave se repete dentro da mesma avaliação', () => {
    const chaves = avaliar(fatos, ruleset).map((a) => a.chaveDeduplicacao)
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})

// ===========================================================================
// A10..A15 — travam as interpretações das respostas do cliente (18/08/2026)
// ===========================================================================

describe('A10 · P2 — DNP não quebra a sequência', () => {
  it('abaixo · DNP · abaixo → nível 2', () => {
    const j = jogador('x', 1, 'ALL_STAR', {
      medias: { PONTOS: 20 },
      historico: historico([12, null, 12, 25]),
    })

    expect(avaliarOscilacao(j, PONTOS, ruleset)).toEqual({ nivelApito: 2, turbo: false })
  })
})

describe('A11/A12 · P7 — Philadelphia tem dois MVPs', () => {
  it('A11 · só Embiid fora → Suporte e Randola BLOQUEADOS', () => {
    const partida = jogo('g2', 'PHI', { embiid: 'FORA' })

    expect(topoLiberado(PHILADELPHIA, partida, PONTOS, ruleset)).toBe(false)
  })

  it('A12 · Embiid E Jaylen Brown fora → Suporte e Randola LIBERADOS', () => {
    const partida = jogo('g2', 'PHI', { embiid: 'FORA', 'jaylen-brown': 'FORA' })

    expect(topoLiberado(PHILADELPHIA, partida, PONTOS, ruleset)).toBe(true)
  })
})

describe('A13 · P6 — time sem nenhum MVP olha o jogador nº 1', () => {
  it('Charlotte com o nº 1 fora → liberados', () => {
    const partida = jogo('g3', 'CHA', { 'brandon-miller': 'FORA' })

    expect(topoLiberado(CHARLOTTE, partida, PONTOS, ruleset)).toBe(true)
  })

  it('Charlotte com o nº 1 jogando → bloqueados', () => {
    expect(topoLiberado(CHARLOTTE, jogo('g3', 'CHA'), PONTOS, ruleset)).toBe(false)
  })

  it('Utah, Detroit e Denver são isentos do bloqueio', () => {
    const utah: TimeFato = { ...LAKERS, id: 'UTA', sigla: 'UTA' }

    expect(topoLiberado(utah, jogo('g4', 'UTA'), PONTOS, ruleset)).toBe(true)
  })
})

describe('A14 · P8 — Randola nunca ganha bônus de nível', () => {
  it('Randola no nível 2 mantém a tabela base', () => {
    expect(calcularConfianca('RANDOLA', PONTOS, 5, 1, ruleset)).toBe(85)
    expect(calcularConfianca('RANDOLA', PONTOS, 5, 2, ruleset)).toBe(85)
    expect(calcularConfianca('RANDOLA', PONTOS, 5, 3, ruleset)).toBe(85)
  })

  it('os demais níveis ganham bônus normalmente', () => {
    expect(calcularConfianca('SUPORTE', PONTOS, 15, 2, ruleset)).toBe(85.5)
    expect(calcularConfianca('ALL_STAR', PONTOS, 20, 2, ruleset)).toBe(86)
  })
})

describe('A15 · P9 — MVP no nível 3 vai pro turbo E acumula os +4%', () => {
  it('turbo azul e confiança 94 na linha de 25', () => {
    const jokic = jogador('jokic', 1, 'MVP', {
      medias: { PONTOS: 30 },
      historico: historico([20, 21, 22, 30]),
    })

    expect(avaliarOscilacao(jokic, PONTOS, ruleset)).toEqual({ nivelApito: 3, turbo: true })
    expect(calcularConfianca('MVP', PONTOS, 25, 3, ruleset)).toBe(94)
  })
})

// ===========================================================================
// PROVA FINAL — configurabilidade sem tocar em código
// ===========================================================================

describe('PROVA FINAL · Modo Fire lê o percentual do ruleset', () => {
  it('MVP com média 30 e 18 pontos no 1Q NÃO entra em modo fire', () => {
    // 18 >= 30 x 0,75 (=22,5)? não.
    // Trocando percentual_media para 0,50 no YAML: 18 >= 15? sim -> este teste falha.
    expect(emModoFire(18, 30, 'MVP', ruleset)).toBe(false)
  })

  it('o limiar homologado é 0,75', () => {
    expect(ruleset.fire_live.modo_fire.percentual_media).toBe(0.75)
  })

  it('com 23 pontos no 1Q, entra', () => {
    expect(emModoFire(23, 30, 'MVP', ruleset)).toBe(true)
  })

  it('Suporte e Randola não entram em modo fire em nenhuma pontuação', () => {
    expect(emModoFire(30, 30, 'SUPORTE', ruleset)).toBe(false)
    expect(emModoFire(30, 30, 'RANDOLA', ruleset)).toBe(false)
  })
})
