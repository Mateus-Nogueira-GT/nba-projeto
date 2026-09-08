import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  feedSnapshot,
  identidadesJogador,
  jogadores,
  jogos,
  lesoesEscalacao,
  mapaJogadores,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import {
  buscarIdsPorNomeOuAlias,
  identidadesDeApresentacao,
} from '../../dominio/identidade-apresentacao'
import { lerFeed, type ConteudoFeed, type ItemFeed } from '../lista-secreta'
import { lerFeedFireLive } from '../fire-live/leitura'
import type { ConteudoFeedFireLive } from '../fire-live/feed'
import { detalheDoApito } from '../detalhe-apito'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { relatarIdentidades } from '../../dominio/relatorio-identidades'

const DIA = '2026-01-15'
const AGORA = new Date(`${DIA}T23:00:00Z`)
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let ids: string[]
let item: ItemFeed
let original: ConteudoFeed
let fireOriginal: ConteudoFeedFireLive

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, visitante] = await banco.db
    .insert(times)
    .values([
      { sigla: 'NYK', nome: 'New York Knicks' },
      { sigla: 'BOS', nome: 'Boston Celtics' },
    ])
    .returning()
  const elenco = await banco.db
    .insert(jogadores)
    .values([
      { nomeCompleto: 'Brunson', timeId: casa!.id },
      { nomeCompleto: 'Doncic do provedor' },
      { nomeCompleto: 'Wiggins' },
      { nomeCompleto: 'Curadoria divergente' },
      { nomeCompleto: 'Sem confirmação' },
      { nomeCompleto: 'Pessoa externa' },
    ])
    .returning()
  ids = elenco.map((j) => j.id)
  await banco.db.insert(mapaJogadores).values([
    ...[
      { nomeNaLista: 'Brunson', jogadorId: ids[0]!, provedor: 'demo' },
      { nomeNaLista: 'L. Brunson', jogadorId: ids[0]!, provedor: 'casa' },
      { nomeNaLista: 'Wiggins', jogadorId: ids[2]!, provedor: 'demo' },
      { nomeNaLista: 'Luka Doncic', jogadorId: ids[3]!, provedor: 'demo' },
      { nomeNaLista: 'Brunson', jogadorId: ids[3]!, provedor: 'casa' },
    ].map((v) => ({ ...v, confirmadoPor: 'curador', confirmadoEm: AGORA })),
    { nomeNaLista: 'Shai', jogadorId: ids[4]!, provedor: 'demo' },
  ])
  await banco.db.insert(identidadesJogador).values([
    { jogadorId: ids[1]!, provedor: 'nba', idExterno: '1629029' },
    // IDs de fontes diferentes não compartilham namespace.
    { jogadorId: ids[5]!, provedor: 'api-sports', idExterno: '1629029' },
  ])
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataReferencia: DIA,
      dataHoraUtc: AGORA,
      timeCasaId: casa!.id,
      timeVisitanteId: visitante!.id,
      status: 'AO_VIVO',
      quartoAtual: 1,
    })
    .returning()
  item = {
    chave: 'chave-historica',
    jogoId: jogo!.id,
    jogadorId: ids[0]!,
    nome: 'Brunson',
    timeSigla: 'NYK',
    timeNome: 'New York Knicks',
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
    ultimos5: [{ valor: 19, bateu: false }],
    mediaTemporada: 30,
    oddFaixa: { min: 1.5, max: 1.8, media: 1.65, qtdCasas: 2 },
    narrativa: 'Brunson ficou abaixo da média.',
  }
  original = {
    dataReferencia: DIA,
    geradoEm: AGORA.toISOString(),
    rulesetVersao: 'v1',
    itens: [item],
  }
  fireOriginal = {
    ...original,
    jogoId: jogo!.id,
    itens: [
      {
        ...item,
        chave: 'chave-fire',
        linha: null,
        confianca: null,
        grauConfianca: null,
        alvo1Q: 8,
        metodo: null,
        adversarioSigla: 'BOS',
        quartoAtual: 1,
        encerrado: false,
        valorNoQuarto: 8,
        apitadoEm: AGORA.toISOString(),
      },
    ],
  }
  await banco.db.insert(feedSnapshot).values([
    {
      dataReferencia: DIA,
      estrategia: 'LISTA_SECRETA',
      conteudoJson: original,
      hash: 'legado-lista',
      geradoEm: AGORA,
    },
    {
      dataReferencia: DIA,
      estrategia: 'FIRE_LIVE',
      jogoId: jogo!.id,
      conteudoJson: fireOriginal,
      hash: 'legado-fire',
      geradoEm: AGORA,
    },
  ])
})
afterAll(async () => banco.fechar())

