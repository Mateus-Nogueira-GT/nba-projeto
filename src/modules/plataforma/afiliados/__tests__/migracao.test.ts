import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  acordosAfiliados,
  campanhasAfiliados,
  casas,
  linksAfiliados,
  ofertasAfiliados,
  parceirosAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

describe('schema comercial de afiliados', () => {
  it('sobe e desce junto com todas as migrations', async () => {
    expect(await banco.contarTabelas()).toBe(68)
    await banco.descer()
    expect(await banco.contarTabelas()).toBe(0)
    await banco.subir()
    expect(await banco.contarTabelas()).toBe(68)
  })

  it('protege percentuais, códigos e vínculos comerciais no banco', async () => {
    const [usuario] = await banco.db
      .insert(usuarios)
      .values({ email: 'afiliado-schema@teste.com', senhaHash: 'x' })
      .returning()
    const [casa] = await banco.db
      .insert(casas)
      .values({ nome: `Casa schema ${Math.random()}` })
      .returning()
    const [parceiro] = await banco.db
      .insert(parceirosAfiliados)
      .values({ usuarioId: usuario!.id, codigo: 'parceiro-schema', nomePublico: 'Parceiro' })
      .returning()
    const [oferta] = await banco.db
      .insert(ofertasAfiliados)
      .values({
        casaId: casa!.id,
        nome: 'Oferta schema',
        modalidade: 'HIBRIDO',
        moeda: 'BRL',
        urlDestino: 'https://casa.test/nba',
        hostDestino: 'casa.test',
      })
      .returning()

    await expect(
      banco.db.insert(acordosAfiliados).values({
        parceiroId: parceiro!.id,
        ofertaId: oferta!.id,
        percentualPontosBase: 10_001,
        inicio: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow()

    const [campanha] = await banco.db
      .insert(campanhasAfiliados)
      .values({ parceiroId: parceiro!.id, ofertaId: oferta!.id, nome: 'Campanha', canal: 'SOCIAL' })
      .returning()
    await banco.db.insert(linksAfiliados).values({
      campanhaId: campanha!.id,
      codigo: 'codigo-schema',
      tipoDestino: 'CASA',
    })
    await expect(
      banco.db.insert(linksAfiliados).values({
        campanhaId: campanha!.id,
        codigo: 'codigo-schema',
        tipoDestino: 'NIP',
        caminhoNip: '/oferta/codigo-schema',
      }),
    ).rejects.toThrow()
  })
})
