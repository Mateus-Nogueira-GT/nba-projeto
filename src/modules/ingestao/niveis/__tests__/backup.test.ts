import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import * as schema from '../../../dominio/db/schema'
import type { Db } from '../../../dominio/db/tipos'
import { versaoAtiva } from '../../../dominio/repositorios/niveis'
import { exportarListaDoCj, restaurarListaDoCj, type BackupListaCj } from '../backup'
import { confirmarMapeamento } from '../importar'

type Banco = Awaited<ReturnType<typeof bancoDeTeste>>

async function contarNiveisDaVersaoAtiva(db: Db): Promise<number> {
  const ativa = await versaoAtiva(db)
  if (!ativa) return 0
  const linhas = await db
    .select()
    .from(schema.niveis)
    .where(eq(schema.niveis.niveisVersaoId, ativa.id))
  return linhas.length
}

async function idsNaVersaoAtiva(db: Db): Promise<string[]> {
  const ativa = await versaoAtiva(db)
  const linhas = await db
    .select()
    .from(schema.niveis)
    .where(eq(schema.niveis.niveisVersaoId, ativa!.id))
  return linhas.map((l) => l.jogadorId).sort()
}

/** O que a ação de /admin/mapeamento faz ao clicar "Confirmar". */
function confirmar(db: Db, nomeNaLista: string, jogadorId: string) {
  return confirmarMapeamento(db, {
    nomeNaLista,
    provedor: 'balldontlie',
    jogadorId,
    provedorPlayerId: `bdl-${jogadorId}`,
    score: 1,
    confirmadoPor: 'parceiro@exemplo.com',
    agora: new Date(),
  })
}

/**
 * Semeia o cenário da demo: dois times, três jogadores "de demonstração", uma
 * versão ativa e uma inativa da lista do CJ e o mapa de nomes confirmado.
 */
async function semearDemo(db: Db) {
  const [mia, dal] = await db
    .insert(schema.times)
    .values([
      { sigla: 'MIA', nome: 'Miami' },
      { sigla: 'DAL', nome: 'Dallas' },
    ])
    .returning()
  const [giannis, luka, fulano] = await db
    .insert(schema.jogadores)
    .values([
      { nomeCompleto: 'Giannis Antetokounmpo', timeId: mia!.id },
      { nomeCompleto: 'Luka Dončić', timeId: dal!.id },
      { nomeCompleto: 'Fulano', timeId: dal!.id },
    ])
    .returning()

  await db.insert(schema.mapaJogadores).values([
    {
      nomeNaLista: 'Giannis',
      provedor: 'demo',
      jogadorId: giannis!.id,
      confirmadoPor: 'cj',
      confirmadoEm: new Date('2026-08-18T12:00:00Z'),
    },
    { nomeNaLista: 'Doncic', provedor: 'demo', jogadorId: luka!.id },
  ])

  const [antiga, atual] = await db
    .insert(schema.niveisVersao)
    .values([
      { versao: 'niveis-antiga', origemArquivo: 'lista-v1.txt', importadoPor: 'cj', ativa: false },
      { versao: 'niveis-atual', origemArquivo: 'lista-v2.txt', importadoPor: 'cj', ativa: true },
    ])
    .returning()

  const linhas = (versaoId: string) => [
    {
      niveisVersaoId: versaoId,
      jogadorId: giannis!.id,
      timeId: mia!.id,
      atributo: 'PONTOS' as const,
      nivel: 'MVP' as const,
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: versaoId,
      jogadorId: luka!.id,
      timeId: dal!.id,
      atributo: 'PONTOS' as const,
      nivel: 'MVP' as const,
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: versaoId,
      jogadorId: fulano!.id,
      timeId: dal!.id,
      atributo: 'PONTOS' as const,
      nivel: 'RANDOLA' as const,
      posicaoHierarquia: 2,
    },
  ]
  await db.insert(schema.niveis).values([...linhas(antiga!.id), ...linhas(atual!.id)])
}

/** O que a limpeza da demo faz com a lista do CJ hoje: apaga tudo. */
async function limparComoADemo(db: Db) {
  await db.delete(schema.niveis)
  await db.delete(schema.niveisVersao)
  await db.delete(schema.mapaJogadores)
  await db.delete(schema.jogadores)
}

