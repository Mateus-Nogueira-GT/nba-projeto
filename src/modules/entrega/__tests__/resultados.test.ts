import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
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
      for (const c of g.cards)
        expect([g.jogo.casaSigla, g.jogo.visitanteSigla]).toContain(c.timeSigla)
    }
  })

  it('o apito da noite bateu, e é o que mais passou da linha mais baixa', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const candidatos = recap.porJogo
      .flatMap((g) => g.cards)
      .filter((c) => c.bateuLinhaMaisBaixa === true)
    if (candidatos.length === 0) {
      expect(recap.apitoDaNoite).toBeNull()
      return
    }
    expect(recap.apitoDaNoite).not.toBeNull()
    const folga = (c: (typeof candidatos)[number]) =>
      c.fez! - Math.min(...c.linhas.map((l) => l.linha))
    const maior = Math.max(...candidatos.map(folga))
    expect(folga(recap.apitoDaNoite!)).toBe(maior)
  })

  it('dia sem lista publicada devolve um recap vazio, não erro', async () => {
    const recap = await recapDaNoite(banco.db, '2020-01-01')
    expect(recap).toMatchObject({
      apitos: 0,
      bateram: 0,
      taxa: null,
      apitoDaNoite: null,
      porJogo: [],
    })
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

/**
 * O QUE A TELA NÃO PODE REIMPLEMENTAR (revisão adversarial da 04, rodada 1).
 *
 * Três coisas que a tela de Resultados estava deduzindo sozinha e que são
 * decisão da entrega: qual linha o card confere, em que ponto da noite o jogo
 * está, e se o box OFICIAL do jogo já chegou.
 */
describe('o recap entrega o que a tela precisa, sem a tela deduzir', () => {
  it('cada card traz a LINHA CONFERIDA — a mais baixa, a mesma de bateuLinhaMaisBaixa', async () => {
    const [dia] = await conferirRodadas(banco.db, HOJE, 1)
    expect(dia!.jogadores.length).toBeGreaterThan(0)
    for (const j of dia!.jogadores) {
      expect(j.linhaConferida).toBe(Math.min(...j.linhas.map((l) => l.linha)))
      if (j.valor !== null) expect(j.bateuLinhaMaisBaixa).toBe(j.valor >= j.linhaConferida!)
    }
  })

  it('o jogo do recap carrega o PRÓPRIO status, horário e a chegada do box oficial', async () => {
    const { jogos, estatisticasJogo } = await import('../../dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const linhas = await banco.db.select().from(jogos)
    const porId = new Map(linhas.map((j) => [j.id, j] as const))

    expect(recap.porJogo.length).toBeGreaterThan(0)
    for (const { jogo } of recap.porJogo) {
      const real = porId.get(jogo.jogoId)!
      expect(jogo.status).toBe(real.status)
      expect(jogo.quartoAtual).toBe(real.quartoAtual)
      expect(jogo.dataHoraUtc.getTime()).toBe(real.dataHoraUtc.getTime())
      const box = await banco.db
        .select({ jogadorId: estatisticasJogo.jogadorId })
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, jogo.jogoId))
      // "existe box DO JOGO", não "existe box dos apitados": um jogo em que
      // todos os apitados foram desfalque tem box e não está aguardando nada.
      expect(jogo.temBoxOficial).toBe(box.length > 0)
    }
  })

  it('a marca de atualização é a dos jogos da RODADA, nunca a época zero', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    expect(recap.atualizacao.em.getTime()).toBeGreaterThan(0)
    expect(recap.atualizacao.fonte).not.toBe('sem dado')
  })

  it('a noite só conta jogo ENCERRADO — box parcial do 1º quarto não vira taxa', async () => {
    const recap = await recapDaNoite(banco.db, HOJE)
    expect(recap.porJogo.length).toBeGreaterThan(0)
    // A rodada de hoje ainda está acontecendo: é o caso que a guarda existe
    // para cobrir, e o mesmo que `taxaDaTemporada` já resolve no SQL.
    expect(recap.porJogo.some((g) => g.jogo.status !== 'ENCERRADO')).toBe(true)

    const conferiveis = recap.porJogo
      .filter((g) => g.jogo.status === 'ENCERRADO')
      .flatMap((g) => g.cards)
    expect(recap.apitos).toBe(conferiveis.filter((c) => c.fez !== null).length)
    expect(recap.bateram).toBe(conferiveis.filter((c) => c.bateuLinhaMaisBaixa === true).length)
    if (recap.apitos === 0) {
      expect(recap.taxa).toBeNull()
      expect(recap.apitoDaNoite).toBeNull()
    }
  })
})
