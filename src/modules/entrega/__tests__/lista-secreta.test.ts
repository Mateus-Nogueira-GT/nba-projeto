import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  feedSnapshot,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { Nivel, StatusEscalacao } from '../../motor/tipos'
import { montarFatos } from '../../dominio/fatos'
import { CardEntrada } from '../../../design-system/componentes'
import {
  lerFeed,
  ordenarPorConfianca,
  publicarListaSecreta,
  reprocessarPorEscalacao,
} from '../lista-secreta'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const HOJE = '2026-08-19'
const PRIMEIRO_JOGO = new Date(`${HOJE}T23:00:00.000Z`)
const UMA_HORA_ANTES = new Date(`${HOJE}T22:00:00.000Z`)
const CEDO_DEMAIS = new Date(`${HOJE}T12:00:00.000Z`)

/** Hierarquia dos Lakers, como está na lista do CJ. */
const HIERARQUIA: { nome: string; nivel: Nivel }[] = [
  { nome: 'Luka Doncic', nivel: 'MVP' },
  { nome: 'Austin Reaves', nivel: 'ALL_STAR' },
  { nome: 'Grimes', nivel: 'SUPORTE' },
  { nome: 'Kessler', nivel: 'SUPORTE' },
  { nome: 'Mamukelashvili', nivel: 'RANDOLA' },
  { nome: 'Sexton', nivel: 'RANDOLA' },
]

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string
let idPorNome: Map<string, string>

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

/** Semeia um dia de jogo dos Lakers com a hierarquia inteira classificada. */
async function semear() {
  const db = banco.db

  await db.delete(feedSnapshot)
  await db.delete(lesoesEscalacao)
  await db.delete(niveis)
  await db.delete(niveisVersao)
  await db.delete(mediasJogador)
  await db.delete(jogos)
  await db.delete(jogadores)
  await db.delete(times)

  const [lal] = await db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [adv] = await db.insert(times).values({ sigla: 'ADV', nome: 'Adversário' }).returning()

  const [versao] = await db
    .insert(niveisVersao)
    .values({ versao: 'teste-1', ativa: true })
    .returning()

  idPorNome = new Map()
  for (const [indice, { nome, nivel }] of HIERARQUIA.entries()) {
    const [j] = await db.insert(jogadores).values({ nomeCompleto: nome }).returning()
    idPorNome.set(nome, j!.id)

    await db.insert(niveis).values({
      niveisVersaoId: versao!.id,
      jogadorId: j!.id,
      timeId: lal!.id,
      atributo: 'PONTOS',
      nivel,
      posicaoHierarquia: indice + 1,
    })

    await db.insert(mediasJogador).values({
      jogadorId: j!.id,
      temporada: '2025-26',
      janela: 'TEMPORADA',
      jogos: 40,
      ppg: '18.0',
    })
  }

  const [jogo] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: PRIMEIRO_JOGO,
      dataReferencia: HOJE,
      timeCasaId: lal!.id,
      timeVisitanteId: adv!.id,
    })
    .returning()

  jogoId = jogo!.id
}

async function escalar(nome: string, status: StatusEscalacao) {
  await banco.db
    .insert(lesoesEscalacao)
    .values({ jogoId, jogadorId: idPorNome.get(nome)!, status })
    .onConflictDoUpdate({
      target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
      set: { status },
    })
}

async function apitosDeOpd() {
  const feed = await lerFeed(banco.db, HOJE)
  const nomePorId = new Map([...idPorNome].map(([n, id]) => [id, n] as const))

  const porJogador = new Map<string, number>()
  for (const item of feed?.conteudo.itens ?? []) {
    if (item.opdOrigemNivel === null) continue
    porJogador.set(nomePorId.get(item.jogadorId) ?? item.jogadorId, item.opdOrigemNivel)
  }
  return porJogador
}

beforeEach(semear)

// ===========================================================================

