import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import * as schema from '../../../dominio/db/schema'
import type { Db } from '../../../dominio/db/tipos'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import type { Apito, Fatos } from '../../../motor/tipos'
import type { ConteudoFeed } from '../../tipos-feed'
import { executarDiaRetroativo, executarTemporadaRetroativa, temporadaDoIntervalo } from '../executar'
import { montarItensRetroativos } from '../feed'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const MIL = '00000000-0000-4000-8000-000000000001'
const MIA = '00000000-0000-4000-8000-000000000002'
const BOS = '00000000-0000-4000-8000-000000000003'

const GIANNIS = '00000000-0000-4000-8000-0000000000a1'
const LILLARD = '00000000-0000-4000-8000-0000000000a2'

const VERSAO = '00000000-0000-4000-8000-0000000000b1'
const VERSAO_NOVA = '00000000-0000-4000-8000-0000000000b2'

const JOGO_01 = '00000000-0000-4000-8000-0000000000c1'
const JOGO_02 = '00000000-0000-4000-8000-0000000000c2'
const JOGO_03 = '00000000-0000-4000-8000-0000000000c3'
const JOGO_DIA = '00000000-0000-4000-8000-0000000000c4'

const DIA = '2025-11-04'
/**
 * O relógio de quem roda o script: DEPOIS que 2025-26 acabou. Sem ele, o
 * teste dependeria da data real — até 30/09/2026 a temporada do calendário
 * ainda é 2025-26, e o executor (com razão) a recusa.
 */
const DEPOIS = new Date('2026-11-15T12:00:00Z')

// 23h30 UTC = 20h30 em São Paulo: o jogo cai no mesmo dia da rodada.
function jogoEm(id: string, dia: string) {
  return {
    id,
    timeCasaId: MIL,
    timeVisitanteId: BOS,
    status: 'ENCERRADO' as const,
    dataReferencia: dia,
    dataHoraUtc: new Date(`${dia}T23:30:00Z`),
  }
}

function linha(jogoId: string, jogadorId: string, pontos: number) {
  return { jogoId, jogadorId, timeId: MIL, pontos, minutos: '30', rebotesTotal: 5, assistencias: 3 }
}

/**
 * Mesma semente da Task 4 (fatos.test.ts): a lista do CJ projeta os dois no
 * Miami, em 2025-26 eles jogaram no Milwaukee.
 *
 * Os números exercitam `oscilacao` do config/ruleset.v1.yaml:
 * - Giannis (MVP, `delta.MVP: 6`): 30, 30, 12 → média 24, limiar 18. O último
 *   jogo (12 ≤ 18) abre a sequência, o anterior (30) a fecha: sequência 1 →
 *   nível do apito 1, que `nivel_minimo_apito.MVP: 1` já deixa apitar.
 * - Lillard (ALL_STAR, `delta.ALL_STAR: 5`): 25, 25, 15 → média 21,67, limiar
 *   16,67. 15 ≤ 16,67 → sequência 1 → nível do apito 1 (`ALL_STAR: 1`).
 * Os dois jogam no DIA, então não há desfalque e a OPD não entra.
 */
