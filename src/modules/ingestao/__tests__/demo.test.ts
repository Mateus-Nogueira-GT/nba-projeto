import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { feedSnapshot, jogadores, niveisVersao, times, usuarios } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../../entrega/lista-secreta'
import { limparDemo, semearDemo } from '../demo/semear'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

import { historicoOscilacao, mediaDe, posicaoDe } from '../demo/dados'
import type { Nivel } from '../../motor/tipos'

describe('helpers determinísticos da demonstração', () => {
  it('a posição é estável e cobre G, F e C', () => {
    const nomes = ['Luka Doncic', 'Jokic', 'Curry', 'Wembayama', 'Tatum', 'Embid', 'Sengun']
    const posicoes = nomes.map(posicaoDe)
    expect(posicoes.every((p) => ['G', 'F', 'C'].includes(p))).toBe(true)
    // Reexecução do seed não pode mudar a posição de ninguém.
    expect(nomes.map(posicaoDe)).toEqual(posicoes)
    expect(new Set(posicoes).size).toBeGreaterThan(1)
  })

  it('usa os números que o documento do CJ declara', () => {
    // "Shai Gilgeous-Alexander é nivel MVP em pontos, pois tem uma média de 31 ppg"
    expect(mediaDe('Shai', 'MVP').ppg).toBe(31)
    // "Nikola Jokic é nivel MVP em Rebotes, pois tem média de 12.9 RPG"
    expect(mediaDe('Jokic', 'MVP').rpg).toBe(12.9)
    // "Karl Anthony towns é nivel all star em pontos... média de 20 ppg"
    expect(mediaDe('Towns', 'ALL_STAR').ppg).toBe(20)
    // "Aaron gordon é nivel suporte em pontos, pois tem média de 16 ppg"
    expect(mediaDe('Gordon', 'SUPORTE').ppg).toBe(16)
    // "Simone fontecchio é nivel randola pois tem media de 8,5 pontos"
    expect(mediaDe('Fontenchhio', 'RANDOLA').ppg).toBe(8.5)
    // "Jamal murray é nivel all star em assistências pois tem uma média de 7 apg"
    expect(mediaDe('Jamal Murray', 'ALL_STAR').apg).toBe(7)
    // "A média do lebron sendo 25,7 ppg"
    expect(mediaDe('LeBron James', 'SUPORTE').ppg).toBe(25.7)
  })

  it('nome desconhecido cai na faixa do nível e é estável', () => {
    const faixas: [Nivel, number, number][] = [
      ['MVP', 27, 31],
      ['ALL_STAR', 18, 23],
      ['SUPORTE', 11, 16],
      ['RANDOLA', 5, 9],
    ]
    for (const [nivel, min, max] of faixas) {
      const m = mediaDe('Jogador Inventado da Demo', nivel)
      expect(m.ppg).toBeGreaterThanOrEqual(min)
      expect(m.ppg).toBeLessThanOrEqual(max)
      expect(mediaDe('Jogador Inventado da Demo', nivel)).toEqual(m)
    }
  })

  it('histórico de oscilação produz a sequência exata que o motor precisa', () => {
    // LeBron: média 25,7 · delta 5 → limiar 20,7 · 1 jogo abaixo = nível 1
    const h = historicoOscilacao(25.7, 5, 1)
    expect(h[0]!).toBeLessThanOrEqual(20.7)
    expect(h.slice(1).every((p) => p > 20.7)).toBe(true)

    // 3 jogos abaixo = nível 3 (o mais recente primeiro)
    const h3 = historicoOscilacao(30, 6, 3)
    expect(h3.slice(0, 3).every((p) => p <= 24)).toBe(true)
    expect(h3[3]!).toBeGreaterThan(24)
  })

  it('nunca devolve pontuação negativa', () => {
    expect(historicoOscilacao(5, 4, 3).every((p) => p >= 0)).toBe(true)
  })
})

// ===========================================================================
// SEED COMPLETO — o motor real calculando sobre os fatos da demonstração
// ===========================================================================