describe('job diário da Lista Secreta', () => {
  it('usa somente a média da temporada derivada da data de referência', async () => {
    await banco.db.insert(mediasJogador).values({
      jogadorId: idPorNome.get('Luka Doncic')!,
      temporada: '2026-27',
      janela: 'TEMPORADA',
      jogos: 82,
      ppg: '99.0',
    })

    const fatos = await montarFatos(banco.db, HOJE, {
      mesInicio: ruleset.temporada.mes_inicio,
      formato: ruleset.temporada.formato,
    })
    const luka = fatos.times
      .flatMap((time) => time.jogadores)
      .find((j) => j.id === idPorNome.get('Luka Doncic'))

    expect(luka?.medias.PONTOS).toBe(18)
  })

  it('não publica enquanto faltar mais de 1h para o primeiro jogo', async () => {
    const r = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: CEDO_DEMAIS,
    })

    expect(r).toEqual({ publicou: false, motivo: 'ainda-cedo' })
    expect(await lerFeed(banco.db, HOJE)).toBeNull()
  })

  it('publica exatamente na antecedência configurada', async () => {
    const r = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    expect(r.publicou).toBe(true)
    expect(await lerFeed(banco.db, HOJE)).not.toBeNull()
  })

  it('a antecedência vem do ruleset, não do código', () => {
    expect(ruleset.publicacao.lista_secreta.antecedencia_minutos).toBe(60)
  })

  it('sem jogos no dia, não publica nada', async () => {
    const r = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: '2026-01-01',
      agora: UMA_HORA_ANTES,
    })

    expect(r).toEqual({ publicou: false, motivo: 'sem-jogos' })
  })

  it('reexecutar sem mudança NÃO regrava o snapshot', async () => {
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES })
    const primeira = await lerFeed(banco.db, HOJE)

    const segunda = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: new Date(`${HOJE}T22:30:00.000Z`),
    })

    expect(segunda).toMatchObject({ publicou: true, mudou: false })
    // geradoEm intacto: nada foi reescrito.
    expect((await lerFeed(banco.db, HOJE))?.geradoEm).toEqual(primeira?.geradoEm)
  })
})

// ===========================================================================

describe('reprocessamento por mudança de escalação', () => {
  it('nº 1 FORA → os 3 seguintes apitam em OPD, e o snapshot é regravado', async () => {
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES })
    const antes = await lerFeed(banco.db, HOJE)
    expect(await apitosDeOpd()).toEqual(new Map())

    await escalar('Luka Doncic', 'FORA')
    const r = await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: new Date(`${HOJE}T22:15:00.000Z`),
    })

    expect(r).toMatchObject({ publicou: true, mudou: true })
    expect(r.publicou && r.hash).not.toBe(antes?.conteudo && antes.geradoEm)

    // Escala INVERTIDA: quem está mais perto da vaga recebe o nível mais alto.
    expect(await apitosDeOpd()).toEqual(
      new Map([
        ['Austin Reaves', 3],
        ['Grimes', 2],
        ['Kessler', 1],
      ]),
    )

    const depois = await lerFeed(banco.db, HOJE)
    expect(depois?.geradoEm).not.toEqual(antes?.geradoEm)
  })

  it('nº 1 e nº 2 FORA → a janela anda: Grimes 3, Kessler 2, Mamukelashvili 1', async () => {
    await escalar('Luka Doncic', 'FORA')
    await escalar('Austin Reaves', 'FORA')
    await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    expect(await apitosDeOpd()).toEqual(
      new Map([
        ['Grimes', 3],
        ['Kessler', 2],
        ['Mamukelashvili', 1],
      ]),
    )
  })

  it('nº 2 FORA com o nº 1 jogando → NENHUM apito de OPD', async () => {
    await escalar('Austin Reaves', 'FORA')
    await escalar('Luka Doncic', 'ATIVO')
    await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    // O desfalque tem que ser PREFIXO da hierarquia.
    expect(await apitosDeOpd()).toEqual(new Map())
  })

  it('desfazer o desfalque desfaz os apitos e regrava de novo', async () => {
    await escalar('Luka Doncic', 'FORA')
    await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })
    expect((await apitosDeOpd()).size).toBe(3)

    await escalar('Luka Doncic', 'ATIVO')
    const r = await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: new Date(`${HOJE}T22:40:00.000Z`),
    })

    expect(r).toMatchObject({ mudou: true })
    expect(await apitosDeOpd()).toEqual(new Map())
  })

  it('os apitos gravados respeitam a idempotência do banco', async () => {
    await escalar('Luka Doncic', 'FORA')

    const primeira = await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })
    const segunda = await reprocessarPorEscalacao(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    expect(primeira.publicou && primeira.apitosNovos).toBeGreaterThan(0)
    expect(segunda.publicou && segunda.apitosNovos).toBe(0)
  })
})

