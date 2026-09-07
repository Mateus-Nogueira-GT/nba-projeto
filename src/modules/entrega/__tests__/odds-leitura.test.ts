import { readFileSync } from 'node:fs'
import { and, eq, ne } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogos, oddsSnapshot } from '../../dominio/db/schema'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import { cotacoesPorCasa } from '../odds/leitura'

/**
 * A GRADE DE CASAS — leitura da série temporal de `odds_snapshot`.
 *
 * O módulo é compartilhado (card e detalhe leem daqui) e escolhe, de uma vez
 * só, qual coleta é "a odd de agora". Por isso ele tem teste PRÓPRIO: até
 * aqui só era exercitado de lado, pelo detalhe e pela tela, e nenhum dos dois
 * afirma o que acontece quando duas coletas empatam no carimbo.
 *
 * Continua ADR-0004: leitura, sem envio de aposta e sem credencial de casa.
 */
const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

describe('cotações por casa', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, AGORA)
  }, 120_000)
  afterAll(async () => banco.fechar())

  /** Um apitado com linha e com odds coletadas no dia. */
  async function apitado() {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
    expect(item, 'seed sem apito com linha').toBeDefined()
    return item
  }

  it('cada casa aparece uma vez, com as linhas que ela cotou', async () => {
    const item = await apitado()
    const grade = await cotacoesPorCasa(banco.db, [item.jogoId], item.jogadorId, item.atributo)

    expect(grade.length).toBeGreaterThan(1)
    expect(new Set(grade.map((c) => c.casa)).size).toBe(grade.length)
    // Ordem por nome: a grade não troca de linha entre dois renders.
    expect(grade.map((c) => c.casa)).toEqual([...grade.map((c) => c.casa)].sort())
    for (const casa of grade) expect(Object.keys(casa.porLinha).length).toBeGreaterThan(0)
  })

  it('de duas coletas da mesma casa na mesma linha vale a MAIS RECENTE', async () => {
    const item = await apitado()
    const [modelo] = await banco.db
      .select()
      .from(oddsSnapshot)
      .where(
        and(
          eq(oddsSnapshot.jogoId, item.jogoId),
          eq(oddsSnapshot.jogadorId, item.jogadorId),
          eq(oddsSnapshot.atributo, item.atributo),
        ),
      )
      .limit(1)
    expect(modelo, 'seed sem cotação para o apitado').toBeDefined()

    await banco.db.insert(oddsSnapshot).values({
      ...modelo!,
      id: undefined,
      oddOver: '9.990',
      capturadoEm: new Date(modelo!.capturadoEm.getTime() + 60_000),
    })

    const grade = await cotacoesPorCasa(banco.db, [item.jogoId], item.jogadorId, item.atributo)
    const linha = Number(modelo!.linha)
    const cotacoes = grade.map((c) => c.porLinha[linha]).filter((o) => o !== undefined)
    expect(cotacoes).toContain(9.99)
  })

  it('empate no carimbo não deixa a odd ao acaso — o desempate é do módulo, não do Postgres', async () => {
    // A UNIQUE da série temporal permite o empate entre JOGOS diferentes (a
    // mesma casa cotando o mesmo jogador em dois jogos do dia, no mesmo
    // instante), e a consulta lê os dois de uma vez. Sem regra de desempate,
    // a odd exibida dependeria da ordem que o banco devolvesse — e dois
    // renders da mesma tela poderiam discordar sobre "a odd de agora".
    const item = await apitado()
    const [outroJogo] = await banco.db
      .select()
      .from(jogos)
      .where(ne(jogos.id, item.jogoId))
      .limit(1)
    const [modelo] = await banco.db
      .select()
      .from(oddsSnapshot)
      .where(
        and(
          eq(oddsSnapshot.jogoId, item.jogoId),
          eq(oddsSnapshot.jogadorId, item.jogadorId),
          eq(oddsSnapshot.atributo, item.atributo),
        ),
      )
      .limit(1)
    expect(outroJogo).toBeDefined()
    expect(modelo).toBeDefined()

    const carimbo = new Date(modelo!.capturadoEm.getTime() + 3_600_000)
    const gemeas = await banco.db
      .insert(oddsSnapshot)
      .values([
        { ...modelo!, id: undefined, oddOver: '7.770', capturadoEm: carimbo },
        {
          ...modelo!,
          id: undefined,
          jogoId: outroJogo!.id,
          oddOver: '8.880',
          capturadoEm: carimbo,
        },
      ])
      .returning({ id: oddsSnapshot.id, oddOver: oddsSnapshot.oddOver })

    const vencedora = [...gemeas].sort((a, b) => (a.id < b.id ? 1 : -1))[0]!
    const linha = Number(modelo!.linha)
    const jogosDaTela = [item.jogoId, outroJogo!.id]

    const uma = await cotacoesPorCasa(banco.db, jogosDaTela, item.jogadorId, item.atributo)
    const outra = await cotacoesPorCasa(banco.db, jogosDaTela, item.jogadorId, item.atributo)
    expect(uma).toEqual(outra)

    const cotacoes = uma.map((c) => c.porLinha[linha]).filter((o) => o !== undefined)
    expect(cotacoes).toContain(Number(vencedora.oddOver))
    expect(cotacoes).not.toContain(Number(gemeas.find((g) => g.id !== vencedora.id)!.oddOver))
  })

  it('sem jogo na tela não há consulta nem grade', async () => {
    const item = await apitado()
    expect(await cotacoesPorCasa(banco.db, [], item.jogadorId, item.atributo)).toEqual([])
  })
})
