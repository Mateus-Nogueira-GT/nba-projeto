import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { simularAte } from '../../ingestao/demo/temporada'
import { LLMFake } from '../../ingestao/llm'
import { lerLateral } from '../lateral'
import { ultimaRodadaConferida } from '../resultados'
import { rulesetAtivo } from '../ruleset-ativo'

/**
 * O LEITOR DA LATERAL (identidade 05, §7).
 *
 * Mesmo arnês das telas: PGlite semeado pela temporada simulada, e NENHUMA
 * asserção nomeia jogador, time ou horário — quem joga hoje é consequência do
 * sorteio. Aqui o que está sob teste é a regra, não o elenco.
 */
const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let config: ReturnType<typeof calendarioDoRuleset>
let temporada: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  config = calendarioDoRuleset(ruleset)
  temporada = temporadaDe(AGORA, config)
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
}, 180_000)

afterAll(async () => {
  await banco?.fechar()
})

describe('leitor da lateral', () => {
  it('a noite é a ÚLTIMA CONFERIDA, não "ontem"', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    const esperada = await ultimaRodadaConferida(banco.db, HOJE)
    expect(dados.noite?.data ?? null).toBe(esperada)
  }, 60_000)

  it('noite em curso não tem taxa — nunca uma parcial vendida como resultado', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    if (dados.noite && !dados.noite.noiteEncerrada) expect(dados.noite.taxa).toBeNull()
    // e com a noite encerrada e algo conferido, a taxa existe
    if (dados.noite?.noiteEncerrada && dados.noite.conferidos > 0) {
      expect(dados.noite.taxa).not.toBeNull()
    }
  }, 60_000)

  it('a classificação vem por conferência, ordenada por posição e cortada em 8', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    expect(dados.classificacao.conferencias.length).toBeGreaterThan(0)
    for (const grupo of dados.classificacao.conferencias) {
      expect(grupo.linhas.length).toBeLessThanOrEqual(8)
      const posicoes = grupo.linhas.map((l) => l.posicao ?? Infinity)
      expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
    }
  }, 60_000)

  it('o corte de linhas é parâmetro, não número solto no meio da consulta', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config, linhas: 3 })
    for (const grupo of dados.classificacao.conferencias) {
      expect(grupo.linhas.length).toBeLessThanOrEqual(3)
    }
  }, 60_000)

  it('só dado GRÁTIS: nada de apito, nível, confiança ou jogador', async () => {
    // É o que autoriza o cache compartilhado da lateral. Se um dia alguém
    // acrescentar o sinal aqui, o cache passa a servir conteúdo pago a quem
    // não paga — e é isto que trava essa porta.
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    const json = JSON.stringify(dados)
    expect(json).not.toMatch(/confianca|nivelApito|jogadorId|apito|narrativa/i)
  }, 60_000)
})
