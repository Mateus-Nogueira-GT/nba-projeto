import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { casas as tabelaCasas, jogadores, jogos, mapaMercados, oddsAgregada, times } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { coletarOddsDoDia } from '../odds/coleta-do-dia'
import type { FonteOdds } from '../odds/fontes'

// O ruleset HOMOLOGADO, sem override: casas_minimas = 2. É esse mínimo que a
// média entre casas precisa alcançar — e só alcança olhando as fontes juntas.
const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const DIA = '2026-08-28'
const AGORA = new Date('2026-08-28T12:00:00Z')

const ALTENAR: FonteOdds = {
  nome: 'altenar',
  config: { gatewayBase: 'https://gw.altenar.example', origin: 'https://nosso.app', integration: 'nossa', sportId: '67', champId: null },
}
const BETMGM: FonteOdds = {
  nome: 'betmgm',
  config: { baseUrl: 'https://afiliados.betmgm.example', apiKey: 'k', authHeader: 'Authorization', authPrefix: 'Bearer', brand: 'marca', location: 'BR', lang: 'en' },
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

/** Altenar: authenticate, lista do dia, detalhe. Grafia curta ("Lakers vs Celtics"), como a casa faz. */
const transporteAltenar: typeof fetch = async (entrada) => {
  const url = String(entrada)
  if (url.includes('/api/authenticate')) return json({ token: 'tok' })
  if (url.includes('/api/v1/events/')) {
    return json({
      id: 'a1',
      markets: [
        { name: 'Total de Pontos - Stephen Curry', odds: [{ price: 1.85, oddStatus: 0, name: 'Mais de 24.5' }, { price: 1.95, oddStatus: 0, name: 'Menos de 24.5' }] },
        // Rebotes AINDA sem curadoria: precisa aparecer como aguardando, não sumir.
        { name: 'Total de Rebotes - Stephen Curry', odds: [{ price: 2.0, oddStatus: 0, name: 'Mais de 5.5' }] },
      ],
    })
  }
  return json({ data: [{ eventId: 'a1', name: 'Lakers vs Celtics', startDate: '2026-08-28T23:00:00Z' }] })
}

/** BetMGM: lista (com a REVANCHE de daqui a dois dias, que o corte de dia tem que barrar) e detalhe por ids=. */
const transporteBetmgm: typeof fetch = async (entrada) => {
  const url = String(entrada)
  if (url.includes('ids=')) {
    return json({
      nextCursor: null,
      data: [
        {
          id: 'b1',
          matchState: 'PREMATCH',
          participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }],
          betMarkets: [
            {
              name: 'Player Points',
              betMarketStatus: 'OPEN',
              specifiers: [{ name: 'player', value: 'Stephen Curry' }, { name: 'line', value: '24.5' }],
              outcomes: [{ name: 'Over', formatDecimal: 1.9, probability: 0.5 }, { name: 'Under', formatDecimal: 1.9, probability: 0.5 }],
            },
          ],
        },
      ],
    })
  }
  return json({
    nextCursor: null,
    data: [
      { id: 'b1', matchState: 'PREMATCH', participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }], startTime: '2026-08-28T23:00:00Z' },
      { id: 'b2', matchState: 'PREMATCH', participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }], startTime: '2026-08-30T23:00:00Z' },
    ],
  })
}

/** Esta casa está fora do ar. */
const transporteQuebrado: typeof fetch = async () => {
  throw new Error('ECONNREFUSED')
}

async function semearDia(banco: Awaited<ReturnType<typeof bancoDeTeste>>) {
  // Nomes COMPLETOS, como o provedor NBA grava — as casas grafam curto.
  const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Los Angeles Lakers' }).returning()
  const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Boston Celtics' }).returning()
  await banco.db.insert(jogos).values({ dataHoraUtc: new Date('2026-08-28T23:00:00Z'), dataReferencia: DIA, timeCasaId: lal!.id, timeVisitanteId: bos!.id })
  await banco.db.insert(jogadores).values({ nomeCompleto: 'Stephen Curry' })
  // A curadoria de MERCADO já foi feita (passo 3 do runbook), UMA linha por
  // modelo. A de JOGADOR não — é a semeadura que precisa resolver o Curry.
  const [alt] = await banco.db.insert(tabelaCasas).values({ nome: 'altenar', tipoApi: 'altenar' }).returning()
  const [bet] = await banco.db.insert(tabelaCasas).values({ nome: 'betmgm', tipoApi: 'betmgm' }).returning()
  await banco.db.insert(mapaMercados).values([
    { casaId: alt!.id, nomeMercadoNaCasa: 'Total de Pontos', atributo: 'PONTOS', confirmado: true },
    { casaId: bet!.id, nomeMercadoNaCasa: 'Player Points', atributo: 'PONTOS', confirmado: true },
  ])
}

