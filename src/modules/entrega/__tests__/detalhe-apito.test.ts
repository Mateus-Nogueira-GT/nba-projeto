import { readFileSync } from 'node:fs'
import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, jogos, lesoesEscalacao } from '../../dominio/db/schema'
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

    const intrusos = [await idDe('Dominick Barlow'), await idDe('Collin Sexton')]
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
            and(eq(lesoesEscalacao.jogoId, item.jogoId), eq(lesoesEscalacao.jogadorId, jogadorId)),
          )
      }
    }
  })

  it('identidade 04: o detalhe conhece o CONFRONTO — siglas, horário e quem está fora', async () => {
    // A seção "O jogo" da tela lê daqui. Recalcular o confronto na página
    // significaria uma segunda consulta com uma segunda regra de "quem é o
    // adversário" — e o time do apitado vem da curadoria do CJ, nunca de
    // `jogadores.time_id`.
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, item)

    expect(d.jogo.casaSigla).not.toBe('—')
    expect(d.jogo.visitanteSigla).not.toBe('—')
    expect([d.jogo.casaSigla, d.jogo.visitanteSigla]).toContain(d.jogo.adversarioSigla)
    expect(d.jogo.adversarioSigla).not.toBe(item.timeSigla)
    expect(d.jogo.emCasa).toBe(d.jogo.casaSigla === item.timeSigla)
    expect(d.jogo.dataHoraUtc).toBeInstanceOf(Date)
    expect(Array.isArray(d.jogo.desfalques)).toBe(true)
  })

  it('identidade 04: a grade de casas sai da entrega, uma linha por casa e por linha', async () => {
    // O detalhe mostra a lista COMPLETA que o card resume, em TEXTO (spec 04,
    // §4.3). A leitura vem daqui já resolvida: a tela não escolhe coleta nem
    // desempata casa — e ADR-0004 continua valendo, é só leitura.
    const { cotacoesPorCasa } = await import('../odds/leitura')
    const item = await itemDe('LeBron James')
    const grade = await cotacoesPorCasa(banco.db, [item.jogoId], item.jogadorId, item.atributo)

    expect(grade.length).toBeGreaterThan(1)
    // Ordem estável por nome: a grade não troca de linha a cada render.
    expect([...grade].map((c) => c.casa).sort()).toEqual(grade.map((c) => c.casa))
    for (const casa of grade) {
      expect(casa.casa.length).toBeGreaterThan(0)
      const linhas = Object.keys(casa.porLinha)
      expect(linhas.length).toBeGreaterThan(0)
      for (const l of linhas) expect(casa.porLinha[Number(l)]).toBeGreaterThan(1)
    }
    // Uma casa cotou a linha do apito — é o que a coluna do mercado mostra.
    expect(grade.some((c) => c.porLinha[item.linha!] !== undefined)).toBe(true)
  })

  it('identidade 04: os desfalques saem em ordem ESTÁVEL — a tela imprime a lista, não uma amostra', async () => {
    // A tela nomeia quem está FORA. Sem ORDER BY, o Postgres não promete
    // ordem nenhuma: dois renders da MESMA página podiam nomear desfalques
    // diferentes sem que nada tivesse mudado no jogo.
    const item = await itemDe('LeBron James')
    const elenco = await banco.db.select({ id: jogadores.id }).from(jogadores).limit(6)
    for (const j of elenco) {
      await banco.db
        .insert(lesoesEscalacao)
        .values({ jogoId: item.jogoId, jogadorId: j.id, status: 'FORA' })
        .onConflictDoNothing()
    }

    const esperado = await banco.db
      .select({ nome: jogadores.nomeCompleto })
      .from(lesoesEscalacao)
      .innerJoin(jogadores, eq(jogadores.id, lesoesEscalacao.jogadorId))
      .where(and(eq(lesoesEscalacao.jogoId, item.jogoId), eq(lesoesEscalacao.status, 'FORA')))
      .orderBy(asc(jogadores.nomeCompleto))

    const d = await detalheDoApito(banco.db, ruleset, item)
    expect(d.jogo.desfalques.length).toBeGreaterThan(3)
    expect(d.jogo.desfalques).toEqual(esperado.map((e) => e.nome))
    const outraVez = await detalheDoApito(banco.db, ruleset, item)
    expect(outraVez.jogo.desfalques).toEqual(d.jogo.desfalques)
  })

  it('identidade 04: a caixa MIN é a MÉDIA dos jogos lidos, não os minutos do último', async () => {
    // O rótulo do artboard é "MIN · MÉDIA". Mostrar ali os minutos do último
    // jogo seria um número certo com o nome errado — e o assinante leria uma
    // média que ninguém calculou.
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, item, { blocos: 10 })
    const { jogosRecentes } = await import('../historico-na-linha')
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    const historico = await jogosRecentes(banco.db, item.jogadorId, jogo!.dataHoraUtc, 10)
    const minutos = historico.map((h) => Number(h.minutos)).filter((m) => Number.isFinite(m))
    const esperada = minutos.reduce((a, b) => a + b, 0) / minutos.length

    expect(minutos.length).toBeGreaterThan(1)
    expect(d.minutosMedia).toBeCloseTo(esperada, 5)
  })

  it('alvo do 1º quarto NÃO vira régua do histórico — jogo inteiro e 12 minutos não se comparam', async () => {
    // O apito nascido ao vivo tem `linha: null` e `alvo1Q` preenchido. Conferir
    // os últimos jogos INTEIROS contra o alvo de doze minutos produziria um
    // "bateu 8 de 8" que ninguém mediu — e nem a spec nem o ruleset definem
    // essa conferência (CLAUDE.md, regra 3).
    const item = await itemDe('LeBron James')
    const aoVivo = { ...item, linha: null, alvo1Q: 3 }
    const d = await detalheDoApito(banco.db, ruleset, aoVivo)

    expect(d.linhaConferida).toBeNull()
    expect(d.bateu).toEqual({ acertos: 0, total: 0 })
    expect(d.blocos.length).toBeGreaterThan(0)
    expect(d.blocos.every((b) => b.bateu === false)).toBe(true)
    // Os valores continuam sendo fato — o que sumiu foi o veredito.
    expect(d.blocos.some((b) => b.valor >= 3)).toBe(true)
  })

  it('com linha, `linhaConferida` é a própria linha do apito', async () => {
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, item)
    expect(d.linhaConferida).toBe(item.linha)
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
