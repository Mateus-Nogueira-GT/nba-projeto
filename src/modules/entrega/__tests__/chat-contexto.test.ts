import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { validarTexto } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { intervaloDoDia } from '../../dominio/rodada'
import { montarContexto } from '../chat-contexto'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'
const FUSO = ruleset.rodada.fuso
const TEMPORADA = temporadaDe(
  intervaloDoDia(HOJE, FUSO).inicio,
  calendarioDoRuleset(ruleset),
)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const opcoes = (comDireito: boolean) => ({
  dataReferencia: HOJE,
  fuso: FUSO,
  temporada: TEMPORADA,
  comDireito,
  cotaDiaria: 20,
})

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('montarContexto', () => {
  it('A INVARIANTE: os próprios fatos passam pelo validador contra os próprios números', async () => {
    // Se um número do bloco ficasse de fora de `numeros`, o modelo o repetiria
    // e o validador recusaria a resposta CERTA — "indisponível" para o
    // assinante e uma chamada paga jogada fora.
    for (const comDireito of [true, false]) {
      const c = await montarContexto(banco.db, opcoes(comDireito))
      const r = validarTexto(c.fatos, { numeros: c.numeros, limiteCaracteres: 1_000_000 })
      expect(r.ok, `comDireito=${comDireito}: ${r.ok ? '' : r.motivo}`).toBe(true)
    }
  })

  it('com direito ativo, a lista do dia entra', async () => {
    const c = await montarContexto(banco.db, opcoes(true))
    expect(c.fatos).toContain('ENTRADAS DE HOJE')
  })

  it('sem direito ativo, a lista do dia NÃO entra', async () => {
    const c = await montarContexto(banco.db, opcoes(false))
    expect(c.fatos).not.toContain('ENTRADAS DE HOJE')
  })

  it('leva o conhecimento da plataforma, a metodologia e o retrato da temporada nos dois casos', async () => {
    for (const comDireito of [true, false]) {
      const c = await montarContexto(banco.db, opcoes(comDireito))
      expect(c.fatos).toContain('A PLATAFORMA')
      expect(c.fatos).toContain('METODOLOGIA NIP')
      expect(c.fatos).toContain('CLASSIFICAÇÃO')
      expect(c.fatos).toContain('RODADA DE HOJE')
    }
  })

  it('as seções do retrato trazem o vínculo de time no rótulo — sem isso o agente troca um pelo outro', async () => {
    const c = await montarContexto(banco.db, opcoes(true))
    // A armadilha do CLAUDE.md: o retrato é time REAL, as entradas são curadoria.
    expect(c.fatos).toMatch(/RODADA DE HOJE \([^)]*time real da liga\)/)
    expect(c.fatos).toMatch(/CLASSIFICAÇÃO \([^)]*time real da liga\)/)
    expect(c.fatos).toContain('curadoria NIP — elenco projetado, não o time real')
  })

  it('os limites de uso entram nos fatos e nos números — é o que deixa o agente respondê-los', async () => {
    const c = await montarContexto(banco.db, opcoes(false))
    expect(c.fatos).toContain('SEUS LIMITES')
    expect(c.numeros).toContain(20)
  })

  it('a classificação traz um time por linha, um por cada time da demo', async () => {
    const c = await montarContexto(banco.db, opcoes(false))
    const linhas = c.fatos.split('\n').filter((l) => l.startsWith('- ') && l.includes('V-'))
    // Medido rodando este teste: a demo (`semearDemo`) cadastra só os times do
    // documento fonte (`ARQUIVO_LISTA` em `ingestao/demo/cadastro.ts`), não os
    // 30 times reais da liga — o comentário de `semear.ts` já chama isso de
    // "os oito times do documento". `classificacao` só ganha linha para quem
    // tem jogo ENCERRADO (`semearClassificacao`), e aqui são esses mesmos oito.
    expect(linhas).toHaveLength(8)
  })

  it('cada linha da classificação traz a sequência (spec §4.1) e o aproveitamento — os números que mais se perguntam', async () => {
    const c = await montarContexto(banco.db, opcoes(false))
    const linhas = c.fatos.split('\n').filter((l) => l.startsWith('- ') && l.includes('V-D'))
    expect(linhas.length).toBeGreaterThan(0)
    for (const linha of linhas) {
      // "sequência V3" / "sequência D2": é o rabo da campanha que a tela mostra.
      expect(linha).toMatch(/sequência [VD]\d+/)
      // "aproveitamento 62%": sem ele nos fatos, o modelo calcula 12-8 → 60% por
      // conta própria e o validador recusa a resposta certa como número inventado.
      expect(linha).toMatch(/aproveitamento \d+%/)
    }
    // E o número do aproveitamento é, por construção, um número permitido.
    const [pct] = /aproveitamento (\d+)%/.exec(linhas[0]!)!.slice(1)
    expect(c.numeros).toContain(Number(pct))
  })
})
