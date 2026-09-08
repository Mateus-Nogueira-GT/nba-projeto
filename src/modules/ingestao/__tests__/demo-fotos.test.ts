import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { isNotNull } from 'drizzle-orm'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { semearDemo } from '../demo/semear'
import { aplicarFotos, MAPA_FOTOS, urlDaFoto } from '../demo/fotos'
import { lerListaDeNiveis } from '../niveis/parser'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const listaDoCj = lerListaDeNiveis(readFileSync('data/fontes/introducao-ia-nba.md', 'utf8'))

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
    for (const nome of Object.keys(MAPA_FOTOS))
      expect(nomes.has(nome.toLowerCase()), nome).toBe(true)
  })

  it('todo nome da lista do CJ tem entrada no mapa — na grafia exata do documento', () => {
    // A identidade 04 põe rosto em todo card. Um nome fora do mapa é uma
    // silhueta no meio da Lista Secreta — e a lista do CJ é documento vivo,
    // então este teste é o que avisa quando entra um nome novo sem foto.
    expect(listaDoCj.jogadores.length).toBeGreaterThan(200)
    for (const j of listaDoCj.jogadores)
      expect(j.nomeNaLista in MAPA_FOTOS, j.nomeNaLista).toBe(true)
  })

  it('nenhum personId se repete — dois nomes com a mesma foto é um rosto errado', () => {
    const ids = Object.values(MAPA_FOTOS).filter((id) => id !== null)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('com o CDN respondendo, pelo menos 90% dos jogadores semeados ganham foto', async () => {
    const antes = new Map(
      (await banco.db.select().from(jogadores)).map((jogador) => [jogador.id, jogador]),
    )
    const r = await aplicarFotos(banco.db, async () => true)
    expect(r.puladas).toEqual([])
    expect(r.gravadas).toBe(Object.values(MAPA_FOTOS).filter((id) => id !== null).length)
    // O único sem foto é ambiguidade declarada, não falha de curadoria.
    expect(r.semId).toEqual(['Wiggins'])
    const [todos, comFoto] = await Promise.all([
      banco.db.select().from(jogadores),
      banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl)),
    ])
    expect(comFoto.length / todos.length).toBeGreaterThanOrEqual(0.9)
    for (const jogador of todos) {
      const original = antes.get(jogador.id)!
      // Somente a URL muda: UUID, nome, time e todos os demais dados ficam.
      expect({ ...jogador, fotoUrl: original.fotoUrl }).toEqual(original)
    }
  })

  it('só grava URL que o verificador aprovou', async () => {
    // Limpa o que o teste anterior gravou: aqui o verificador aprova UMA url.
    await banco.db.update(jogadores).set({ fotoUrl: null })
    const aprovadas = new Set([urlDaFoto(MAPA_FOTOS['Shai']!)])
    const r = await aplicarFotos(banco.db, async (url) => aprovadas.has(url))
    expect(r.gravadas).toBe(1)
    const comId = Object.values(MAPA_FOTOS).filter((id) => id !== null).length
    expect(r.puladas.length).toBe(comId - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(1)
    expect(comFoto[0]!.fotoUrl).toContain('cdn.nba.com')
  })

  it('uma falha de rede deixa só aquela foto pendente e permite preencher o restante', async () => {
    await banco.db.update(jogadores).set({ fotoUrl: null })
    const indisponivel = urlDaFoto(MAPA_FOTOS['Brunson']!)
    const resultado = await aplicarFotos(banco.db, async (url) => {
      if (url === indisponivel) throw new TypeError('fetch failed')
      return true
    })

    expect(resultado.puladas).toEqual(['Brunson'])
    expect(resultado.semId).toEqual(['Wiggins'])
    const comId = Object.values(MAPA_FOTOS).filter((id) => id !== null).length
    expect(resultado.gravadas).toBe(comId - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(comId - 1)
  })
})
