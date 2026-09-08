import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { somarDias } from '../../dominio/rodada'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import {
  conferirRodadas,
  recapDaNoite,
  taxaDaTemporada,
  ultimaRodadaConferida,
} from '../resultados'

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
    expect(recap.conferidos).toBe(dia!.conferidos)
    expect(recap.publicados).toBe(dia!.jogadores.length)
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
      // todo card do grupo é de um dos dois times do jogo — por ID, que é o
      // que a tela compara para achar o mando
      for (const c of g.cards) expect([g.jogo.casaId, g.jogo.visitanteId]).toContain(c.timeId)
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

  it('o turbo que bateu vem antes do maior valor sobre a linha (§4.4)', async () => {
    const { apitos } = await import('../../dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const bateram = antes.porJogo.flatMap((g) => g.cards).filter((c) => c.bateuLinhaMaisBaixa)
    // O turbo é o card de MENOR folga da noite: sem a regra, ele nunca ganharia.
    const folga = (c: (typeof bateram)[number]) => c.fez! - c.linhaConferida!
    const menor = [...bateram].sort((a, b) => folga(a) - folga(b))[0]!

    expect(bateram.length).toBeGreaterThan(1)
    expect(antes.apitoDaNoite!.chave).not.toBe(menor.chave)
    try {
      await banco.db
        .update(apitos)
        .set({ turbo: true })
        .where(
          and(
            eq(apitos.jogoId, menor.jogoId),
            eq(apitos.jogadorId, menor.jogadorId),
            eq(apitos.atributo, menor.atributo),
          ),
        )
      const depois = await recapDaNoite(banco.db, ONTEM)
      expect(depois.apitoDaNoite!.chave).toBe(menor.chave)
      expect(depois.apitoDaNoite!.turbo).toBe(true)
    } finally {
      await banco.db
        .update(apitos)
        .set({ turbo: false })
        .where(
          and(
            eq(apitos.jogoId, menor.jogoId),
            eq(apitos.jogadorId, menor.jogadorId),
            eq(apitos.atributo, menor.atributo),
          ),
        )
    }
  })

  it('dia sem lista publicada devolve um recap vazio, não erro', async () => {
    const recap = await recapDaNoite(banco.db, '2020-01-01')
    expect(recap).toMatchObject({
      publicados: 0,
      conferidos: 0,
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
    // A rodada só entra na contagem se conferiu alguma coisa.
    expect(taxa.rodadas).toBe(dias.filter((d) => d.conferidos > 0).length)
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
    expect(recap.conferidos).toBe(conferiveis.filter((c) => c.fez !== null).length)
    expect(recap.bateram).toBe(conferiveis.filter((c) => c.bateuLinhaMaisBaixa === true).length)
    // O que a tela conta como "publicados" é todo card em tela, encerrado ou não.
    expect(recap.publicados).toBe(recap.porJogo.reduce((n, g) => n + g.cards.length, 0))
    if (recap.conferidos === 0) {
      expect(recap.taxa).toBeNull()
      expect(recap.apitoDaNoite).toBeNull()
    }
  })
})

/**
 * O QUE A ENTREGA PRECISA AFIRMAR (revisão adversarial da 04, rodada 2).
 *
 * O time do apitado é o da LISTA do CJ; a ordem das seções é a do calendário;
 * o carimbo de "aguardando" é de cada jogo; e uma rodada que não conferiu nada
 * não entra na contagem de rodadas da temporada.
 */
describe('o recap não empresta dado de outro lugar', () => {
  it('o time do card vem da LISTA do CJ, não de jogadores.time_id', async () => {
    const { jogadores, niveis, niveisVersao, times } = await import('../../dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const alvo = recap.porJogo.flatMap((g) => g.cards)[0]!
    const [versao] = await banco.db
      .select({ id: niveisVersao.id })
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const [vinculo] = await banco.db
      .select({ timeId: niveis.timeId })
      .from(niveis)
      .where(and(eq(niveis.niveisVersaoId, versao!.id), eq(niveis.jogadorId, alvo.jogadorId)))
      .limit(1)
    const [jogador] = await banco.db
      .select({ timeId: jogadores.timeId })
      .from(jogadores)
      .where(eq(jogadores.id, alvo.jogadorId))
    // Um time REAL que não é o da lista e não joga esta partida — o elenco
    // projetado do CJ (Giannis no Miami) visto pelo lado do provedor.
    const doJogo = recap.porJogo.find((g) => g.cards.some((c) => c.chave === alvo.chave))!.jogo
    const todosOsTimes = await banco.db.select({ id: times.id, sigla: times.sigla }).from(times)
    const forasteiro = todosOsTimes.find(
      (t) => t.id !== vinculo!.timeId && t.id !== doJogo.casaId && t.id !== doJogo.visitanteId,
    )!

    expect(alvo.timeId).toBe(vinculo!.timeId)
    try {
      await banco.db
        .update(jogadores)
        .set({ timeId: forasteiro.id })
        .where(eq(jogadores.id, alvo.jogadorId))
      const depois = await recapDaNoite(banco.db, ONTEM)
      const mesmo = depois.porJogo.flatMap((g) => g.cards).find((c) => c.chave === alvo.chave)!
      expect(mesmo.timeId).toBe(vinculo!.timeId)
      expect(mesmo.timeSigla).toBe(alvo.timeSigla)
      expect(mesmo.timeSigla).not.toBe(forasteiro.sigla)
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: jogador!.timeId })
        .where(eq(jogadores.id, alvo.jogadorId))
    }
  })

  it('as seções saem na ordem do calendário, e um placar novo não as embaralha', async () => {
    const { jogos } = await import('../../dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const horarios = antes.porJogo.map((g) => g.jogo.dataHoraUtc.getTime())

    expect(antes.porJogo.length).toBeGreaterThan(1)
    expect([...horarios].sort((a, b) => a - b)).toEqual(horarios)
    const ultimo = antes.porJogo.at(-1)!.jogo
    const [linha] = await banco.db
      .select({ placarCasa: jogos.placarCasa })
      .from(jogos)
      .where(eq(jogos.id, ultimo.jogoId))
    try {
      await banco.db
        .update(jogos)
        .set({ placarCasa: (linha!.placarCasa ?? 0) + 1 })
        .where(eq(jogos.id, ultimo.jogoId))
      const depois = await recapDaNoite(banco.db, ONTEM)
      expect(depois.porJogo.map((g) => g.jogo.jogoId)).toEqual(
        antes.porJogo.map((g) => g.jogo.jogoId),
      )
    } finally {
      await banco.db
        .update(jogos)
        .set({ placarCasa: linha!.placarCasa })
        .where(eq(jogos.id, ultimo.jogoId))
    }
  })

  it('cada jogo carrega o PRÓPRIO carimbo — jogo tocado agora não atualiza o vizinho', async () => {
    const { jogos } = await import('../../dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const [um, outro] = antes.porJogo
    const original = outro!.jogo.atualizadoEm
    const adiantado = new Date(original.getTime() + 3_600_000)

    expect(antes.porJogo.length).toBeGreaterThan(1)
    try {
      await banco.db
        .update(jogos)
        .set({ atualizadoEm: adiantado })
        .where(eq(jogos.id, outro!.jogo.jogoId))
      const depois = await recapDaNoite(banco.db, ONTEM)
      const porId = new Map(depois.porJogo.map((g) => [g.jogo.jogoId, g.jogo] as const))
      expect(porId.get(outro!.jogo.jogoId)!.atualizadoEm.getTime()).toBe(adiantado.getTime())
      expect(porId.get(um!.jogo.jogoId)!.atualizadoEm.getTime()).toBe(
        um!.jogo.atualizadoEm.getTime(),
      )
      // E o carimbo da TELA é o do dado mais ANTIGO, nunca o que acabou de mudar.
      expect(depois.atualizacao.em.getTime()).toBeLessThan(adiantado.getTime())
    } finally {
      await banco.db
        .update(jogos)
        .set({ atualizadoEm: original })
        .where(eq(jogos.id, outro!.jogo.jogoId))
    }
  })
})

describe('a faixa da temporada só conta rodada que conferiu', () => {
  it('a rodada em curso não vira "mais uma rodada" com os mesmos acertos', async () => {
    const ateOntem = await taxaDaTemporada(banco.db, HOJE, 49)
    // A rodada de HOJE está acontecendo: entra na janela, não tem valor nenhum.
    const comHoje = await taxaDaTemporada(banco.db, somarDias(HOJE, 1), 50)

    expect(ateOntem.conferidos).toBeGreaterThan(0)
    expect(comHoje.conferidos).toBe(ateOntem.conferidos)
    expect(comHoje.acertos).toBe(ateOntem.acertos)
    expect(comHoje.rodadas).toBe(ateOntem.rodadas)
  })
})

/**
 * A NOITE QUE TERMINOU (revisão adversarial da 04, rodada 2).
 *
 * `/resultados` sem data abre o recap da última noite que TERMINOU, não a
 * rodada em curso; o recap diz se a noite acabou; e quem ficou sem minutos é
 * DNP — neutro — mesmo quando o provedor manda a linha zerada.
 */
describe('a última rodada com conferência', () => {
  it('é a noite que TERMINOU: a rodada em curso não conta, e o dia é inclusivo', async () => {
    const hoje = await recapDaNoite(banco.db, HOJE)
    const ontem = await recapDaNoite(banco.db, ONTEM)
    expect(hoje.porJogo.some((g) => g.jogo.status !== 'ENCERRADO')).toBe(true)
    expect(hoje.noiteEncerrada).toBe(false)
    expect(ontem.noiteEncerrada).toBe(true)
    expect(ontem.conferidos).toBeGreaterThan(0)

    expect(await ultimaRodadaConferida(banco.db, HOJE)).toBe(ONTEM)
    expect(await ultimaRodadaConferida(banco.db, ONTEM)).toBe(ONTEM)
    const anterior = await ultimaRodadaConferida(banco.db, somarDias(ONTEM, -1))
    expect(anterior).not.toBeNull()
    expect(anterior! < ONTEM).toBe(true)
    const recapAnterior = await recapDaNoite(banco.db, anterior!)
    expect(recapAnterior.noiteEncerrada).toBe(true)
    expect(recapAnterior.conferidos).toBeGreaterThan(0)
    // Antes da temporada semeada não há nada: null, não erro nem "hoje".
    expect(await ultimaRodadaConferida(banco.db, somarDias(HOJE, -60))).toBeNull()
  })

  it('um jogo de ontem que voltasse a AO_VIVO tira ontem da conta', async () => {
    const { jogos } = await import('../../dominio/db/schema')
    const ontem = await recapDaNoite(banco.db, ONTEM)
    const alvo = ontem.porJogo[0]!.jogo
    try {
      await banco.db.update(jogos).set({ status: 'AO_VIVO' }).where(eq(jogos.id, alvo.jogoId))
      expect((await recapDaNoite(banco.db, ONTEM)).noiteEncerrada).toBe(false)
      const ultima = await ultimaRodadaConferida(banco.db, HOJE)
      expect(ultima).not.toBeNull()
      expect(ultima! < ONTEM).toBe(true)
    } finally {
      await banco.db.update(jogos).set({ status: 'ENCERRADO' }).where(eq(jogos.id, alvo.jogoId))
    }
  })

  it('o recap vazio não afirma que a noite acabou', async () => {
    expect((await recapDaNoite(banco.db, '2020-01-01')).noiteEncerrada).toBe(false)
  })
})

describe('DNP é neutro — também quando o provedor manda a linha zerada', () => {
  it('sem minutos positivos o card não é ✓ nem ✗, e sai do denominador da noite e da temporada', async () => {
    const { estatisticasJogo } = await import('../../dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const temporadaAntes = await taxaDaTemporada(banco.db, HOJE, 49)
    const todos = antes.porJogo.flatMap((g) => g.cards)
    const alvo = todos.find((c) => c.bateuLinhaMaisBaixa === true)!
    const doAlvo = todos.filter((c) => c.jogoId === alvo.jogoId && c.jogadorId === alvo.jogadorId)
    const bateram = doAlvo.filter((c) => c.bateuLinhaMaisBaixa === true).length
    const onde = and(
      eq(estatisticasJogo.jogoId, alvo.jogoId),
      eq(estatisticasJogo.jogadorId, alvo.jogadorId),
    )
    const [linha] = await banco.db
      .select({ minutos: estatisticasJogo.minutos })
      .from(estatisticasJogo)
      .where(onde)

    expect(alvo).toBeDefined()
    expect(Number(linha!.minutos)).toBeGreaterThan(0)
    try {
      // A mesma regra de participação de `sincronizar/medias.ts`: sem minutos
      // positivos, a linha não descreve um jogo jogado.
      await banco.db.update(estatisticasJogo).set({ minutos: '0.00' }).where(onde)
      const [dia] = await conferirRodadas(banco.db, HOJE, 1)
      const depois = await recapDaNoite(banco.db, ONTEM)
      const temporadaDepois = await taxaDaTemporada(banco.db, HOJE, 49)
      for (const { chave } of doAlvo) {
        const c = dia!.jogadores.find((j) => j.chave === chave)!
        expect(c.valor).toBeNull()
        expect(c.fez).toBeNull()
        expect(c.bateuLinhaMaisBaixa).toBeNull()
        expect(c.linhas.every((l) => l.bateu === null)).toBe(true)
      }
      expect(depois.publicados).toBe(antes.publicados)
      expect(depois.conferidos).toBe(antes.conferidos - doAlvo.length)
      expect(depois.bateram).toBe(antes.bateram - bateram)
      expect(temporadaDepois.conferidos).toBe(temporadaAntes.conferidos - doAlvo.length)
      expect(temporadaDepois.acertos).toBe(temporadaAntes.acertos - bateram)
    } finally {
      await banco.db.update(estatisticasJogo).set({ minutos: linha!.minutos }).where(onde)
    }
  })
})
