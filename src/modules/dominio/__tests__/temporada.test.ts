import { describe, expect, it } from 'vitest'

import { temporadaDe, temporadaExibida } from '../temporada'

const CONFIG = { mesInicio: 10, formato: 'dois_anos' as const, fuso: 'America/Sao_Paulo' }

describe('temporadaDe', () => {
  it('mantém março de 2026 na temporada NBA 2025-26', () => {
    expect(temporadaDe(new Date('2026-03-15T12:00:00.000Z'), CONFIG)).toBe('2025-26')
  })

  it('vira a temporada na meia-noite do FUSO, não na de UTC', () => {
    // 01/10 às 00:00Z ainda é 30/09 às 21:00 em Brasília: a temporada nova
    // não começou. Este é o comportamento que o fuso do cliente define — e o
    // motivo de a virada não poder ser calculada em UTC.
    expect(temporadaDe(new Date('2026-10-01T00:00:00.000Z'), CONFIG)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T02:59:59.999Z'), CONFIG)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T03:00:00.000Z'), CONFIG)).toBe('2026-27')
  })

  it('trocar o fuso move a fronteira junto', () => {
    const nova_york = { ...CONFIG, fuso: 'America/New_York' }

    // 01/10 às 03:00Z é 30/09 às 23:00 em Nova York — ainda a temporada velha.
    expect(temporadaDe(new Date('2026-10-01T03:00:00.000Z'), nova_york)).toBe('2025-26')
    expect(temporadaDe(new Date('2026-10-01T04:00:00.000Z'), nova_york)).toBe('2026-27')
  })
})

/**
 * A temporada que a TELA mostra — distinta da temporada a que uma data
 * pertence. Entre o lançamento e a primeira bola da temporada nova, as duas
 * divergem por cerca de um mês, e é nessa janela que o assinante paga.
 */
describe('temporadaExibida', () => {
  it('temporada do calendário ainda vazia: mostra a última com dado', () => {
    // 02/10/2026 — o calendário já virou, a bola só sobe em novembro.
    expect(
      temporadaExibida('2026-27', [{ temporada: '2025-26', jogosEncerrados: 1230 }], 1),
    ).toBe('2025-26')
  })

  it('vira no primeiro jogo encerrado, junto com o motor', () => {
    expect(
      temporadaExibida(
        '2026-27',
        [
          { temporada: '2026-27', jogosEncerrados: 1 },
          { temporada: '2025-26', jogosEncerrados: 1230 },
        ],
        1,
      ),
    ).toBe('2026-27')
  })

  it('o piso do ruleset adia a virada sem tocar em código', () => {
    expect(
      temporadaExibida(
        '2026-27',
        [
          { temporada: '2026-27', jogosEncerrados: 1 },
          { temporada: '2025-26', jogosEncerrados: 1230 },
        ],
        30,
      ),
    ).toBe('2025-26')
  })

  it('banco sem dado nenhum devolve a do calendário: tela vazia honesta', () => {
    // Nunca inventar uma temporada que não existe — melhor vazio que errado.
    expect(temporadaExibida('2026-27', [], 1)).toBe('2026-27')
  })

  it('com várias anteriores, escolhe a MAIS RECENTE, não a de maior volume', () => {
    expect(
      temporadaExibida(
        '2026-27',
        [
          { temporada: '2024-25', jogosEncerrados: 1230 },
          { temporada: '2025-26', jogosEncerrados: 4 },
        ],
        1,
      ),
    ).toBe('2025-26')
  })

  it('ignora temporada anterior que não alcança o piso', () => {
    expect(
      temporadaExibida(
        '2026-27',
        [
          { temporada: '2025-26', jogosEncerrados: 2 },
          { temporada: '2024-25', jogosEncerrados: 1230 },
        ],
        10,
      ),
    ).toBe('2024-25')
  })

  it('não mostra temporada FUTURA que por acidente tenha jogo encerrado', () => {
    // Pré-temporada gravada com rótulo adiantado não pode puxar a tela para
    // frente: a consulta anda para trás do calendário, nunca para a frente.
    expect(
      temporadaExibida(
        '2025-26',
        [
          { temporada: '2026-27', jogosEncerrados: 5 },
          { temporada: '2024-25', jogosEncerrados: 1230 },
        ],
        1,
      ),
    ).toBe('2024-25')
  })
})
