import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, mapaJogadores } from '../../dominio/db/schema'
import { provedorDaCasa, vincularJogadorDaCasa, vinculoJogadorDaCasa } from '../odds/reconciliar'
import {
  CONFIRMADO_POR_SEMEADURA,
  semearVinculosDeJogador,
  vinculosConfirmados,
} from '../odds/vinculo-jogadores'

const AGORA = new Date('2026-08-28T12:00:00Z')
const CASA = 'betmgm'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await banco.db.insert(jogadores).values([
    { nomeCompleto: 'Stephen Curry' },
    { nomeCompleto: 'Jamal Murray' },
    // Dois "Murray" tornam "murray" sozinho AMBÍGUO de propósito.
    { nomeCompleto: 'Keegan Murray' },
  ])
}, 120_000)
afterAll(async () => banco.fechar())

describe('vínculo de jogador por nome de casa — sobre mapa_jogadores', () => {
  it('match exato normalizado e ÚNICO nasce confirmado, assinado pela semeadura', async () => {
    const r = await semearVinculosDeJogador(banco.db, CASA, ['Stephen  CURRY'], AGORA)
    expect(r).toEqual({ confirmados: 1, pendentes: 0 })

    const [linha] = await banco.db
      .select()
      .from(mapaJogadores)
      .where(eq(mapaJogadores.provedor, provedorDaCasa(CASA)))
    expect(linha).toMatchObject({
      nomeNaLista: 'Stephen  CURRY',
      confirmadoPor: CONFIRMADO_POR_SEMEADURA,
    })
    expect(linha!.confirmadoEm).not.toBeNull()
  })

  it('a leitura é por chave NORMALIZADA: a grafia de amanhã resolve pela confirmação de hoje', async () => {
    const mapa = await vinculosConfirmados(banco.db, CASA)
    expect(mapa.has('stephen curry')).toBe(true)
    expect(mapa.has('Stephen  CURRY')).toBe(false)
  })

  it('ambíguo ou desconhecido nasce PENDENTE — curadoria, nunca palpite', async () => {
    const r = await semearVinculosDeJogador(banco.db, CASA, ['Murray', 'Fulano Inexistente'], AGORA)
    expect(r).toEqual({ confirmados: 0, pendentes: 2 })
    const mapa = await vinculosConfirmados(banco.db, CASA)
    expect(mapa.has('murray')).toBe(false)
  })

  it('reexecutar reporta o BACKLOG real, não só o que este insert tocou', async () => {
    const r = await semearVinculosDeJogador(banco.db, CASA, ['Murray', 'Stephen Curry'], AGORA)
    expect(r).toEqual({ confirmados: 1, pendentes: 1 })
  })

  it('pendente é PROMOVIDO quando a ambiguidade some (o jogador entrou em jogadores)', async () => {
    await semearVinculosDeJogador(banco.db, CASA, ['Cooper Flagg'], AGORA)
    expect((await vinculosConfirmados(banco.db, CASA)).has('cooper flagg')).toBe(false)

    await banco.db.insert(jogadores).values({ nomeCompleto: 'Cooper Flagg' })
    const r = await semearVinculosDeJogador(banco.db, CASA, ['Cooper Flagg'], AGORA)
    expect(r.confirmados).toBe(1)
    expect((await vinculosConfirmados(banco.db, CASA)).has('cooper flagg')).toBe(true)
  })

  it('confirmação HUMANA do painel é o que a coleta lê — e a semeadura nunca a sobrescreve', async () => {
    const [keegan] = await banco.db
      .select({ id: jogadores.id })
      .from(jogadores)
      .where(eq(jogadores.nomeCompleto, 'Keegan Murray'))
    // O curador resolve o ambíguo pelo MESMO caminho do /admin/mercados.
    await vincularJogadorDaCasa(banco.db, {
      casaNome: CASA,
      nomeNaCasa: 'Murray',
      jogadorId: keegan!.id,
      score: 0.9,
      confirmadoPor: 'curador@iadanba.dev',
      agora: AGORA,
    })
    expect(await vinculoJogadorDaCasa(banco.db, CASA, 'Murray')).toBe(keegan!.id)

    await semearVinculosDeJogador(banco.db, CASA, ['Murray'], new Date('2026-08-29T12:00:00Z'))

    const mapa = await vinculosConfirmados(banco.db, CASA)
    expect(mapa.get('murray')).toBe(keegan!.id)
    const [linha] = await banco.db
      .select()
      .from(mapaJogadores)
      .where(and(eq(mapaJogadores.provedor, provedorDaCasa(CASA)), eq(mapaJogadores.nomeNaLista, 'Murray')))
    expect(linha!.confirmadoPor).toBe('curador@iadanba.dev')
  })

  it('outra casa é outro namespace — confirmar na BetMGM não confirma na Altenar', async () => {
    expect((await vinculosConfirmados(banco.db, 'altenar')).size).toBe(0)
  })
})