// ===========================================================================

describe('a tela consome o feed materializado', () => {
  beforeEach(async () => {
    await escalar('Luka Doncic', 'FORA')
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES })
  })

  it('ordena pela escala de confiança, com turbo à frente', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const ordenados = ordenarPorConfianca(feed!.conteudo.itens)

    for (let i = 1; i < ordenados.length; i++) {
      const anterior = ordenados[i - 1]!
      const atual = ordenados[i]!
      const peso = (x: typeof atual) => [Number(x.turbo), x.nivelApito, x.confianca ?? 0]
      expect(peso(anterior) >= peso(atual) || anterior.chave <= atual.chave).toBe(true)
    }
  })

  it('o filtro de quantidade corta a lista ordenada', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const ordenados = ordenarPorConfianca(feed!.conteudo.itens)

    expect(ordenados.slice(0, 1)).toHaveLength(1)
    expect(ordenados.slice(0, 2)[1]).toEqual(ordenados[1])
    expect(ordenados.length).toBeGreaterThan(2)
  })

  it('os itens do feed renderizam no CardEntrada sem adaptação', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = ordenarPorConfianca(feed!.conteudo.itens)[0]!

    const html = renderToStaticMarkup(
      createElement(CardEntrada, {
        nome: item.nome,
        timeSigla: item.timeSigla,
        timeNome: item.timeNome,
        posicao: null,
        atributo: item.atributo,
        nivelJogador: item.nivelJogador,
        nivelApito: item.nivelApito,
        confianca: item.confianca,
        turbo: item.turbo,
        modoFire: item.modoFire,
        opdOrigemNivel: item.opdOrigemNivel,
      }),
    )

    expect(html).toContain(item.nome)
    expect(html).toContain('LAL')
    expect(html).toContain(`NÍVEL ${item.nivelApito}`)
    // A palavra proibida não pode aparecer na saída renderizada (P12).
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('o snapshot carrega o horário de geração — a tela sempre mostra o quão recente é', async () => {
    const feed = await lerFeed(banco.db, HOJE)

    expect(feed?.geradoEm).toBeInstanceOf(Date)
    expect(feed?.conteudo.rulesetVersao).toContain('v1')
  })
})

// ===========================================================================

describe('fronteira da tela', () => {
  it('nenhuma rota importa o motor em tempo de execução', () => {
    const rotas = [
      'src/app/(app)/page.tsx',
      'src/app/api/cron/lista-secreta/route.ts',
      'src/app/(admin)/admin/mapeamento/page.tsx',
    ]

    for (const rota of rotas) {
      const fonte = readFileSync(rota, 'utf8')
      const importesDeMotor = [...fonte.matchAll(/^import\s+(type\s+)?.*?modules\/motor.*$/gm)]

      for (const [linha, ehTipo] of importesDeMotor.map((m) => [m[0], m[1]] as const)) {
        expect(ehTipo, `${rota}: ${linha}`).toBeDefined()
      }
    }
  })

  it('o feed é lido do snapshot, não recalculado', async () => {
    const fonte = readFileSync('src/app/(app)/page.tsx', 'utf8')

    expect(fonte).toContain('lerFeed')
    expect(fonte).not.toContain('avaliar(')
    expect(fonte).not.toContain('montarFatos')
  })
})
