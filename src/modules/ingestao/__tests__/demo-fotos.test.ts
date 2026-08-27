import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { isNotNull } from 'drizzle-orm'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { semearDemo } from '../demo/semear'
import { aplicarFotos, MAPA_FOTOS, urlDaFoto } from '../demo/fotos'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

describe('fotos da demonstração', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, new Date('2026-08-24T18:00:00.000Z'))
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('todo nome do mapa resolve para um jogador semeado', async () => {
    // O guard continua sendo "nenhuma foto cai no vazio por erro de digitação".
    // O que mudou é a REGRA de casamento: `nomeCompleto` guarda o nome de
    // exibição ("Stephen Curry") e as chaves vêm do documento do CJ
    // ("stephen Curry"), então quem resolve é a caixa baixa — a mesma
    // comparação que `aplicarFotos` faz.
    const nomes = new Set(
      (await banco.db.select().from(jogadores)).map((j) => j.nomeCompleto.toLowerCase()),
    )
    for (const nome of Object.keys(MAPA_FOTOS)) expect(nomes.has(nome.toLowerCase()), nome).toBe(true)
  })

  it('só grava URL que o verificador aprovou', async () => {
    const aprovadas = new Set([urlDaFoto(MAPA_FOTOS['Shai']!)])
    const r = await aplicarFotos(banco.db, async (url) => aprovadas.has(url))
    expect(r.gravadas).toBe(1)
    expect(r.puladas.length).toBe(Object.keys(MAPA_FOTOS).length - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(1)
    expect(comFoto[0]!.fotoUrl).toContain('cdn.nba.com')
  })
})
