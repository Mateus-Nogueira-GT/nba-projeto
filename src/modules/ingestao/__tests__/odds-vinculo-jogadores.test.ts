import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { casas, jogadores, mapaJogadoresCasa } from '../../dominio/db/schema'
import { semearVinculosDeJogador, vinculosConfirmados } from '../odds/vinculo-jogadores'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let casaId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa] = await banco.db.insert(casas).values({ nome: 'betmgm', tipoApi: 'betmgm' }).returning()
  casaId = casa!.id
  await banco.db.insert(jogadores).values([
    { nomeCompleto: 'Stephen Curry' },
    { nomeCompleto: 'Jamal Murray' },
    // Dois "Murray" tornam "murray" sozinho AMBÍGUO de propósito.
    { nomeCompleto: 'Keegan Murray' },
  ])
}, 120_000)
afterAll(async () => banco.fechar())

describe('vínculo de jogador por nome de casa', () => {
  it('match exato normalizado e ÚNICO nasce confirmado', async () => {
    const r = await semearVinculosDeJogador(banco.db, casaId, ['Stephen  CURRY'])
    expect(r.confirmados).toBe(1)
    const mapa = await vinculosConfirmados(banco.db, casaId)
    expect([...mapa.keys()]).toContain('Stephen  CURRY')
  })

  it('ambíguo ou desconhecido nasce PENDENTE — curadoria, nunca palpite', async () => {
    const r = await semearVinculosDeJogador(banco.db, casaId, ['Murray', 'Fulano Inexistente'])
    expect(r.confirmados).toBe(0)
    expect(r.pendentes).toBe(2)
    const linhas = await banco.db.select().from(mapaJogadoresCasa)
    const pendentes = linhas.filter((l) => !l.confirmado)
    expect(pendentes.length).toBeGreaterThanOrEqual(2)
    // Pendente NÃO aparece no mapa de resolução.
    const mapa = await vinculosConfirmados(banco.db, casaId)
    expect(mapa.has('Murray')).toBe(false)
  })

  it('reexecutar não duplica nem rebaixa confirmação humana', async () => {
    await semearVinculosDeJogador(banco.db, casaId, ['Stephen  CURRY'])
    const linhas = await banco.db.select().from(mapaJogadoresCasa)
    const curry = linhas.filter((l) => l.nomeNaCasa === 'Stephen  CURRY')
    expect(curry).toHaveLength(1)
    expect(curry[0]!.confirmado).toBe(true)
  })

  it('reexecutar sobre nome pendente já promovido pela curadoria não o rebaixa', async () => {
    const [jogador] = await banco.db.select().from(jogadores).limit(1)
    // A curadoria humana resolveu o ambíguo à mão.
    await banco.db
      .update(mapaJogadoresCasa)
      .set({ jogadorId: jogador!.id, confirmado: true })
      .where(eq(mapaJogadoresCasa.nomeNaCasa, 'Murray'))

    await semearVinculosDeJogador(banco.db, casaId, ['Murray'])

    const mapa = await vinculosConfirmados(banco.db, casaId)
    expect(mapa.get('Murray')).toBe(jogador!.id)
  })
})
