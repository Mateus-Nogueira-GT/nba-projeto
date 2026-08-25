import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { casas, jogadores, mapaJogadores, mapaMercados, times } from '../../dominio/db/schema'

import { CasaFake } from '../odds/fake'
import type { CotacaoExterna } from '../odds/porta'

describe('porta de casa de aposta (spec 06, fatia 3)', () => {
  it('o fake devolve as cotações da fixture, no contrato da porta', async () => {
    const casa = new CasaFake('casa-alfa')
    const cotacoes = await casa.cotacoes('jogo-externo-1')

    expect(cotacoes.length).toBeGreaterThan(0)
    for (const c of cotacoes) {
      expect(typeof c.jogadorNomeNaCasa).toBe('string')
      expect(typeof c.nomeMercadoNaCasa).toBe('string')
      expect(typeof c.linha).toBe('number')
      expect(c.oddOver === null || typeof c.oddOver === 'number').toBe(true)
      expect(c.oddUnder === null || typeof c.oddUnder === 'number').toBe(true)
    }
  })

  it('duas casas fake trazem grafias divergentes do mesmo jogador', async () => {
    const alfa = await new CasaFake('casa-alfa').cotacoes('jogo-externo-1')
    const beta = await new CasaFake('casa-beta').cotacoes('jogo-externo-1')

    const nomesAlfa = alfa.map((c) => c.jogadorNomeNaCasa)
    const nomesBeta = beta.map((c) => c.jogadorNomeNaCasa)
    // A matéria-prima da reconciliação (fatia 4): mesmo jogador, grafias diferentes.
    expect(nomesAlfa).toContain('L. Doncic')
    expect(nomesBeta).toContain('Luka Doncic')
  })

  it('nenhum campo além do contrato atravessa a porta', async () => {
    const cotacoes = await new CasaFake('casa-alfa').cotacoes('jogo-externo-1')
    const chaves: (keyof CotacaoExterna)[] = [
      'jogadorNomeNaCasa',
      'nomeMercadoNaCasa',
      'linha',
      'oddOver',
      'oddUnder',
    ]
    for (const c of cotacoes) {
      expect(Object.keys(c).sort()).toEqual([...chaves].sort())
    }
  })

  it('jogo sem cotação devolve lista vazia, não erro', async () => {
    expect(await new CasaFake('casa-alfa').cotacoes('jogo-inexistente')).toEqual([])
  })
})

describe('reconciliação de mercados e jogadores das casas (spec 06, fatia 4)', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let casaId: string
  let lukaId: string

  beforeAll(async () => {
    banco = await bancoDeTeste()
  })
  afterAll(async () => {
    await banco.fechar()
  })
  beforeEach(async () => {
    await banco.db.delete(mapaMercados)
    await banco.db.delete(mapaJogadores)
    await banco.db.delete(casas)
    await banco.db.delete(jogadores)
    await banco.db.delete(times)
    const [casa] = await banco.db.insert(casas).values({ nome: 'casa-alfa' }).returning()
    casaId = casa!.id
    const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
    const [luka] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Luka Doncic', timeId: lal!.id })
      .returning()
    lukaId = luka!.id
  })

  it('mercado desconhecido entra na fila de curadoria, nunca em vínculo automático', async () => {
    const { mercadosPendentes } = await import('../odds/reconciliar')
    const pendentes = await mercadosPendentes(banco.db, casaId, ['Player Points', 'Player Assists'])
    expect(pendentes.sort()).toEqual(['Player Assists', 'Player Points'])
  })

  it('mercado confirmado sai da fila e é reutilizado', async () => {
    const { confirmarMercado, mercadosPendentes } = await import('../odds/reconciliar')
    await confirmarMercado(banco.db, { casaId, nomeMercadoNaCasa: 'Player Points', atributo: 'PONTOS' })
    const pendentes = await mercadosPendentes(banco.db, casaId, ['Player Points', 'Player Assists'])
    expect(pendentes).toEqual(['Player Assists'])
    // Reconfirmar é idempotente
    await confirmarMercado(banco.db, { casaId, nomeMercadoNaCasa: 'Player Points', atributo: 'PONTOS' })
    const linhas = await banco.db.select().from(mapaMercados)
    expect(linhas).toHaveLength(1)
  })

  it('nome exato ainda é SUGESTÃO — nunca vínculo automático', async () => {
    const { sugerirJogadoresDaCasa } = await import('../odds/reconciliar')
    const sugestoes = sugerirJogadoresDaCasa(
      ['Luka Doncic'],
      [{ id: lukaId, nomeCompleto: 'Luka Doncic', timeSigla: 'LAL' }],
    )
    expect(sugestoes[0]!.candidatos[0]).toMatchObject({ idExterno: lukaId, score: 1 })
    // A saída é uma lista de candidatos para um humano confirmar; nada gravado.
    expect(await banco.db.select().from(mapaJogadores)).toEqual([])
  })

  it('vínculo confirmado grava no namespace da casa e é reencontrado', async () => {
    const { vincularJogadorDaCasa, vinculoJogadorDaCasa } = await import('../odds/reconciliar')
    await vincularJogadorDaCasa(banco.db, {
      casaNome: 'casa-alfa',
      nomeNaCasa: 'L. Doncic',
      jogadorId: lukaId,
      score: 0.62,
      confirmadoPor: 'admin@teste',
      agora: new Date('2026-08-22T12:00:00Z'),
    })
    expect(await vinculoJogadorDaCasa(banco.db, 'casa-alfa', 'L. Doncic')).toBe(lukaId)
    const [linha] = await banco.db.select().from(mapaJogadores)
    expect(linha).toMatchObject({ provedor: 'casa:casa-alfa', confirmadoPor: 'admin@teste' })
    // Casa diferente, mesma grafia: vínculo separado
    expect(await vinculoJogadorDaCasa(banco.db, 'casa-beta', 'L. Doncic')).toBeNull()
  })
})

describe('guarda da tela de curadoria de mercados', () => {
  it('página e ações exigem admin', () => {
    const pagina = readFileSync('src/app/(admin)/admin/mercados/page.tsx', 'utf8')
    expect(pagina).toContain('negarSeNaoForAdmin')
    const acoes = readFileSync('src/app/(admin)/admin/mercados/acoes.ts', 'utf8')
    expect(acoes).toContain('exigirAdmin')
  })
})
