import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { preferenciasUsuario, usuarios } from '../../dominio/db/schema'
import {
  PREFERENCIAS_PADRAO,
  gravarPreferencias,
  preferenciasDoUsuario,
} from '../preferencias'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioA: string
let usuarioB: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [a] = await banco.db
    .insert(usuarios)
    .values({ email: 'a@teste.com', senhaHash: 'x' })
    .returning({ id: usuarios.id })
  const [b] = await banco.db
    .insert(usuarios)
    .values({ email: 'b@teste.com', senhaHash: 'x' })
    .returning({ id: usuarios.id })
  usuarioA = a!.id
  usuarioB = b!.id
}, 60_000)
afterAll(async () => banco.fechar())

/**
 * Preferências ESCALARES por conta (identidade 04): a ordem da Lista Secreta
 * (por jogo ou por nível) e a lente da zona 2 do card. Mesmo espírito de
 * `jogadores_ocultos` — recorte de leitura, o feed não sabe que existe — mas
 * uma linha por usuário em vez de uma por item.
 */
describe('preferências por conta', () => {
  it('sem linha gravada, devolve o padrão — por jogo e últimos 5', async () => {
    expect(await preferenciasDoUsuario(banco.db, usuarioA)).toEqual(PREFERENCIAS_PADRAO)
    expect(PREFERENCIAS_PADRAO).toEqual({ ordemLista: 'POR_JOGO', lente: 'ULT5' })
  })

  it('gravar uma parte mantém a outra no padrão', async () => {
    await gravarPreferencias(banco.db, usuarioA, { ordemLista: 'POR_NIVEL' })
    expect(await preferenciasDoUsuario(banco.db, usuarioA)).toEqual({
      ordemLista: 'POR_NIVEL',
      lente: 'ULT5',
    })

    await gravarPreferencias(banco.db, usuarioA, { lente: 'ODDS' })
    expect(await preferenciasDoUsuario(banco.db, usuarioA)).toEqual({
      ordemLista: 'POR_NIVEL',
      lente: 'ODDS',
    })
  })

  it('é POR CONTA — outro usuário não é afetado', async () => {
    expect(await preferenciasDoUsuario(banco.db, usuarioB)).toEqual(PREFERENCIAS_PADRAO)
  })

  it('uma linha por usuário: gravar de novo não duplica', async () => {
    await gravarPreferencias(banco.db, usuarioA, { lente: 'MEDIA_LINHA' })
    await gravarPreferencias(banco.db, usuarioA, { lente: 'HIERARQUIA' })
    const linhas = await banco.db
      .select()
      .from(preferenciasUsuario)
      .where(eq(preferenciasUsuario.usuarioId, usuarioA))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.lente).toBe('HIERARQUIA')
  })

  it('apagar o usuário apaga a preferência (cascade)', async () => {
    await banco.db.delete(usuarios).where(eq(usuarios.id, usuarioA))
    const linhas = await banco.db
      .select()
      .from(preferenciasUsuario)
      .where(eq(preferenciasUsuario.usuarioId, usuarioA))
    expect(linhas).toHaveLength(0)
  })
})
