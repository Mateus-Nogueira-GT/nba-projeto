import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { casas, feedSnapshot, jogadores, niveisVersao, oddsAgregada, times, usuarios } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { agruparPorJogador, lerFeed } from '../../entrega/lista-secreta'
import { planoDoDia } from '../../entrega/gestao'
import { conferirRodadas, greensDoDia } from '../../entrega/resultados'
import { limparDemo, semearDemo } from '../demo/semear'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

import { historicoOscilacao, mediaDe, niveisDoJogador, nivelDoAtributo, posicaoDe } from '../demo/dados'
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

  it('a posição desloca o nível de rebotes e assistências em direções opostas', () => {
    for (const nome of ['Jokic', 'Curry', 'Tatum', 'Sengun', 'Wembayama']) {
      const posicao = posicaoDe(nome)
      const rebotes = nivelDoAtributo(nome, 'ALL_STAR', 'REBOTES')
      const assistencias = nivelDoAtributo(nome, 'ALL_STAR', 'ASSISTENCIAS')

      if (posicao === 'C') {
        expect(rebotes).toBe('MVP')
        expect(assistencias).toBe('SUPORTE')
      } else if (posicao === 'G') {
        expect(rebotes).toBe('SUPORTE')
        expect(assistencias).toBe('MVP')
      } else {
        expect(rebotes).toBe('ALL_STAR')
        expect(assistencias).toBe('ALL_STAR')
      }
    }
  })

  it('pontos nunca é derivado — é o único atributo que o CJ classificou', () => {
    expect(nivelDoAtributo('Jokic', 'SUPORTE', 'PONTOS')).toBe('SUPORTE')
    expect(niveisDoJogador('Jokic', 'SUPORTE').PONTOS).toBe('SUPORTE')
  })

  it('o deslocamento não escapa das pontas da escala', () => {
    // MVP não tem para onde subir; Randola não tem para onde cair.
    for (const nome of ['Jokic', 'Curry', 'Tatum', 'Sengun', 'Wembayama']) {
      expect(['MVP', 'ALL_STAR']).toContain(nivelDoAtributo(nome, 'MVP', 'REBOTES'))
      expect(['SUPORTE', 'RANDOLA']).toContain(nivelDoAtributo(nome, 'RANDOLA', 'REBOTES'))
    }
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

  it('a lista sai nos três atributos, não só em pontos', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const porAtributo = new Set(feed!.conteudo.itens.map((i) => i.atributo))

    expect(porAtributo).toEqual(new Set(['PONTOS', 'REBOTES', 'ASSISTENCIAS']))
  })

  it('as linhas de rebotes são linhas de rebotes, não de pontos', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const jokic = feed!.conteudo.itens.filter((i) => i.nome === 'Jokic' && i.atributo === 'REBOTES')

    // Jokic é MVP em rebotes (os 12,9 rpg do documento) com 3 jogos abaixo.
    expect(jokic.map((i) => i.linha).sort((a, b) => a! - b!)).toEqual([8, 10, 12])
    expect(jokic.every((i) => i.nivelApito === 3)).toBe(true)
  })

  it('cada linha publicada ganha faixa de odds das três casas', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const agregadas = await banco.db.select().from(oddsAgregada)

    expect((await banco.db.select().from(casas)).length).toBe(3)
    expect(agregadas.length).toBe(feed!.conteudo.itens.length)
    // Três casas discordando é o que dá sentido à mediana do ruleset.
    expect(agregadas.every((o) => o.qtdCasas === 3 && o.origem === 'CASAS')).toBe(true)
    expect(agregadas.every((o) => Number(o.oddMin) < Number(o.oddMax))).toBe(true)
  })

  it('as rodadas passadas são conferíveis e a leitura se confirma na maioria', async () => {
    const rodadas = await conferirRodadas(banco.db, HOJE, 7)

    expect(rodadas.length).toBeGreaterThan(0)
    // Nenhuma rodada conferida pode ser a de hoje: os jogos ainda estão em
    // andamento e "não bateu" seria mentira para quem nem entrou em quadra.
    expect(rodadas.every((r) => r.dataReferencia < HOJE)).toBe(true)

    const ontem = rodadas[0]!
    expect(ontem.conferidos).toBeGreaterThan(0)
    // A demo existe para mostrar a estratégia funcionando: se a maioria dos
    // sinalizados não bate a linha, o seed voltou a colocar o jogo ruim
    // depois do apito em vez de antes.
    expect(ontem.acertos / ontem.conferidos).toBeGreaterThan(0.5)
  })

  it('cada card conferido guarda as linhas do jogador, não uma linha solta', async () => {
    const [ontem] = await conferirRodadas(banco.db, HOJE, 7)
    const comMaisDeUma = ontem!.jogadores.filter((j) => j.linhas.length > 1)

    expect(comMaisDeUma.length).toBeGreaterThan(0)
    for (const jogador of comMaisDeUma) {
      // Ordenadas da mais baixa para a mais alta — a ordem da tela.
      const linhas = jogador.linhas.map((l) => l.linha)
      expect(linhas).toEqual([...linhas].sort((a, b) => a - b))
      if (jogador.valor !== null) {
        const batidas = jogador.linhas.filter((l) => l.bateu === true).map((l) => l.linha)
        expect(jogador.maiorLinhaBatida).toBe(batidas.length === 0 ? null : Math.max(...batidas))
      }
    }
  })

  it('o Fire Live registra green com um marco do ruleset', async () => {
    const greens = await greensDoDia(banco.db, HOJE)

    expect(greens.length).toBeGreaterThan(0)
    for (const green of greens) {
      const marcos =
        green.atributo === 'PONTOS'
          ? ruleset.push.marcos_green[green.nivelJogador]
          : ruleset.por_atributo[green.atributo]?.marcos_green?.[green.nivelJogador]
      expect(marcos).toContain(green.marco)
      expect(green.valor).toBeGreaterThanOrEqual(green.marco)
    }
  })

  it('a gestão de banca sugere entrada para cada apito do dia', async () => {
    const plano = await planoDoDia(banco.db, ruleset, HOJE, 1000)

    expect(plano.temModelo).toBe(true)
    // Enquanto o modelo do CJ não chega, a tela precisa poder avisar.
    expect(plano.origem).toBe('demonstracao')
    expect(plano.entradas.length).toBeGreaterThan(0)
    expect(plano.entradas.every((e) => e.entrada !== null)).toBe(true)
    // Nenhuma entrada pode furar o teto por entrada do ruleset.
    const teto = plano.limites!.tetoPorEntrada
    expect(plano.entradas.every((e) => e.entrada!.valor <= teto)).toBe(true)
    expect(plano.totalExposto).toBeCloseTo(
      plano.entradas.reduce((s, e) => s + e.entrada!.valor, 0),
      10,
    )
  })

  it('um jogador apitado em dois atributos vira dois cards, não um', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const cards = agruparPorJogador(feed!.conteudo.itens)

    const porJogador = new Map<string, Set<string>>()
    for (const c of cards) {
      const atributos = porJogador.get(c.jogadorId) ?? new Set<string>()
      atributos.add(c.atributo)
      porJogador.set(c.jogadorId, atributos)
    }

    // Alguém precisa aparecer em mais de um atributo, senão o teste não prova
    // nada — a OPD do Luka fora sinaliza Reaves nos três.
    expect([...porJogador.values()].some((a) => a.size > 1)).toBe(true)
    // E cada par (jogador, atributo) aparece uma única vez.
    expect(cards.length).toBe([...porJogador.values()].reduce((s, a) => s + a.size, 0))
  })

  it('a demo nasce apresentável: placar, campanha e odd no card', async () => {
    // Incidente de 25/08: o cliente ia ver histórico sem resultado, tela de
    // time sem campanha e card sem odd — três buracos que só apareciam na
    // apresentação, porque o seed publicava o feed ANTES das odds e nunca
    // derivava placar nem classificação.
    const { classificacao, jogos } = await import('../../dominio/db/schema')
    const { isNotNull, and: e } = await import('drizzle-orm')

    const encerrados = await banco.db
      .select()
      .from(jogos)
      .where(e(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
    expect(encerrados.length, 'jogo encerrado sem placar deixa a coluna Resultado vazia').toBeGreaterThan(0)
    // O placar é DERIVADO da soma dos pontos: nunca zero, nunca empate falso.
    for (const j of encerrados.slice(0, 5)) {
      expect(Number(j.placarCasa)).toBeGreaterThan(0)
      expect(Number(j.placarVisitante)).toBeGreaterThan(0)
    }

    const campanha = await banco.db.select().from(classificacao)
    expect(campanha.length, 'sem classificação a tela do time abre sem campanha').toBeGreaterThan(0)
    for (const linha of campanha) {
      expect(linha.vitorias + linha.derrotas).toBeGreaterThan(0)
      expect(linha.posicao).not.toBeNull()
      expect(linha.sequencia).toMatch(/^[VD]\d+$/)
    }
    // Posição é por conferência e não se repete dentro dela.
    const porConferencia = new Map<string, number[]>()
    for (const l of campanha) {
      const chave = l.conferencia ?? 'LIGA'
      porConferencia.set(chave, [...(porConferencia.get(chave) ?? []), l.posicao!])
    }
    for (const [chave, posicoes] of porConferencia) {
      expect(new Set(posicoes).size, `posição repetida em ${chave}`).toBe(posicoes.length)
    }

    // E o card leva a odd: o feed é republicado depois das odds existirem.
    const feed = await lerFeed(banco.db, HOJE)
    const comOdd = (feed?.conteudo.itens ?? []).filter((i) => i.oddFaixa !== null)
    expect(comOdd.length, 'card sem odd no rodapé — feed publicado antes das odds').toBeGreaterThan(0)
  })

  it('reexecutar o seed não duplica nada', async () => {
    const antes = (await banco.db.select().from(jogadores)).length
    const segundo = await semearDemo(banco.db, ruleset, AGORA)
    const depois = (await banco.db.select().from(jogadores)).length
    expect(depois).toBe(antes)
    expect(segundo.times).toBe(30)
    // `odds_snapshot` é série temporal e não tem UNIQUE: sem a limpeza do dia,
    // a segunda execução empilharia cotação em cima de cotação.
    expect(segundo.linhasComOdd).toBe(resumo.linhasComOdd)
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