async function semear(db: Db) {
  await db.insert(schema.times).values([
    { id: MIL, sigla: 'MIL', nome: 'Bucks', conferencia: 'Leste' },
    { id: MIA, sigla: 'MIA', nome: 'Heat', conferencia: 'Leste' },
    { id: BOS, sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' },
  ])
  await db.insert(schema.jogadores).values([
    { id: GIANNIS, nomeCompleto: 'Giannis Antetokounmpo', posicao: 'F' },
    { id: LILLARD, nomeCompleto: 'Damian Lillard', posicao: 'G' },
  ])
  await db.insert(schema.niveisVersao).values({ id: VERSAO, versao: 'v-teste', ativa: true })
  await db.insert(schema.niveis).values([
    {
      niveisVersaoId: VERSAO,
      jogadorId: GIANNIS,
      timeId: MIA,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: VERSAO,
      jogadorId: LILLARD,
      timeId: MIA,
      atributo: 'PONTOS',
      nivel: 'ALL_STAR',
      posicaoHierarquia: 2,
    },
  ])
  await db
    .insert(schema.jogos)
    .values([
      jogoEm(JOGO_01, '2025-11-01'),
      jogoEm(JOGO_02, '2025-11-02'),
      jogoEm(JOGO_03, '2025-11-03'),
      jogoEm(JOGO_DIA, DIA),
    ])
  await db
    .insert(schema.estatisticasJogo)
    .values([
      linha(JOGO_01, GIANNIS, 30),
      linha(JOGO_01, LILLARD, 25),
      linha(JOGO_02, GIANNIS, 30),
      linha(JOGO_02, LILLARD, 25),
      linha(JOGO_03, GIANNIS, 12),
      linha(JOGO_03, LILLARD, 15),
      linha(JOGO_DIA, GIANNIS, 28),
      linha(JOGO_DIA, LILLARD, 22),
    ])
}

/** O CJ troca a lista: versão nova, ativa, sem o Giannis. */
async function ativarOutraVersaoSemOGiannis(db: Db): Promise<string> {
  await db.update(schema.niveisVersao).set({ ativa: false })
  await db.insert(schema.niveisVersao).values({ id: VERSAO_NOVA, versao: 'v-nova', ativa: true })
  await db.insert(schema.niveis).values({
    niveisVersaoId: VERSAO_NOVA,
    jogadorId: LILLARD,
    timeId: MIA,
    atributo: 'PONTOS',
    nivel: 'ALL_STAR',
    posicaoHierarquia: 1,
  })
  return VERSAO_NOVA
}

describe('executarDiaRetroativo', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let db: Db

  async function contar(tabela: string): Promise<number> {
    const r = await banco.pg.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)
    return r.rows[0]!.n
  }

  beforeEach(async () => {
    banco = await bancoDeTeste()
    db = banco.db as unknown as Db
    await semear(db)
  }, 30_000)

  afterEach(async () => {
    await banco.fechar()
  })

  it('grava apitos da temporada anterior e nada em apitos/greens/feed_snapshot', async () => {
    const r = await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    expect(r.apitos).toBeGreaterThan(0)
    expect(r.jogos).toBe(1)
    expect(await contar('apitos_retroativos')).toBe(r.apitos)
    expect(await contar('greens_retroativos')).toBe(r.greens)
    expect(await contar('feed_retroativo')).toBe(1)
    expect(await contar('apitos')).toBe(0)
    expect(await contar('greens')).toBe(0)
    expect(await contar('feed_snapshot')).toBe(0)

    const linhas = await db.select().from(schema.apitosRetroativos)
    expect(linhas.every((l) => l.temporada === '2025-26' && l.dataReferencia === DIA)).toBe(true)
    expect(linhas.every((l) => l.niveisVersaoId === VERSAO)).toBe(true)
    expect(linhas.every((l) => l.rulesetVersao === `v${ruleset.version}`)).toBe(true)
    expect(linhas.some((l) => l.jogadorId === GIANNIS && l.metodo === 'OSCILACAO')).toBe(true)
  }, 30_000)

  it('o green do 1º quarto vai para greens_retroativos, não para greens', async () => {
    // `push.marcos_green.MVP` começa em 25: 26 no quarto do Fire Live bate o 25.
    await db
      .insert(schema.estatisticasQuarto)
      .values({
        jogoId: JOGO_DIA,
        jogadorId: GIANNIS,
        quarto: ruleset.fire_live.quarto,
        pontos: 26,
      })
    const r = await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    expect(r.greens).toBe(1)
    const [g] = await db.select().from(schema.greensRetroativos)
    expect(g).toMatchObject({ jogadorId: GIANNIS, marco: 25, valor: 26, temporada: '2025-26' })
    expect(await contar('greens')).toBe(0)
    expect(await contar('apitos')).toBe(0)
  }, 30_000)

  it('rodar duas vezes não duplica', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const antes = await contar('apitos_retroativos')
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    expect(await contar('apitos_retroativos')).toBe(antes)
    expect(await contar('feed_retroativo')).toBe(1)
  }, 30_000)

  it('trocar a lista do CJ regrava o dia com a versão nova', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const versaoNova = await ativarOutraVersaoSemOGiannis(db)
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const linhas = await db.select().from(schema.apitosRetroativos)
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.every((l) => l.niveisVersaoId === versaoNova)).toBe(true)
    expect(linhas.some((l) => l.jogadorId === GIANNIS)).toBe(false)
    const [f] = await db.select().from(schema.feedRetroativo)
    expect(f!.niveisVersaoId).toBe(versaoNova)
  }, 30_000)

  it('o feed do dia não tem odd e tem ultimos5 do histórico', async () => {
    await executarDiaRetroativo(db, ruleset, DIA, { agora: DEPOIS })
    const [f] = await db.select().from(schema.feedRetroativo)
    const conteudo = f!.conteudoJson as ConteudoFeed
    const itens = conteudo.itens
    expect(itens.length).toBeGreaterThan(0)
    expect(itens.every((i) => i.oddFaixa === null)).toBe(true)
    expect(itens.every((i) => i.chave.includes('LISTA_SECRETA'))).toBe(true)

    // Giannis, linha 20: 12 (não bateu), 30, 30 — mais recente primeiro.
    const g = itens.find((i) => i.jogadorId === GIANNIS && i.linha === 20)!
    expect(g.ultimos5).toEqual([
      { valor: 12, bateu: false },
      { valor: 30, bateu: true },
      { valor: 30, bateu: true },
    ])
    expect(g.mediaTemporada).toBe(24)
    // O time do DIA (o que ele jogou), não o Miami da lista.
    expect(g.timeSigla).toBe('MIL')
    expect(g.timeNome).toBe('Bucks')
    expect(g.posicao).toBe('F')
    expect(f!.hash).toMatch(/^[0-9a-f]+$/)
  }, 30_000)

  it('dia sem jogo não escreve nada', async () => {
    const r = await executarDiaRetroativo(db, ruleset, '2025-11-10', { agora: DEPOIS })
    expect(r).toEqual({ apitos: 0, greens: 0, jogos: 0 })
    expect(await contar('feed_retroativo')).toBe(0)
  }, 30_000)

  it('a temporada soma os dias do período', async () => {
    const dias: string[] = []
    const r = await executarTemporadaRetroativa(db, ruleset, {
      de: '2025-11-03',
      ate: DIA,
      agora: DEPOIS,
      aoConcluirDia: (data) => {
        dias.push(data)
      },
    })
    expect(dias).toEqual(['2025-11-03', DIA])
    expect(r.jogos).toBe(2)
    expect(r.apitos).toBe(await contar('apitos_retroativos'))
    expect(await contar('feed_retroativo')).toBe(2)
  }, 30_000)
  it('recusa um dia da temporada do CALENDÁRIO, sem gravar nada', async () => {
    // Em 15/01/2026 a temporada do calendário é 2025-26: o dia 04/11/2025 é
    // dela, e ela é publicada ao vivo pelo job diário — nunca pelo retroativo.
    await expect(
      executarDiaRetroativo(db, ruleset, DIA, { agora: new Date('2026-01-15T12:00:00Z') }),
    ).rejects.toThrow(/temporada do calendário \(2025-26\)/)
    expect(await contar('apitos_retroativos')).toBe(0)
    expect(await contar('feed_retroativo')).toBe(0)
    await expect(
      executarTemporadaRetroativa(db, ruleset, { de: '2025-11-03', ate: DIA, agora: new Date('2026-01-15T12:00:00Z') }),
    ).rejects.toThrow(/temporada do calendário/)
  }, 30_000)
})

