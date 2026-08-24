import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import { detalheDoApito } from '../detalhe-apito'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

describe('detalhe do apito', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, AGORA)
  }, 120_000)
  afterAll(async () => banco.fechar())

  async function itemDe(nome: string, metodo?: string) {
    const feed = await lerFeed(banco.db, HOJE)
    return feed!.conteudo.itens.find((i) => i.nome === nome && (!metodo || i.metodo === metodo))!
  }

  it('a média é a da TEMPORADA — a que o motor usou (regra do CJ, não MÉDIA 5J)', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James'))
    expect(d.mediaTemporada).toBeCloseTo(25.7, 1)
  })

  it('bateu x/5 confere valor contra a linha nos últimos 5 jogos', async () => {
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, item)
    expect(d.bateu.total).toBe(5)
    expect(d.blocos).toHaveLength(5)
    const acertos = d.blocos.filter((b) => b.bateu).length
    expect(d.bateu.acertos).toBe(acertos)
    for (const b of d.blocos) expect(b.bateu).toBe(b.valor >= (item.linha ?? Infinity))
  })

  it('cada bloco nomeia o adversário daquele jogo', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James'))
    // LeBron é PHI na lista do CJ; a rodada da demo repete LAL x PHI.
    for (const b of d.blocos) expect(b.adversarioSigla).toBe('LAL')
  })

  it('oscilação: o porquê nomeia o limiar média − delta do ruleset', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James', 'OSCILACAO'))
    const texto = d.porQueEntrou.join(' ')
    expect(texto).toContain('20,7') // 25,7 − 5
    expect(texto).toContain('25,7')
  })

  it('OPD: o porquê nomeia quem está fora', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('Austin Reaves', 'OPD'))
    expect(d.porQueEntrou.join(' ')).toContain('Luka')
  })

  it('sem linha e sem alvo não há o que conferir — é nada, não é "0 de 5"', async () => {
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, { ...item, linha: null, alvo1Q: null })

    // Os jogos continuam aparecendo (o histórico é fato), mas nenhum deles
    // pode ser marcado como acerto ou erro: não existe alvo contra o qual
    // comparar. Contar "0 de 5" diria ao assinante que a leitura falhou cinco
    // vezes, quando ela sequer foi feita.
    expect(d.bateu).toEqual({ acertos: 0, total: 0 })
    expect(d.blocos).toHaveLength(5)
    expect(d.blocos.every((b) => b.bateu === false)).toBe(true)
  })
})
