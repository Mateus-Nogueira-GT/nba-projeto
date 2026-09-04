import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  casas as tabelaCasas,
  jogadores,
  jogos,
  mapaJogadoresCasa,
  mapaMercados,
  oddsAgregada,
  times,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { coletarOddsDoDia } from '../odds/coleta-do-dia'
import type { FonteOdds } from '../odds/fontes'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
// Uma casa só na fixture: o mínimo do ruleset é 2, e a regra é do CJ (regra 1).
const rulesetTeste = { ...ruleset, odds: { ...ruleset.odds, casas_minimas: 1 } }

const DIA = '2026-08-28'
const AGORA = new Date('2026-08-28T12:00:00Z')

const ALTENAR: FonteOdds = {
  nome: 'altenar',
  config: {
    gatewayBase: 'https://gw.altenar.example',
    origin: 'https://nosso.app',
    integration: 'nossa',
    sportId: '67',
    champId: null,
  },
}

const BETMGM: FonteOdds = {
  nome: 'betmgm',
  config: {
    baseUrl: 'https://afiliados.betmgm.example',
    apiKey: 'k',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    brand: 'marca',
    location: 'BR',
    lang: 'en',
  },
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** Roteia por URL: authenticate, lista do dia e detalhe do evento. */
const transporteAltenar: typeof fetch = async (entrada) => {
  const url = String(entrada)
  if (url.includes('/api/authenticate')) return json({ token: 'tok' })
  if (url.includes('/api/v1/events/')) {
    return json({
      id: 'ev1',
      markets: [
        {
          name: 'Total de Pontos - Stephen Curry',
          odds: [
            { price: 1.85, oddStatus: 0, name: 'Mais de 24.5' },
            { price: 1.95, oddStatus: 0, name: 'Menos de 24.5' },
          ],
        },
      ],
    })
  }
  return json({
    data: [{ eventId: 'ev1', name: 'Lakers vs Celtics', startDate: '2026-08-28T23:00:00Z' }],
  })
}

/** A BetMGM está fora do ar nesta noite. */
const transporteQuebrado: typeof fetch = async () => {
  throw new Error('ECONNREFUSED')
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Celtics' }).returning()
  await banco.db.insert(jogos).values({
    dataHoraUtc: new Date('2026-08-28T23:00:00Z'),
    dataReferencia: DIA,
    timeCasaId: lal!.id,
    timeVisitanteId: bos!.id,
  })
  await banco.db.insert(jogadores).values({ nomeCompleto: 'Stephen Curry' })
  // A curadoria de MERCADO já foi feita (passo 3 do runbook); a de JOGADOR
  // não — é a semeadura automática que precisa resolver o Curry sozinha.
  const [casa] = await banco.db
    .insert(tabelaCasas)
    .values({ nome: 'altenar', tipoApi: 'altenar' })
    .returning()
  await banco.db.insert(mapaMercados).values({
    casaId: casa!.id,
    nomeMercadoNaCasa: 'Total de Pontos - Stephen Curry',
    atributo: 'PONTOS',
    confirmado: true,
  })
}, 120_000)
afterAll(async () => banco.fechar())

describe('coleta do dia por fonte ativa', () => {
  it('vincula, semeia jogador, agrega — e a fonte quebrada não derruba a boa', async () => {
    const r = await coletarOddsDoDia(banco.db, rulesetTeste, DIA, AGORA, [ALTENAR, BETMGM], {
      altenar: transporteAltenar,
      betmgm: transporteQuebrado,
    })

    expect(r.contagens.odds_altenar_vinculados).toBe(1)
    expect(r.contagens.odds_altenar_cotacoes).toBe(1)
    expect(r.contagens.odds_altenar_agregadas).toBe(1)

    // O erro da outra fonte é REPORTADO, não engolido nem propagado.
    expect(r.erros).toEqual([{ fonte: 'betmgm', mensagem: expect.stringContaining('ECONNREFUSED') }])
    expect(r.contagens.odds_betmgm_erro).toBe(1)

    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas).toHaveLength(1)
    expect(agregadas[0]!.origem).toBe('CASAS')

    // A semeadura confirmou o Curry sozinha: nome único, sem ambiguidade.
    const vinculos = await banco.db.select().from(mapaJogadoresCasa)
    expect(vinculos.map((v) => [v.nomeNaCasa, v.confirmado])).toEqual([['Stephen Curry', true]])
  })

  it('sem fonte ativa não faz nada — e não é erro', async () => {
    const r = await coletarOddsDoDia(banco.db, rulesetTeste, DIA, AGORA, [], {})
    expect(r.contagens).toEqual({})
    expect(r.erros).toEqual([])
  })
})