describe('temporadaDoIntervalo', () => {
  const calendario = { mesInicio: 10, formato: 'dois_anos' as const, fuso: 'America/Sao_Paulo' }
  const agora = new Date('2026-10-15T12:00:00Z')

  it('o intervalo inteiro numa temporada anterior: devolve ela', () => {
    expect(temporadaDoIntervalo('2025-10-21', '2026-04-12', calendario, agora)).toBe('2025-26')
  })

  it('pontas em temporadas diferentes: recusa, dizendo quais', () => {
    expect(() => temporadaDoIntervalo('2024-11-01', '2025-11-01', calendario, agora)).toThrow(
      /uma temporada só.*2024-25.*2025-26/,
    )
  })

  it('recusa a temporada do calendário, mesmo com as duas pontas nela', () => {
    expect(() => temporadaDoIntervalo('2026-10-01', '2026-10-05', calendario, agora)).toThrow(
      /temporada do calendário \(2026-27\)/,
    )
    // E o intervalo que ATRAVESSA para a do calendário também.
    expect(() => temporadaDoIntervalo('2026-09-01', '2026-10-05', calendario, agora)).toThrow(/uma temporada só/)
  })

  it('recusa uma temporada FUTURA — só roda sobre o que já aconteceu', () => {
    expect(() => temporadaDoIntervalo('2027-10-20', '2027-11-01', calendario, agora)).toThrow(
      /temporada anterior.*2027-28/,
    )
  })
})