describe('semearDemo (PGlite, banco vazio)', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let resumo: Awaited<ReturnType<typeof semearDemo>>
  const AGORA = new Date('2026-08-23T22:00:00.000Z')
  const HOJE = '2026-08-23'

  beforeAll(async () => {
    banco = await bancoDeTeste()
    resumo = await semearDemo(banco.db, ruleset, AGORA)
  }, 120_000)
  afterAll(async () => {
    await banco.fechar()
  })

  it('carrega os 30 times e o elenco inteiro do documento do CJ', () => {
    expect(resumo.times).toBe(30)
    expect(resumo.jogadores).toBeGreaterThan(200)
  })

  it('a versão de níveis fica ativa', async () => {
    const [ativa] = await banco.db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true))
    expect(ativa?.versao).toBe(resumo.versaoNiveis)
  })

  it('a rodada de hoje tem quatro jogos', () => {
    expect(resumo.jogosHoje).toBe(4)
  })

  it('Luka fora abre OPD 3/2/1 em Reaves, Grimes e Kessler (exemplo do doc)', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed).not.toBeNull()
    const porNome = new Map(feed!.conteudo.itens.map((i) => [i.nome, i] as const))
    expect(porNome.get('Austin Reaves')?.opdOrigemNivel).toBe(3)
    expect(porNome.get('Grimes')?.opdOrigemNivel).toBe(2)
    expect(porNome.get('Kesller')?.opdOrigemNivel).toBe(1)
  })

  it('a oscilação apita nos três níveis e o MVP em nível 3 vai ao turbo', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const itens = feed!.conteudo.itens

    // MVP com 1 jogo abaixo → amarelo
    expect(itens.find((i) => i.nome === 'Brunson')?.nivelApito).toBe(1)
    // Suporte com 2 jogos → laranja (o doc proíbe Suporte de apitar no nível 1)
    expect(itens.find((i) => i.nome === 'LeBron James')?.nivelApito).toBe(2)
    // MVP com 3 jogos → verde, e o turbo do documento
    const curry = itens.find((i) => i.nome === 'stephen Curry')
    expect(curry?.nivelApito).toBe(3)
    expect(curry?.turbo).toBe(true)
  })

  it('Suporte não apita no nível 1 de oscilação (regra do documento)', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const suporteNivel1 = feed!.conteudo.itens.filter(
      (i) => i.nivelJogador === 'SUPORTE' && i.nivelApito === 1 && i.opdOrigemNivel === null,
    )
    expect(suporteNivel1).toEqual([])
  })

  it('os itens carregam método e posição para os filtros', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const itens = feed!.conteudo.itens
    expect(itens.every((i) => i.metodo !== null)).toBe(true)
    expect(itens.every((i) => ['G', 'F', 'C'].includes(i.posicao ?? ''))).toBe(true)
  })

  it('o Fire Live apita e o MVP entra em modo fire', async () => {
    expect(resumo.apitosFireLive).toBeGreaterThan(0)
    const [snapshot] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(eq(feedSnapshot.estrategia, 'FIRE_LIVE'))
    const conteudo = snapshot!.conteudoJson as { itens: { nome: string; modoFire: boolean }[] }
    const shai = conteudo.itens.find((i) => i.nome === 'Shai')
    expect(shai?.modoFire).toBe(true)
  })

  it('reexecutar o seed não duplica nada', async () => {
    const antes = (await banco.db.select().from(jogadores)).length
    const segundo = await semearDemo(banco.db, ruleset, AGORA)
    const depois = (await banco.db.select().from(jogadores)).length
    expect(depois).toBe(antes)
    expect(segundo.times).toBe(30)
  }, 120_000)

  it('limparDemo apaga o domínio e preserva as contas', async () => {
    const [usuario] = await banco.db
      .insert(usuarios)
      .values({ email: 'preservar@teste.com', senhaHash: 'x', nome: 'Preservar' })
      .returning()

    await limparDemo(banco.db)

    expect((await banco.db.select().from(times)).length).toBe(0)
    expect((await banco.db.select().from(jogadores)).length).toBe(0)
    expect((await banco.db.select().from(feedSnapshot)).length).toBe(0)
    const contas = await banco.db.select().from(usuarios).where(eq(usuarios.id, usuario!.id))
    expect(contas).toHaveLength(1)
  }, 60_000)
})
