import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  casas as tabelaCasas,
  identidadesJogo,
  jogadores,
  jogos,
  mapaJogadoresCasa,
  oddsAgregada,
  times,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { coletarOdds } from '../odds/coletar'
import type { CasaDeAposta } from '../odds/porta'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Celtics' }).returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-08-28T23:00:00Z'),
      dataReferencia: '2026-08-28',
      timeCasaId: lal!.id,
      timeVisitanteId: bos!.id,
    })
    .returning()
  await banco.db
    .insert(identidadesJogo)
    .values({ jogoId: jogo!.id, provedor: 'altenar', idExterno: 'ev1' })
  const [curry] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Stephen Curry' })
    .returning()
  const [casa] = await banco.db
    .insert(tabelaCasas)
    .values({ nome: 'altenar', tipoApi: 'altenar' })
    .returning()
  await banco.db.insert(mapaJogadoresCasa).values([
    { casaId: casa!.id, nomeNaCasa: 'Stephen Curry', jogadorId: curry!.id, confirmado: true },
    // Pendente de curadoria: existe no mapa, mas NÃO resolve cotação.
    { casaId: casa!.id, nomeNaCasa: 'Fulano', jogadorId: null, confirmado: false },
  ])
}, 120_000)
afterAll(async () => banco.fechar())

describe('coleta com resolução por NOME (casas sem id de provedor)', () => {
  it('confirmado agrega; pendente conta como semVinculo; nada silencioso', async () => {
    const casaFake: CasaDeAposta = {
      nome: 'altenar',
      async cotacoes() {
        return [
          {
            jogadorNomeNaCasa: 'Stephen Curry',
            nomeMercadoNaCasa: 'Total de Pontos',
            linha: 25,
            oddOver: 1.85,
            oddUnder: 1.95,
            atributo: 'PONTOS',
          },
          {
            jogadorNomeNaCasa: 'Fulano',
            nomeMercadoNaCasa: 'Total de Pontos',
            linha: 10,
            oddOver: 1.5,
            oddUnder: null,
            atributo: 'PONTOS',
          },
        ]
      },
    }
    const rulesetTeste = { ...ruleset, odds: { ...ruleset.odds, casas_minimas: 1 } }
    const r = await coletarOdds(
      banco.db,
      async () => [casaFake],
      'altenar',
      '2026-08-28',
      new Date('2026-08-28T12:00:00Z'),
      rulesetTeste,
    )
    expect(r.cotacoes).toBe(1)
    expect(r.semVinculo).toBe(1)
    expect(r.agregadas).toBe(1)
    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas).toHaveLength(1)
    expect(agregadas[0]!.origem).toBe('CASAS')
  })
})
