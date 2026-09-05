import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { identidadesJogo, jogadores, jogos, mapaJogadores, oddsAgregada, times } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { coletarOdds } from '../odds/coletar'
import type { CasaDeAposta } from '../odds/porta'
import { provedorDaCasa } from '../odds/reconciliar'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Celtics' }).returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({ dataHoraUtc: new Date('2026-08-28T23:00:00Z'), dataReferencia: '2026-08-28', timeCasaId: lal!.id, timeVisitanteId: bos!.id })
    .returning()
  await banco.db.insert(identidadesJogo).values({ jogoId: jogo!.id, provedor: 'altenar', idExterno: 'ev1' })
  // Só o Curry existe como jogador canônico; 'Fulano' não — e nenhum dos dois
  // tem vínculo prévio: é a coleta que precisa semear a partir das cotações.
  await banco.db.insert(jogadores).values({ nomeCompleto: 'Stephen Curry' })
}, 120_000)
afterAll(async () => banco.fechar())

describe('coleta com resolução por NOME (casas sem id de provedor)', () => {
  it('semeia os nomes que a casa cotou; único confirma e agrega; desconhecido fica pendente e conta', async () => {
    const casaFake: CasaDeAposta = {
      nome: 'altenar',
      async cotacoes() {
        return [
          { jogadorNomeNaCasa: 'Stephen Curry', nomeMercadoNaCasa: 'Total de Pontos', linha: 25, oddOver: 1.85, oddUnder: 1.95, atributo: 'PONTOS' },
          { jogadorNomeNaCasa: 'Fulano', nomeMercadoNaCasa: 'Total de Pontos', linha: 10, oddOver: 1.5, oddUnder: null, atributo: 'PONTOS' },
        ]
      },
    }
    // Uma casa só na fixture: o mínimo do ruleset é 2, e a regra é do CJ (regra 1).
    const rulesetTeste = { ...ruleset, odds: { ...ruleset.odds, casas_minimas: 1 } }
    const r = await coletarOdds(banco.db, async () => [casaFake], 'altenar', '2026-08-28', new Date('2026-08-28T12:00:00Z'), rulesetTeste)

    expect(r).toMatchObject({ cotacoes: 1, semVinculo: 1, agregadas: 1, jogadoresConfirmados: 1, jogadoresPendentes: 1 })

    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas).toHaveLength(1)
    expect(agregadas[0]!.origem).toBe('CASAS')

    // O que a coleta semeou está onde o painel /admin/mercados lê.
    const vinculos = await banco.db.select().from(mapaJogadores).where(eq(mapaJogadores.provedor, provedorDaCasa('altenar')))
    expect(vinculos.map((v) => [v.nomeNaLista, v.confirmadoEm !== null]).sort()).toEqual([
      ['Fulano', false],
      ['Stephen Curry', true],
    ])
  })
})
