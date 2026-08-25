import { describe, expect, it } from 'vitest'

import { dataDeReferencia, intervaloDoDia, somarDias } from '../rodada'

const SP = 'America/Sao_Paulo'
const NY = 'America/New_York'

describe('data de referência da rodada', () => {
  it('em Brasília o dia ainda não virou às 21h — o defeito que motivou tudo', () => {
    // 2026-08-24T00:30Z é 2026-08-23 21:30 em Brasília.
    const instante = new Date('2026-08-24T00:30:00.000Z')

    expect(dataDeReferencia(instante, SP)).toBe('2026-08-23')
    // O cálculo antigo, por UTC, já dizia 24 — e a lista do assinante esvaziava.
    expect(instante.toISOString().slice(0, 10)).toBe('2026-08-24')
  })

  it('vira exatamente à meia-noite local', () => {
    expect(dataDeReferencia(new Date('2026-08-24T02:59:59.999Z'), SP)).toBe('2026-08-23')
    expect(dataDeReferencia(new Date('2026-08-24T03:00:00.000Z'), SP)).toBe('2026-08-24')
  })

  it('funciona em qualquer fuso — a alternativa é diff de YAML', () => {
    // 01:00Z de 24/08 é ainda 21:00 de 23/08 em Nova York (verão, UTC-4).
    expect(dataDeReferencia(new Date('2026-08-24T01:00:00.000Z'), NY)).toBe('2026-08-23')
  })
})

describe('intervalo do dia', () => {
  it('Brasília é UTC-3 o ano inteiro: 03:00Z a 03:00Z', () => {
    const { inicio, fim } = intervaloDoDia('2026-08-24', SP)

    expect(inicio.toISOString()).toBe('2026-08-24T03:00:00.000Z')
    expect(fim.toISOString()).toBe('2026-08-25T03:00:00.000Z')
  })

  it('o intervalo contém todo instante daquele dia local e nenhum de fora', () => {
    const { inicio, fim } = intervaloDoDia('2026-08-24', SP)

    for (const iso of ['2026-08-24T03:00:00.000Z', '2026-08-25T02:59:59.999Z']) {
      expect(dataDeReferencia(new Date(iso), SP)).toBe('2026-08-24')
      expect(new Date(iso) >= inicio && new Date(iso) < fim).toBe(true)
    }
    expect(new Date('2026-08-24T02:59:59.999Z') >= inicio).toBe(false)
    expect(new Date('2026-08-25T03:00:00.000Z') < fim).toBe(false)
  })

  it('acerta a borda do horário de verão — o dia que tem 23 horas', () => {
    // Nova York entra no horário de verão em 08/03/2026 às 02:00 locais.
    const { inicio, fim } = intervaloDoDia('2026-03-08', NY)

    expect(inicio.toISOString()).toBe('2026-03-08T05:00:00.000Z')
    expect(fim.toISOString()).toBe('2026-03-09T04:00:00.000Z')
    expect(fim.getTime() - inicio.getTime()).toBe(23 * 60 * 60_000)
  })

  it('e o dia que tem 25 horas, na saída', () => {
    // Sai em 01/11/2026 às 02:00 locais.
    const { inicio, fim } = intervaloDoDia('2026-11-01', NY)

    expect(fim.getTime() - inicio.getTime()).toBe(25 * 60 * 60_000)
  })
})

describe('somar dias', () => {
  it('anda no calendário sem escorregar por causa de fuso', () => {
    expect(somarDias('2026-08-24', 1)).toBe('2026-08-25')
    expect(somarDias('2026-08-24', -1)).toBe('2026-08-23')
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01')
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31')
    // Atravessa a entrada do horário de verão americano sem pular um dia.
    expect(somarDias('2026-03-07', 1)).toBe('2026-03-08')
  })
})
