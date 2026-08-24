import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

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
  agruparPorJogador,
  filtrarItens,
  lerFeed,
  linhasDoJogador,
  ordenarPorConfianca,
  publicarListaSecreta,
  reprocessarPorEscalacao,
} from '../lista-secreta'
import type { ItemFeed } from '../lista-secreta'
import { calendarioDoRuleset } from '../../dominio/temporada'

/** Todos os .ts/.tsx sob um diretório, recursivamente. */
function arquivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? arquivosDe(join(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )
}

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

    const fatos = await montarFatos(banco.db, HOJE, calendarioDoRuleset(ruleset))
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
        posicao: null,
        atributo: item.atributo,
        nivelJogador: item.nivelJogador,
        nivelApito: item.nivelApito,
        confianca: item.confianca,
        grauConfianca: null,
        turbo: item.turbo,
        modoFire: item.modoFire,
        opdOrigemNivel: item.opdOrigemNivel,
      }),
    )

    expect(html).toContain(item.nome)
    expect(html).toContain('LAL')
    expect(html).toContain(`N${item.nivelApito}`)
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

// ===========================================================================
// O GRAU DA CONFIANÇA VIAJA NO FEED (C1)
// ===========================================================================

describe('o grau da confiança é calculado UMA vez, na materialização', () => {
  beforeEach(async () => {
    await escalar('Luka Doncic', 'FORA')
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES })
  })

  it('todo item publicado traz o grau junto — a tela não precisa recalcular', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const itens = feed!.conteudo.itens

    expect(itens.length).toBeGreaterThan(0)
    for (const item of itens) {
      if (item.confianca === null) expect(item.grauConfianca).toBeNull()
      else expect([1, 2, 3, 4, 5]).toContain(item.grauConfianca)
    }
  })

  it('o grau sai do valor ARREDONDADO — 85,5 exibe 86% e 86% é grau 3 (I4)', async () => {
    // Grimes é SUPORTE e recebe OPD nível 2: 85 da tabela base da linha 15
    // mais 0,5 de bônus. A tela imprime "86%"; se o grau viesse do valor bruto
    // a pílula sairia no grau 2 ("CONFIANÇA SÓLIDA") enquanto a régua de
    // /como-funciona promete "CONFIANÇA FORTE" para 86. Duas telas, uma
    // contradição — o assinante confere.
    const feed = await lerFeed(banco.db, HOJE)
    const grimes = feed!.conteudo.itens.find(
      (i) => i.jogadorId === idPorNome.get('Grimes') && i.linha === 15,
    )!

    expect(grimes.confianca).toBe(85.5)
    expect(grimes.grauConfianca).toBe(3)
  })

  it('snapshot antigo, sem o campo, continua legível como grau nulo', () => {
    const legado = JSON.parse('{"chave":"k","confianca":92}') as ItemFeed
    expect(legado.grauConfianca ?? null).toBeNull()
  })
})

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

  it('a tela não recalcula a faixa — nem por reexport da entrega', () => {
    // O reexport de `faixaDaConfianca` em lista-secreta.ts existia só para
    // driblar a guarda `tela-nao-chama-o-motor`: a função é do MOTOR e era
    // chamada uma vez por item, por render, por usuário. A avaliação acontece
    // uma vez por EVENTO — é isso que separa 10k usuários de ser trivial ou
    // impossível. O grau agora viaja no feed.
    const infratores = arquivosDe('src/app').filter((a) =>
      /faixaDaConfianca/.test(readFileSync(a, 'utf8')),
    )
    expect(infratores).toEqual([])

    const entrega = readFileSync('src/modules/entrega/lista-secreta.ts', 'utf8')
    expect(/export\s*\{[^}]*faixaDaConfianca/.test(entrega)).toBe(false)
  })

  it('o feed é lido do snapshot, não recalculado', async () => {
    const fonte = readFileSync('src/app/(app)/page.tsx', 'utf8')

    expect(fonte).toContain('lerFeed')
    expect(fonte).not.toContain('avaliar(')
    expect(fonte).not.toContain('montarFatos')
  })
})

// ===========================================================================
// FILTROS E AGRUPAMENTO (spec 08 — o documento do CJ pede filtragem total)
// ===========================================================================

describe('método e posição viajam no item do feed', () => {
  it('OPD publicada traz método e a posição do jogador', async () => {
    await banco.db
      .update(jogadores)
      .set({ posicao: 'G' })
      .where(eq(jogadores.id, idPorNome.get('Austin Reaves')!))
    await escalar('Luka Doncic', 'FORA')

    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    const feed = await lerFeed(banco.db, HOJE)
    const reaves = feed!.conteudo.itens.find(
      (i) => i.jogadorId === idPorNome.get('Austin Reaves'),
    )!
    expect(reaves.metodo).toBe('OPD')
    expect(reaves.posicao).toBe('G')
  })

  it('snapshot legado sem os campos novos não quebra a leitura', () => {
    const legado = JSON.parse('{"chave":"k","jogoId":"j","jogadorId":"p","nome":"X"}') as ItemFeed
    expect(legado.metodo ?? null).toBeNull()
    expect(legado.posicao ?? null).toBeNull()
  })
})