/** Jogadores "reais" do provedor: grafia sem acento e um homônimo. */
async function semearReais(db: Db) {
  const times = await db.select().from(schema.times)
  const dal = times.find((t) => t.sigla === 'DAL')!
  const mil = times.find((t) => t.sigla === 'MIA')!
  return db
    .insert(schema.jogadores)
    .values([
      { nomeCompleto: 'Giannis Antetokounmpo', timeId: mil.id },
      { nomeCompleto: 'Luka Doncic', timeId: dal.id },
      { nomeCompleto: 'Fulano', timeId: dal.id },
      { nomeCompleto: 'Fulano', timeId: mil.id },
    ])
    .returning()
}

describe('backup e restauração da lista do CJ', () => {
  let banco: Banco
  let db: Db

  beforeEach(async () => {
    banco = await bancoDeTeste()
    db = banco.db as unknown as Db
  })
  afterEach(async () => {
    await banco.fechar()
  })

  it('exporta as duas versões com nome, nome na lista, time e nível', async () => {
    await semearDemo(db)
    const backup = await exportarListaDoCj(db)

    expect(backup.versoes.map((v) => [v.versao, v.ativa])).toEqual([
      ['niveis-antiga', false],
      ['niveis-atual', true],
    ])
    const atual = backup.versoes.find((v) => v.ativa)!
    expect(atual.origemArquivo).toBe('lista-v2.txt')
    expect(atual.niveis).toHaveLength(3)
    expect(atual.niveis.find((n) => n.nome === 'Giannis Antetokounmpo')).toEqual({
      nome: 'Giannis Antetokounmpo',
      nomeNaLista: 'Giannis',
      timeSigla: 'MIA',
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    })
    // Sem linha no mapa: o nome canônico é a única pista.
    expect(atual.niveis.find((n) => n.nome === 'Fulano')!.nomeNaLista).toBeNull()
    // O JSON precisa atravessar o disco sem perder nada.
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup)
  })

  it('primeira restauração não liga ninguém por nome: sugere, e o parceiro confirma', async () => {
    await semearDemo(db)
    const backup: BackupListaCj = JSON.parse(JSON.stringify(await exportarListaDoCj(db)))
    await limparComoADemo(db)
    const reais = await semearReais(db)

    const r = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })

    expect(r.versoes).toBe(2)
    expect(r.ligados).toBe(0)
    expect(r.pendentes).toEqual(['Doncic', 'Fulano', 'Giannis'])
    // Um candidato exato cada: sugestão. Fulano tem dois: nenhuma.
    expect(r.sugeridos).toEqual(['Doncic', 'Giannis'])
    expect(await contarNiveisDaVersaoAtiva(db)).toBe(0)
    const ativa = await versaoAtiva(db)
    expect(ativa!.versao).toBe(backup.versoes.find((v) => v.ativa)!.versao)
    expect((await db.select().from(schema.niveisVersao)).filter((v) => v.ativa)).toHaveLength(1)

    // Tudo pendente com jogador NULL — é o filtro de /admin/mapeamento.
    const mapa = await db.select().from(schema.mapaJogadores)
    expect(mapa).toHaveLength(3)
    expect(mapa.every((m) => m.jogadorId === null && m.confirmadoEm === null)).toBe(true)
    expect(mapa.every((m) => m.provedor === 'balldontlie')).toBe(true)

    // O parceiro confirma pela MESMA função da ação da tela.
    await confirmar(
      db,
      'Giannis',
      reais.find((j) => j.nomeCompleto === 'Giannis Antetokounmpo')!.id,
    )
    await confirmar(db, 'Doncic', reais.find((j) => j.nomeCompleto === 'Luka Doncic')!.id)

    const r2 = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    expect(r2.pendentes).toEqual(['Fulano'])
    expect(r2.sugeridos).toEqual([])
    expect(r2.ligados).toBe(4) // 2 por versão
    expect(await contarNiveisDaVersaoAtiva(db)).toBe(2)

    // Terceira rodada não duplica nada.
    const r3 = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    expect(r3.ligados).toBe(4)
    expect(await contarNiveisDaVersaoAtiva(db)).toBe(2)
    expect(await db.select().from(schema.niveisVersao)).toHaveLength(2)
    expect(await db.select().from(schema.mapaJogadores)).toHaveLength(3)
  })

  it('o parceiro confirma o Fulano e a restauração completa', async () => {
    await semearDemo(db)
    const backup = await exportarListaDoCj(db)
    await limparComoADemo(db)
    const reais = await semearReais(db)
    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })

    const fulanoDeDallas = reais.find((j) => j.nomeCompleto === 'Fulano')!
    await confirmar(
      db,
      'Giannis',
      reais.find((j) => j.nomeCompleto === 'Giannis Antetokounmpo')!.id,
    )
    await confirmar(db, 'Doncic', reais.find((j) => j.nomeCompleto === 'Luka Doncic')!.id)
    await confirmar(db, 'Fulano', fulanoDeDallas.id)

    const r = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    expect(r.pendentes).toEqual([])
    expect(await contarNiveisDaVersaoAtiva(db)).toBe(3)
    const fulano = (await db.select().from(schema.niveis)).filter(
      (n) => n.jogadorId === fulanoDeDallas.id,
    )
    expect(fulano).toHaveLength(2) // uma linha em cada versão
  })

  it('reconfirmar um nome para outro jogador troca o vínculo na rodada seguinte', async () => {
    await semearDemo(db)
    const backup = await exportarListaDoCj(db)
    await limparComoADemo(db)
    const reais = await semearReais(db)
    const giannis = reais.find((j) => j.nomeCompleto === 'Giannis Antetokounmpo')!
    const lukaErrado = reais.find((j) => j.nomeCompleto === 'Fulano')!
    const lukaCerto = reais.find((j) => j.nomeCompleto === 'Luka Doncic')!

    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    await confirmar(db, 'Giannis', giannis.id)
    await confirmar(db, 'Doncic', lukaErrado.id)
    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    expect(await idsNaVersaoAtiva(db)).toEqual([giannis.id, lukaErrado.id].sort())

    await confirmar(db, 'Doncic', lukaCerto.id)
    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    const ids = await idsNaVersaoAtiva(db)
    expect(ids).toEqual([giannis.id, lukaCerto.id].sort())
    expect(ids).not.toContain(lukaErrado.id)
  })

  it('dois nomes confirmados para o MESMO jogador: nenhum entra, os dois ficam pendentes', async () => {
    await semearDemo(db)
    const backup = await exportarListaDoCj(db)
    await limparComoADemo(db)
    const reais = await semearReais(db)
    const giannis = reais.find((j) => j.nomeCompleto === 'Giannis Antetokounmpo')!

    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    await confirmar(db, 'Giannis', giannis.id)
    await confirmar(db, 'Doncic', giannis.id)

    const r = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
    expect(r.pendentes).toEqual(['Doncic', 'Fulano', 'Giannis'])
    expect(r.ligados).toBe(0)
    expect(await contarNiveisDaVersaoAtiva(db)).toBe(0)
  })

  it('não sobrescreve o vínculo que um humano já confirmou', async () => {
    await semearDemo(db)
    const backup = await exportarListaDoCj(db)
    await limparComoADemo(db)
    const reais = await semearReais(db)
    const outro = reais.find((j) => j.nomeCompleto === 'Luka Doncic')!
    // O parceiro já tinha confirmado "Giannis" (improvável, mas é decisão dele).
    await db.insert(schema.mapaJogadores).values({
      nomeNaLista: 'Giannis',
      provedor: 'balldontlie',
      jogadorId: outro.id,
      confirmadoPor: 'parceiro',
      confirmadoEm: new Date(),
    })

    await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })

    const [giannis] = await db
      .select()
      .from(schema.mapaJogadores)
      .where(eq(schema.mapaJogadores.nomeNaLista, 'Giannis'))
    expect(giannis!.jogadorId).toBe(outro.id)
    expect(giannis!.confirmadoPor).toBe('parceiro')
  })
})
