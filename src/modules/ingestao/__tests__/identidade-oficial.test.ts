import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, mapaJogadores, niveis } from '../../dominio/db/schema'
import { semearCadastro } from '../demo/cadastro'
import { aplicarFotos, urlDaFoto } from '../demo/fotos'

const AGORA = new Date('2026-01-15T18:00:00Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let cadastro: Awaited<ReturnType<typeof semearCadastro>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  cadastro = await semearCadastro(banco.db, AGORA)
})
afterAll(async () => banco.fechar())

describe('identidade oficial preserva o cadastro editorial', () => {
  it('o cadastro apresenta o nome oficial curado, preservando a chave da lista', async () => {
    const id = cadastro.jogadorPorChave.get('brunson')!
    const [jogador] = await banco.db.select().from(jogadores).where(eq(jogadores.id, id))
    expect(jogador?.nomeCompleto).toBe('Jalen Brunson')
  })

  it('renomear, aplicar fotos e reexecutar seed mantém UUID, vínculo e níveis', async () => {
    const id = cadastro.jogadorPorChave.get('brunson')!
    const antes = await banco.db.select().from(jogadores)
    const niveisAntes = await banco.db.select().from(niveis).where(eq(niveis.jogadorId, id))
    await banco.db
      .update(jogadores)
      .set({ nomeCompleto: 'Brunson nome alterado pelo provedor' })
      .where(eq(jogadores.id, id))

    const fotos = await aplicarFotos(banco.db, async () => true)
    expect.soft(fotos.puladas).not.toContain('Brunson')
    const [comFoto] = await banco.db.select().from(jogadores).where(eq(jogadores.id, id))
    expect.soft(comFoto?.fotoUrl).toBe(urlDaFoto(1628973))

    const novamente = await semearCadastro(banco.db, AGORA)
    expect.soft(novamente.jogadorPorChave.get('brunson')).toBe(id)
    expect.soft(await banco.db.select().from(jogadores)).toHaveLength(antes.length)
    const vinculos = await banco.db
      .select()
      .from(mapaJogadores)
      .where(eq(mapaJogadores.nomeNaLista, 'Brunson'))
    expect.soft(vinculos.map((v) => v.jogadorId)).toEqual([id])
    expect(await banco.db.select().from(niveis).where(eq(niveis.jogadorId, id))).toEqual(
      niveisAntes,
    )
    const [depois] = await banco.db.select().from(jogadores).where(eq(jogadores.id, id))
    expect(depois?.nomeCompleto).toBe('Brunson nome alterado pelo provedor')
    expect(depois?.timeId).toBe(antes.find((j) => j.id === id)?.timeId)
  })

  it('Wiggins continua pendente sem divisão ou atribuição de foto por palpite', async () => {
    const id = cadastro.jogadorPorChave.get('wiggins')!
    const [jogador] = await banco.db.select().from(jogadores).where(eq(jogadores.id, id))
    expect(jogador).toMatchObject({ nomeCompleto: 'Wiggins', fotoUrl: null })
    expect((await aplicarFotos(banco.db, async () => true)).semId).toContain('Wiggins')
  })
})
