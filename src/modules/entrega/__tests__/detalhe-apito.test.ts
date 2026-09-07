import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, lesoesEscalacao } from '../../dominio/db/schema'
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
    // LeBron é PHI na lista do CJ. O histórico da demo gira os adversários,
    // então a asserção é a INTENÇÃO — cada bloco nomeia o adversário DAQUELE
    // jogo — e não um calendário fixo: antes bastava devolver 'LAL' constante
    // para o teste passar.
    expect(d.blocos.length).toBeGreaterThan(1)
    for (const b of d.blocos) expect(b.adversarioSigla).not.toBe('PHI')
    expect(new Set(d.blocos.map((b) => b.adversarioSigla)).size).toBeGreaterThan(1)
  })

  it('oscilação: o porquê nomeia o limiar média − delta do ruleset', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James', 'OSCILACAO'))
    const texto = d.porQueEntrou.join(' ')
    expect(texto).toContain('20,7') // 25,7 − 5
    expect(texto).toContain('25,7')
  })

  it('identidade 04: os fatores saem ESTRUTURADOS, em ordem fixa, com o fato e sem os pesos do ruleset', async () => {
    // "Por que entrou" vira uma lista de fatores — nível do jogador primeiro,
    // depois o método com o FATO que o sustenta, depois o nível do apito. A
    // narrativa é legenda dessa lista, não substituto. Nenhum peso do ruleset
    // (bônus de nível, +N do turbo) e nenhum percentual: mostrar a fórmula
    // expõe o CJ e faz o % parecer soma de probabilidades.
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James', 'OSCILACAO'))
    expect(d.fatores.length).toBeGreaterThanOrEqual(3)
    expect(d.fatores[0]!.chave).toBe('NIVEL')
    expect(d.fatores[0]!.texto).toContain('Suporte')
    const oscilacao = d.fatores.find((f) => f.chave === 'OSCILACAO')!
    expect(oscilacao.texto).toContain('20,7')
    expect(oscilacao.texto).toContain('25,7')
    expect(d.fatores.at(-1)!.chave).toBe('NIVEL_APITO')
    for (const f of d.fatores) {
      expect(f.titulo.length).toBeGreaterThan(0)
      expect(f.texto).not.toMatch(/%|probabilidad|prov[áa]ve|bônus|peso|\+\s?\d/i)
    }
    // O texto plano continua existindo, derivado dos fatores — quem já lê
    // `porQueEntrou` não quebra.
    expect(d.porQueEntrou.length).toBeGreaterThan(0)
  })

  it('identidade 04: OPD vira fator com quem está fora e a hierarquia', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('Austin Reaves', 'OPD'))
    const opd = d.fatores.find((f) => f.chave === 'OPD')!
    expect(opd.texto).toContain('Luka')
    expect(opd.texto).toMatch(/hierarquia|topo/i)
  })

  it('identidade 04: a forma no atributo pode pedir até 10 jogos — o padrão continua 5', async () => {
    const item = await itemDe('LeBron James')
    const padrao = await detalheDoApito(banco.db, ruleset, item)
    expect(padrao.blocos).toHaveLength(5)
    const dez = await detalheDoApito(banco.db, ruleset, item, { blocos: 10 })
    // A fixture tem 6 dias de história: pede 10, vêm 6 — nunca inventa.
    expect(dez.blocos.length).toBeGreaterThan(5)
    expect(dez.blocos.length).toBeLessThanOrEqual(10)
    expect(dez.bateu.total).toBe(dez.blocos.length)
  })

  it('OPD: o porquê nomeia quem está fora', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('Austin Reaves', 'OPD'))
    expect(d.porQueEntrou.join(' ')).toContain('Luka')
  })

  it('OPD: só os desfalques do PRÓPRIO time, e só o prefixo que abre a regra', async () => {
    // O seed tem um único jogador FORA — com ele, qualquer filtro passa por
    // acidente. Aqui o mesmo jogo (LAL x PHI) ganha mais dois desfalques:
    //   Barlow  — PHI, o time ADVERSÁRIO do apitado
    //   Sexton  — LAL, mesmo time, mas nº 6: fora do prefixo que abre a OPD
    // Nenhum dos dois participa da regra que apitou o Reaves. Nomeá-los
    // afirmaria ao assinante que a oportunidade veio de gente que não tem
    // nada a ver com ela — e uma delas nem joga pelo mesmo lado.
    const item = await itemDe('Austin Reaves', 'OPD')
    const idDe = async (nome: string) =>
      (await banco.db.select().from(jogadores).where(eq(jogadores.nomeCompleto, nome)))[0]!.id

    const intrusos = [await idDe('Barlow'), await idDe('Sexton')]
    for (const jogadorId of intrusos) {
      await banco.db
        .insert(lesoesEscalacao)
        .values({ jogoId: item.jogoId, jogadorId, status: 'FORA', confirmado: true })
        .onConflictDoUpdate({
          target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
          set: { status: 'FORA' },
        })
    }

    try {
      const texto = (await detalheDoApito(banco.db, ruleset, item)).porQueEntrou.join(' ')
      expect(texto).toContain('Luka')
      expect(texto).not.toContain('Barlow')
      expect(texto).not.toContain('Sexton')
    } finally {
      for (const jogadorId of intrusos) {
        await banco.db
          .delete(lesoesEscalacao)
          .where(
            and(
              eq(lesoesEscalacao.jogoId, item.jogoId),
              eq(lesoesEscalacao.jogadorId, jogadorId),
            ),
          )
      }
    }
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