describe('montarItensRetroativos', () => {
  it('monta o item da Lista com o nome e o time do mapa, sem odd', () => {
    const apito: Apito = {
      chaveDeduplicacao: `J1|${GIANNIS}|PONTOS|LISTA_SECRETA|20`,
      jogoId: 'J1',
      jogadorId: GIANNIS,
      atributo: 'PONTOS',
      estrategia: 'LISTA_SECRETA',
      metodo: 'OSCILACAO',
      nivelJogador: 'MVP',
      nivelApito: 1,
      turbo: false,
      modoFire: false,
      opdOrigemNivel: null,
      linha: 20,
      confianca: 95,
      alvo1Q: null,
    }
    const fatos: Fatos = {
      dataReferencia: DIA,
      jogos: [],
      times: [
        {
          id: MIL,
          sigla: 'MIL',
          jogadores: [
            {
              id: GIANNIS,
              nome: 'Giannis',
              timeId: MIL,
              posicaoHierarquia: 1,
              classificacoes: { PONTOS: 'MVP' },
              medias: { PONTOS: 24 },
              historico: [
                {
                  jogoId: 'a',
                  data: '2025-11-03',
                  jogou: true,
                  pontos: 12,
                  rebotes: 0,
                  assistencias: 0,
                },
                {
                  jogoId: 'b',
                  data: '2025-11-02',
                  jogou: false,
                  pontos: 0,
                  rebotes: 0,
                  assistencias: 0,
                },
                {
                  jogoId: 'c',
                  data: '2025-11-01',
                  jogou: true,
                  pontos: 30,
                  rebotes: 0,
                  assistencias: 0,
                },
              ],
            },
          ],
        },
      ],
    }
    const nomes = new Map([
      [
        GIANNIS,
        {
          nome: 'Giannis Antetokounmpo',
          fotoUrl: null,
          timeSigla: 'MIL',
          timeNome: 'Bucks',
          posicao: 'F',
        },
      ],
    ])
    const [item] = montarItensRetroativos([apito], fatos, nomes, ruleset)
    expect(item!.chave).toBe(apito.chaveDeduplicacao)
    expect(item!.nome).toBe('Giannis Antetokounmpo')
    expect(item!.timeSigla).toBe('MIL')
    expect(item!.oddFaixa).toBeNull()
    expect(item!.mediaTemporada).toBe(24)
    // O DNP não conta como jogo nas barrinhas.
    expect(item!.ultimos5).toEqual([
      { valor: 12, bateu: false },
      { valor: 30, bateu: true },
    ])
  })
})
