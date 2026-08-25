import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, usuarios } from '../../dominio/db/schema'
import {
  exibirJogador,
  filtrarOcultos,
  jogadoresOcultosDe,
  ocultarJogador,
} from '../jogadores-ocultos'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let jogadorA: string
let jogadorB: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'ocultos@teste.com', senhaHash: 'x' })
    .returning()
  usuarioId = u!.id
  const [a] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Jogador A' }).returning()
  const [b] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Jogador B' }).returning()
  jogadorA = a!.id
  jogadorB = b!.id
})
afterAll(async () => {
  await banco.fechar()
})

describe('jogadores ocultos (Fire Live)', () => {
  it('ocultar é idempotente, exibir desfaz', async () => {
    await ocultarJogador(banco.db, usuarioId, jogadorA)
    await ocultarJogador(banco.db, usuarioId, jogadorA) // repetir não explode
    expect(await jogadoresOcultosDe(banco.db, usuarioId)).toEqual(new Set([jogadorA]))

    await exibirJogador(banco.db, usuarioId, jogadorA)
    expect(await jogadoresOcultosDe(banco.db, usuarioId)).toEqual(new Set())
  })

  it('a preferência é POR CONTA — outro usuário não é afetado', async () => {
    const [outro] = await banco.db
      .insert(usuarios)
      .values({ email: 'outro@teste.com', senhaHash: 'x' })
      .returning()
    await ocultarJogador(banco.db, usuarioId, jogadorB)
    expect(await jogadoresOcultosDe(banco.db, outro!.id)).toEqual(new Set())
    await exibirJogador(banco.db, usuarioId, jogadorB)
  })

  it('filtrarOcultos é um recorte de leitura PURO', () => {
    const itens = [{ jogadorId: 'a' }, { jogadorId: 'b' }, { jogadorId: 'c' }]
    expect(filtrarOcultos(itens, new Set(['b']))).toEqual([
      { jogadorId: 'a' },
      { jogadorId: 'c' },
    ])
    // conjunto vazio devolve tudo, sem clonar surpresas
    expect(filtrarOcultos(itens, new Set())).toEqual(itens)
  })
})
