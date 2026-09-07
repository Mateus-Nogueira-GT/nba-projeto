import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { somarDias } from '../../dominio/rodada'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { conferirRodadas, recapDaNoite, taxaDaTemporada } from '../resultados'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'
const ONTEM = somarDias(HOJE, -1)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7 })
}, 300_000)
afterAll(async () => banco.fechar())

/**
 * RESULTADOS COMO RECAP DA NOITE (identidade 04). Tudo aqui é leitura
 * derivada de `conferirRodadas`, que já existia: o recap agrupa por jogo e
 * destaca; a taxa da temporada soma. Nada decide estratégia.
 */
describe('o card conferido sabe o que o jogador fez', () => {
  it('cada JogadorConferido traz `fez` (= valor) e `bateuLinhaMaisBaixa`', async () => {
    const [dia] = await conferirRodadas(banco.db, HOJE, 1)
    expect(dia).toBeDefined()
    for (const j of dia!.jogadores) {
      expect(j.fez).toBe(j.valor)
      const linhaMaisBaixa = Math.min(...j.linhas.map((l) => l.linha))
      if (j.valor === null) expect(j.bateuLinhaMaisBaixa).toBeNull()
      else expect(j.bateuLinhaMaisBaixa).toBe(j.valor >= linhaMaisBaixa)
    }
  })
})

describe('recapDaNoite', () => {
  it('conta o que conferirRodadas conta, e agrupa por jogo sem perder card', async () => {
    const [dia] = await conferirRodadas(banco.db, HOJE, 1)
    const recap = await recapDaNoite(banco.db, ONTEM)

    expect(recap.dataReferencia).toBe(ONTEM)
    expect(recap.apitos).toBe(dia!.conferidos)
    expect(recap.bateram).toBe(dia!.acertos)
    expect(recap.taxa).toBeCloseTo(dia!.acertos / dia!.conferidos, 5)
    expect(recap.porJogo.reduce((n, g) => n + g.cards.length, 0)).toBe(dia!.jogadores.length)
    for (const g of recap.porJogo) {
      expect(g.jogo.casaSigla).toMatch(/^[A-Z]{3}$/)
      expect(g.jogo.visitanteSigla).toMatch(/^[A-Z]{3}$/)
      expect(g.jogo.placarCasa).not.toBeNull()
      expect(g.jogo.placarVisitante).not.toBeNull()
      expect(g.jogo.quartosCasa).toHaveLength(4)
      expect(g.jogo.quartosVisitante).toHaveLength(4)
      // todo card do grupo é de um dos dois times do jogo
      for (const c of g.cards) expect([g.jogo.casaSigla, g.jogo.visitanteSigla]).toContain(c.timeSigla)
    }
  })

  it('o apito da noite bateu, e é o que mais passou da linha mais baixa', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const candidatos = recap.porJogo.flatMap((g) => g.cards).filter((c) => c.bateuLinhaMaisBaixa === true)
    if (candidatos.length === 0) {
      expect(recap.apitoDaNoite).toBeNull()
      return
    }
    expect(recap.apitoDaNoite).not.toBeNull()
    const folga = (c: (typeof candidatos)[number]) => c.fez! - Math.min(...c.linhas.map((l) => l.linha))
    const maior = Math.max(...candidatos.map(folga))
    expect(folga(recap.apitoDaNoite!)).toBe(maior)
  })

  it('dia sem lista publicada devolve um recap vazio, não erro', async () => {
    const recap = await recapDaNoite(banco.db, '2020-01-01')
    expect(recap).toMatchObject({ apitos: 0, bateram: 0, taxa: null, apitoDaNoite: null, porJogo: [] })
  })
})

describe('taxaDaTemporada', () => {
  it('é a soma de conferirRodadas sobre a janela — em UMA consulta', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 49)
    const esperado = dias.reduce(
      (acc, d) => ({ conferidos: acc.conferidos + d.conferidos, acertos: acc.acertos + d.acertos }),
      { conferidos: 0, acertos: 0 },
    )
    const taxa = await taxaDaTemporada(banco.db, HOJE, 49)
    expect(taxa.conferidos).toBe(esperado.conferidos)
    expect(taxa.acertos).toBe(esperado.acertos)
    expect(taxa.rodadas).toBe(dias.length)
    expect(taxa.conferidos).toBeGreaterThan(0)
  })

  it('a janela é fechada em `ate` (exclusivo): hoje não conta', async () => {
    const semHoje = await taxaDaTemporada(banco.db, HOJE, 49)
    const comAmanha = await taxaDaTemporada(banco.db, somarDias(HOJE, 1), 50)
    // Hoje ainda não tem box: incluir o dia de hoje na janela não muda nada.
    expect(comAmanha.conferidos).toBe(semHoje.conferidos)
  })
})