describe('filtrarItens e agruparPorJogador (puros)', () => {
  const base: ItemFeed = {
    chave: 'c1',
    jogoId: 'j1',
    jogadorId: 'p1',
    nome: 'Um',
    timeSigla: 'LAL',
    timeNome: 'Lakers',
    fotoUrl: null,
    atributo: 'PONTOS',
    nivelJogador: 'MVP',
    nivelApito: 1,
    turbo: false,
    modoFire: false,
    opdOrigemNivel: null,
    linha: 20,
    confianca: 95,
    grauConfianca: 5,
    alvo1Q: null,
    metodo: 'OSCILACAO',
    posicao: 'G',
  }
  const item = (over: Partial<ItemFeed>): ItemFeed => ({ ...base, ...over })

  it('recorta por método, nível, time e posição', () => {
    const itens = [
      base,
      item({ chave: 'c2', jogadorId: 'p2', metodo: 'OPD', nivelJogador: 'SUPORTE' }),
      item({ chave: 'c3', jogadorId: 'p3', timeSigla: 'DEN', posicao: 'C' }),
    ]
    expect(filtrarItens(itens, { metodo: 'OPD' }).map((i) => i.jogadorId)).toEqual(['p2'])
    expect(filtrarItens(itens, { nivel: 'SUPORTE' }).map((i) => i.jogadorId)).toEqual(['p2'])
    expect(filtrarItens(itens, { time: 'DEN' }).map((i) => i.jogadorId)).toEqual(['p3'])
    expect(filtrarItens(itens, { posicao: 'C' }).map((i) => i.jogadorId)).toEqual(['p3'])
  })

  it('turbo é um método de recorte por si', () => {
    const itens = [base, item({ chave: 'c2', jogadorId: 'p2', turbo: true })]
    expect(filtrarItens(itens, { metodo: 'TURBO' }).map((i) => i.jogadorId)).toEqual(['p2'])
  })

  it('filtros combinam entre si', () => {
    const itens = [
      base,
      item({ chave: 'c2', jogadorId: 'p2', timeSigla: 'DEN' }),
      item({ chave: 'c3', jogadorId: 'p3', timeSigla: 'DEN', nivelJogador: 'RANDOLA' }),
    ]
    const r = filtrarItens(itens, { time: 'DEN', nivel: 'RANDOLA' })
    expect(r.map((i) => i.jogadorId)).toEqual(['p3'])
  })

  it('valor desconhecido devolve lista vazia, nunca erro', () => {
    expect(filtrarItens([base], { time: 'XXX' })).toEqual([])
  })

  it('agrupa por jogador escolhendo a maior confiança', () => {
    const itens = [
      item({ chave: 'a', linha: 30, confianca: 85 }),
      item({ chave: 'b', linha: 20, confianca: 95 }),
      item({ chave: 'c', jogadorId: 'p2', linha: 15, confianca: 90 }),
    ]
    const r = agruparPorJogador(itens)
    expect(r).toHaveLength(2)
    expect(r.find((i) => i.jogadorId === 'p1')!.linha).toBe(20)
  })

  it('empate de confiança resolve pela menor linha (determinismo)', () => {
    const itens = [
      item({ chave: 'a', linha: 30, confianca: 90 }),
      item({ chave: 'b', linha: 20, confianca: 90 }),
    ]
    expect(agruparPorJogador(itens)[0]!.linha).toBe(20)
  })

  it('confiança nula não quebra a ordenação', () => {
    const itens = [
      item({ chave: 'a', confianca: null }),
      item({ chave: 'b', linha: 25, confianca: 80 }),
    ]
    expect(agruparPorJogador(itens)[0]!.confianca).toBe(80)
  })
})

describe('linhasDoJogador (detalhe do apito)', () => {
  it('devolve as linhas do jogador ordenadas por pontos', async () => {
    await escalar('Luka Doncic', 'FORA')
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })

    const reavesId = idPorNome.get('Austin Reaves')!
    const { itens, geradoEm } = await linhasDoJogador(banco.db, HOJE, reavesId)

    expect(itens.length).toBeGreaterThan(1)
    expect(itens.every((i) => i.jogadorId === reavesId)).toBe(true)
    const linhas = itens.map((i) => i.linha)
    expect(linhas).toEqual([...linhas].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(geradoEm).not.toBeNull()
    // A confiança é a nota da análise — nunca probabilidade.
    expect(itens.every((i) => i.confianca !== null)).toBe(true)
  })

  it('jogador sem apito hoje devolve lista vazia, não erro', async () => {
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
    })
    const { itens } = await linhasDoJogador(banco.db, HOJE, idPorNome.get('Sexton')!)
    expect(itens).toEqual([])
  })

  it('dia sem feed publicado devolve geradoEm nulo', async () => {
    const r = await linhasDoJogador(banco.db, '2026-01-01', idPorNome.get('Grimes')!)
    expect(r).toEqual({ itens: [], geradoEm: null })
  })
})