describe('nomes oficiais são uma projeção segura da identidade', () => {
  it('resolve por alias confirmado e NBA explícita, sem inferir identidade por semelhança ou namespace', async () => {
    const mapa = await identidadesDeApresentacao(banco.db, ids)
    expect(mapa.get(ids[0]!)).toMatchObject({
      nome: 'Jalen Brunson',
      personId: 1628973,
      pendencia: null,
    })
    expect(mapa.get(ids[1]!)).toMatchObject({
      nome: 'Luka Dončić',
      personId: 1629029,
      pendencia: null,
    })
    expect(mapa.get(ids[2]!)).toMatchObject({
      nome: 'Wiggins',
      personId: null,
      pendencia: 'IDENTIDADE_AMBIGUA',
    })
    expect(mapa.get(ids[3]!)).toMatchObject({
      nome: 'Curadoria divergente',
      personId: null,
      pendencia: 'VINCULOS_DIVERGENTES',
    })
    expect(mapa.get(ids[4]!)).toMatchObject({ nome: 'Sem confirmação', personId: null })
    expect(mapa.get(ids[5]!)).toMatchObject({ nome: 'Pessoa externa', personId: null })
    expect(await identidadesDeApresentacao(banco.db, [])).toEqual(new Map())
  })

  it('encontra o mesmo UUID por nome oficial, nome do provedor e alias de casa posterior', async () => {
    expect(await buscarIdsPorNomeOuAlias(banco.db, 'Jalen Brunson')).toEqual([ids[0]])
    expect(await buscarIdsPorNomeOuAlias(banco.db, 'L. Brunson')).toEqual([ids[0]])
    expect(await buscarIdsPorNomeOuAlias(banco.db, 'Doncic do provedor')).toEqual([ids[1]])
    expect(await buscarIdsPorNomeOuAlias(banco.db, '')).toEqual([])
    const [canonico] = await banco.db.select().from(jogadores).where(eq(jogadores.id, ids[1]!))
    expect(canonico!.nomeCompleto).toBe('Doncic do provedor')
  })

  it('lê nome oficial em snapshot antigo da Lista sem reescrever apito ou narrativa', async () => {
    const feed = await lerFeed(banco.db, DIA)
    expect(feed!.conteudo.itens).toEqual([{ ...item, nome: 'Jalen Brunson' }])
    const [persistido] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(eq(feedSnapshot.estrategia, 'LISTA_SECRETA'))
    expect(persistido!.conteudoJson).toEqual(original)
    expect(persistido!.hash).toBe('legado-lista')
  })

  it('lê nome oficial em snapshot antigo do Fire Live preservando o mesmo sinal', async () => {
    const feed = await lerFeedFireLive(banco.db, DIA, 1)
    expect(feed.itens).toEqual([{ ...fireOriginal.itens[0], nome: 'Jalen Brunson' }])
    const [persistido] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(eq(feedSnapshot.estrategia, 'FIRE_LIVE'))
    expect(persistido!.conteudoJson).toEqual(fireOriginal)
    expect(persistido!.hash).toBe('legado-fire')
  })

  it('a explicação da OPD e a lista de desfalques apresentam o mesmo nome oficial', async () => {
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, item.jogoId))
    const [versao] = await banco.db
      .insert(niveisVersao)
      .values({ versao: 'identidade', ativa: true })
      .returning()
    await banco.db.insert(niveis).values([
      {
        niveisVersaoId: versao!.id,
        timeId: jogo!.timeCasaId,
        jogadorId: ids[0]!,
        atributo: 'PONTOS',
        nivel: 'MVP',
        posicaoHierarquia: 1,
      },
      {
        niveisVersaoId: versao!.id,
        timeId: jogo!.timeCasaId,
        jogadorId: ids[1]!,
        atributo: 'PONTOS',
        nivel: 'ALL_STAR',
        posicaoHierarquia: 2,
      },
    ])
    await banco.db
      .insert(lesoesEscalacao)
      .values({ jogoId: item.jogoId, jogadorId: ids[0]!, status: 'FORA' })
    const detalhe = await detalheDoApito(banco.db, carregarRuleset(yamlBruto), {
      ...item,
      jogadorId: ids[1]!,
      nome: 'Luka Dončić',
      metodo: 'OPD',
      nivelJogador: 'ALL_STAR',
    })
    expect(detalhe!.jogo.desfalques).toEqual(['Jalen Brunson'])
    expect(detalhe!.fatores.find((f) => f.chave === 'OPD')?.texto).toContain('Jalen Brunson')
  })

  it('o relatório expõe pendências e referências sem atribuir ou copiar histórico', async () => {
    const pendencias = await relatarIdentidades(banco.db)
    expect(pendencias.map((p) => p.jogadorId).sort()).toEqual([ids[2]!, ids[3]!].sort())
    const wiggins = pendencias.find((p) => p.jogadorId === ids[2])!
    expect(wiggins).toMatchObject({
      nome: 'Wiggins',
      personId: null,
      pendencia: 'IDENTIDADE_AMBIGUA',
    })
    expect(wiggins.vinculos).toEqual([
      expect.objectContaining({ alias: 'Wiggins', provedor: 'demo' }),
    ])
    const [brunson] = await relatarIdentidades(banco.db, [ids[0]!])
    expect(brunson!.referencias).toMatchObject({ mapa_jogadores: 2, niveis: 1, feed_snapshot: 2 })
    expect(brunson!.vinculos).toHaveLength(2)
    const [persistido] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(eq(feedSnapshot.estrategia, 'LISTA_SECRETA'))
    expect(persistido!.conteudoJson).toEqual(original)
  })
})
