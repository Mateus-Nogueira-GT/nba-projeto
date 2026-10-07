import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { carregarRuleset } from '../../motor/ruleset/carregar'
import { hora } from '../../../ui/formato'
import { dataDeReferencia, intervaloDoDia } from '../rodada'
import { calendarioDoRuleset, temporadaDe } from '../temporada'

/**
 * A RODADA PELA DATA DOS EUA (decisão do parceiro, 07/10/2026): "o jogo deve
 * contar no dia em que foi marcado nos EUA". O dia sai de `rodada.fuso`; o
 * relógio da tela, de `rodada.fuso_exibicao`. Lido do ruleset de verdade:
 * se alguém voltar a chave para Brasília, é este teste que avisa.
 */
const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const { fuso, fuso_exibicao } = ruleset.rodada

describe('rodada pela data dos EUA', () => {
  it('o ruleset separa o dia (Nova York) do relógio da tela (Brasília)', () => {
    expect(fuso).toBe('America/New_York')
    expect(fuso_exibicao).toBe('America/Sao_Paulo')
  })

  it('jogo às 21h de NY em 08/11 pertence à rodada de 08/11 e a tela mostra 23:00', () => {
    // 2025-11-09T02:00Z = 08/11 21:00 em Nova York (UTC-5) = 08/11 23:00 em Brasília.
    const tipoff = new Date('2025-11-09T02:00:00.000Z')

    expect(dataDeReferencia(tipoff, fuso)).toBe('2025-11-08')
    expect(hora(tipoff, fuso_exibicao)).toBe('23:00')
  })

  it('jogo às 22h de NY começa à meia-noite de Brasília e continua na rodada de NY', () => {
    // DEN×GSW, 2025-11-08T03:00Z = 07/11 22:00 em NY = 08/11 00:00 em Brasília.
    const denGsw = new Date('2025-11-08T03:00:00.000Z')
    // DEN×IND, 2025-11-09T02:00Z = 08/11 21:00 em NY.
    const denInd = new Date('2025-11-09T02:00:00.000Z')

    expect(dataDeReferencia(denGsw, fuso)).toBe('2025-11-07')
    expect(dataDeReferencia(denInd, fuso)).toBe('2025-11-08')
    // O relógio da tela continua o de Brasília: meia-noite.
    expect(hora(denGsw, fuso_exibicao)).toBe('00:00')

    // A consulta por intervalo (a que montarFatos e as telas usam) concorda.
    const rodada08 = intervaloDoDia('2025-11-08', fuso)
    const dentro = (d: Date) => d >= rodada08.inicio && d < rodada08.fim
    expect(dentro(denInd)).toBe(true)
    expect(dentro(denGsw)).toBe(false)
  })

  it('no horário de verão americano (UTC-4) a borda acompanha o fuso de verdade', () => {
    // 2026-10-21T03:30Z = 20/10 23:30 em NY (EDT) = 21/10 00:30 em Brasília.
    const tipoff = new Date('2026-10-21T03:30:00.000Z')

    expect(dataDeReferencia(tipoff, fuso)).toBe('2026-10-20')
    expect(hora(tipoff, fuso_exibicao)).toBe('00:30')
  })

  it('a virada de temporada também segue o dia de NY', () => {
    // 01/10/2026 02:00Z ainda é 30/09 em NY: a temporada é a anterior.
    const calendario = calendarioDoRuleset(ruleset)
    expect(calendario.fuso).toBe('America/New_York')
    const antes = temporadaDe(new Date('2026-10-01T02:00:00.000Z'), calendario)
    const depois = temporadaDe(new Date('2026-10-01T05:00:00.000Z'), calendario)
    expect(antes).not.toBe(depois)
  })
})
