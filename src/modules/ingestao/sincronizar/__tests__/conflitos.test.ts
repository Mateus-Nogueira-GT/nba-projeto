import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  conflitosIdentidadeJogador,
  identidadesJogador,
  jogadores,
} from '../../../dominio/db/schema'
import {
  listarConflitosPendentes,
  separarConflito,
  vincularConflito,
} from '../conflitos'
import { garantirJogadores, mapaDeJogadores } from '../identidade'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

const base = {
  timeId: null,
  posicao: null,
  alturaCm: null,
  numeroCamisa: null,
  fotoUrl: null,
  ativo: true,
}

describe('curadoria de conflito de identidade', () => {
  it('id duplicado da mesma pessoa: vincular liga ao jogador existente', async () => {
    // Formato real de 06/10/2026: Micah Potter com dois ids na BallDontLie.
    await garantirJogadores(banco.db, 'balldontlie', [
      { ...base, idExterno: '17553941', nomeCompleto: 'Micah Potter' },
    ])
    await garantirJogadores(banco.db, 'balldontlie', [
      { ...base, idExterno: '19465584', nomeCompleto: 'Micah Potter' },
    ])

    const [pendente] = await listarConflitosPendentes(banco.db)
    expect(pendente).toMatchObject({
      idExterno: '19465584',
      candidato: { nome: 'Micah Potter', idsExternos: ['17553941'] },
    })

    const jogadorId = await vincularConflito(banco.db, 'balldontlie', '19465584', 'parceiro')

    const mapa = await mapaDeJogadores(banco.db, 'balldontlie')
    expect(mapa.get('19465584')).toBe(jogadorId)
    expect(mapa.get('17553941')).toBe(jogadorId)
    expect(await listarConflitosPendentes(banco.db)).toEqual([])
    const [resolvido] = await banco.db
      .select()
      .from(conflitosIdentidadeJogador)
      .where(eq(conflitosIdentidadeJogador.idExterno, '19465584'))
    expect(resolvido).toMatchObject({ estado: 'RESOLVIDO', resolvidoPor: 'parceiro' })
  })

  it('homônimo de verdade: separar cria um jogador próprio', async () => {
    await garantirJogadores(banco.db, 'balldontlie', [
      { ...base, idExterno: '1', nomeCompleto: 'Nome Igual' },
    ])
    await garantirJogadores(banco.db, 'balldontlie', [
      { ...base, idExterno: '2', nomeCompleto: 'Nome Igual' },
    ])

    const novo = await separarConflito(banco.db, 'balldontlie', '2', 'parceiro')

    const mapa = await mapaDeJogadores(banco.db, 'balldontlie')
    expect(mapa.get('2')).toBe(novo)
    expect(mapa.get('1')).not.toBe(novo)
    const iguais = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.nomeCompleto, 'Nome Igual'))
    expect(iguais).toHaveLength(2)
  })

  it('não resolve o que não está pendente', async () => {
    await expect(vincularConflito(banco.db, 'balldontlie', '999', 'x')).rejects.toThrow(
      /nenhum conflito PENDENTE/,
    )
    const identidades = await banco.db
      .select()
      .from(identidadesJogador)
      .where(eq(identidadesJogador.idExterno, '999'))
    expect(identidades).toHaveLength(0)
  })
})