describe('as duas casas cotando a mesma linha → a MÉDIA ENTRE CASAS, com o mínimo homologado', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDia(banco)
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('vincula pelo apelido, corta a revanche pelo dia, semeia o jogador, e agrega 2 casas em UMA linha', async () => {
    const r = await coletarOddsDoDia(banco.db, ruleset, DIA, AGORA, [ALTENAR, BETMGM], {
      transportes: { altenar: transporteAltenar, betmgm: transporteBetmgm },
    })

    expect(r.erros).toEqual([])
    expect(r.contagens).toMatchObject({
      odds_altenar_vinculados: 1,
      odds_altenar_cotacoes: 1,
      odds_altenar_aguardando_curadoria: 1, // rebotes sem mapa: visível, não descartado
      odds_altenar_jogadores_confirmados: 1,
      odds_betmgm_vinculados: 1,
      odds_betmgm_fora_do_dia: 1, // a revanche
      odds_betmgm_ambiguos: 0,
      odds_betmgm_cotacoes: 1,
      odds_agregadas: 1,
      odds_abaixo_do_minimo: 0,
    })
    expect(r.contagens).not.toHaveProperty('falhas_fontes')

    const [agregada] = await banco.db.select().from(oddsAgregada)
    expect(agregada).toMatchObject({ origem: 'CASAS', qtdCasas: 2, linha: '25.0' })
    // (1.85 + 1.90) / 2
    expect(agregada!.oddMedia).toBe('1.875')
  })
})

describe('uma fonte fora do ar', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDia(banco)
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('é REPORTADA (erro, contador e falhas_fontes → PARCIAL) e não derruba a boa — que agrega sozinha', async () => {
    const r = await coletarOddsDoDia(banco.db, ruleset, DIA, AGORA, [ALTENAR, BETMGM], {
      transportes: { altenar: transporteAltenar, betmgm: transporteQuebrado },
    })
    expect(r.erros).toEqual([{ fonte: 'betmgm', mensagem: expect.stringContaining('ECONNREFUSED') }])
    expect(r.contagens).toMatchObject({
      odds_altenar_cotacoes: 1,
      odds_betmgm_erro: 1,
      falhas_fontes: 1,
      // Desde 19/09 `casas_minimas` é 1: a casa que respondeu vira cotação, em
      // vez de o dia cair na tabela estática por causa da que caiu.
      odds_agregadas: 1,
      odds_abaixo_do_minimo: 0,
    })
    expect(await banco.db.select().from(oddsAgregada)).toHaveLength(1)
  })
})

describe('limites do cron', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('prazo vencido pula a fonte e conta — sem uma chamada HTTP sequer', async () => {
    const buscar = vi.fn<typeof fetch>()
    const r = await coletarOddsDoDia(banco.db, ruleset, DIA, AGORA, [ALTENAR], {
      transportes: { altenar: buscar },
      prazo: new Date('2026-08-28T11:00:00Z'),
      relogio: () => new Date('2026-08-28T11:00:01Z'),
    })
    expect(r.contagens.odds_altenar_prazo_esgotado).toBe(1)
    expect(buscar).not.toHaveBeenCalled()
  })

  it('gateway que nunca responde vira erro de TIMEOUT reportado, não cron travado', async () => {
    const pendurado: typeof fetch = (_e, init) =>
      new Promise((_r, rejeitar) => init?.signal?.addEventListener('abort', () => rejeitar(new Error('aborted'))))
    const r = await coletarOddsDoDia(banco.db, ruleset, DIA, AGORA, [ALTENAR], {
      transportes: { altenar: pendurado },
      timeoutMs: 20,
    })
    expect(r.erros[0]?.mensagem).toMatch(/timeout de 20ms/)
    expect(r.contagens.falhas_fontes).toBe(1)
  })

  it('sem fonte ativa não faz nada — e não é erro', async () => {
    const r = await coletarOddsDoDia(banco.db, ruleset, DIA, AGORA, [], {})
    expect(r.contagens).toEqual({})
    expect(r.erros).toEqual([])
  })
})
