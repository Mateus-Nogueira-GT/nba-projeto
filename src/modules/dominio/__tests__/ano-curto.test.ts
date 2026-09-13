import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { dataDeReferencia } from '../rodada'
import { calendarioDoRuleset, temporadaDe } from '../temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'

const FUSO = 'America/Sao_Paulo'

describe('ano com quatro dígitos (diagnóstico de 13/09, B2)', () => {
  it('dataDeReferencia não perde os zeros do ano', () => {
    expect(dataDeReferencia(new Date('0001-01-01T12:00:00.000Z'), FUSO)).toBe('0001-01-01')
    expect(dataDeReferencia(new Date('0999-12-31T12:00:00.000Z'), FUSO)).toBe('0999-12-31')
    expect(dataDeReferencia(new Date('2026-01-15T18:00:00.000Z'), FUSO)).toBe('2026-01-15')
  })

  it('temporadaDe escreve o ano inicial com quatro dígitos — é ele que vira a abertura da temporada', () => {
    const cal = calendarioDoRuleset(carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8')))
    const rotulo = temporadaDe(new Date('0001-01-01T12:00:00.000Z'), cal)
    expect(rotulo).toMatch(/^\d{4}(-\d{2})?$/)
    expect(rotulo.startsWith('0000')).toBe(true)
  })
})
