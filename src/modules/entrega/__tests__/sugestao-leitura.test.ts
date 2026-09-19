import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { LLMFake, validarTexto } from '../../ingestao/llm'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { dataDeReferencia, intervaloDoDia } from '../../dominio/rodada'
import { montarContexto } from '../chat-contexto'
import { lerRankingDoDia } from '../sugestao/leitura'

/**
 * A LEITURA DO RANKING contra o banco de verdade (ADR-0012).
 *
 * As partes puras têm os testes delas; aqui se prova a parte que só o banco
 * responde: o elenco vem da CURADORIA do CJ, o jogo em andamento fica de fora
 * e o bloco resultante ainda passa pelo próprio validador.
 */
const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const FUSO = ruleset.rodada.fuso
const HOJE = dataDeReferencia(AGORA, FUSO)
const TEMPORADA = temporadaDe(intervaloDoDia(HOJE, FUSO).inicio, calendarioDoRuleset(ruleset))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  // `simularAte` com histórico, e não `semearDemo`: o ranking exige
  // `minimo_jogos` partidas ENCERRADAS por jogador, e uma semente de poucos
  // dias devolveria lista vazia — os testes passariam sobre o nada.
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 30, llm: new LLMFake() })
}, 300_000)
afterAll(async () => {
  await banco.fechar()
})

describe('ler o ranking do dia', () => {
  it('traz os jogos de hoje, com os dois times e ranking por atributo', async () => {
    const r = await lerRankingDoDia(banco.db, ruleset, HOJE)

    expect(r.dataReferencia).toBe(HOJE)
    expect(r.jogos.length).toBeGreaterThan(0)
    for (const jogo of r.jogos) {
      // O jogo inteiro: quem pergunta do time quase sempre pergunta do rival.
      expect(jogo.times).toHaveLength(2)
      expect(jogo.times[0].sigla).not.toBe(jogo.times[1].sigla)
      expect(jogo.porAtributo.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('respeita `maximo_por_time` — o contexto do chat não cresce sem freio', async () => {
    const r = await lerRankingDoDia(banco.db, ruleset, HOJE)
    const teto = ruleset.sugestao_estatistica.maximo_por_time

    for (const jogo of r.jogos) {
      for (const { itens } of jogo.porAtributo) {
        const porSigla = new Map<string, number>()
        for (const item of itens) {
          porSigla.set(item.timeSigla, (porSigla.get(item.timeSigla) ?? 0) + 1)
        }
        for (const [sigla, quantos] of porSigla) {
          expect(quantos, `${sigla} passou do teto`).toBeLessThanOrEqual(teto)
        }
      }
    }
  }, 120_000)

  it('ninguém entra com menos jogos que `minimo_jogos`', async () => {
    // Sem este corte, quem voltou de lesão ontem apareceria com "2 de 2".
    const r = await lerRankingDoDia(banco.db, ruleset, HOJE)
    const minimo = ruleset.sugestao_estatistica.minimo_jogos

    for (const jogo of r.jogos) {
      for (const { itens } of jogo.porAtributo) {
        for (const item of itens) {
          for (const taxa of item.porLinha) {
            expect(taxa.de).toBeGreaterThanOrEqual(minimo)
            // E nunca se conta mais do que a janela manda.
            expect(taxa.de).toBeLessThanOrEqual(ruleset.sugestao_estatistica.janela_jogos)
            // Bater não pode exceder o total jogado.
            expect(taxa.bateu).toBeLessThanOrEqual(taxa.de)
          }
        }
      }
    }
  }, 120_000)

  it('o marcador de apitado é por (jogador, ATRIBUTO), não por jogador', async () => {
    // Um jogador pode apitar em pontos e não em rebotes; marcá-lo como
    // apitado na lista de rebotes seria a confusão entre as duas vozes que o
    // guardrail existe para impedir.
    const { lerFeed } = await import('../lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const chaves = new Set((feed?.conteudo.itens ?? []).map((i) => `${i.jogadorId}|${i.atributo}`))

    const r = await lerRankingDoDia(banco.db, ruleset, HOJE)
    for (const jogo of r.jogos) {
      for (const { atributo, itens } of jogo.porAtributo) {
        for (const item of itens) {
          expect(item.apitadoHoje).toBe(chaves.has(`${item.jogadorId}|${atributo}`))
        }
      }
    }
  }, 120_000)

  it('A INVARIANTE, com o ranking dentro: os fatos passam pelo próprio validador', async () => {
    // Mesma invariante que `chat-contexto.test` já protege, agora com a seção
    // do ranking junto: um número do bloco fora de `numeros` faria o modelo
    // repeti-lo e o validador recusar a resposta CERTA.
    const ranking = await lerRankingDoDia(banco.db, ruleset, HOJE)
    const contexto = await montarContexto(banco.db, {
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: 20,
      sugestao: { ruleset, ranking, pergunta: 'em quem eu aposto hoje?', textosAnteriores: [] },
    })

    expect(contexto.fatos).toContain('RANKING DA RODADA')
    const r = validarTexto(contexto.fatos, {
      numeros: contexto.numeros,
      limiteCaracteres: contexto.fatos.length,
    })
    expect(r.ok, r.ok ? '' : `os próprios fatos foram reprovados: ${r.motivo}`).toBe(true)
  }, 120_000)

  it('sem sugestão, os fatos ficam exatamente como antes da ADR-0012', async () => {
    const contexto = await montarContexto(banco.db, {
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: 20,
    })
    expect(contexto.fatos).not.toContain('RANKING DA RODADA')
  }, 120_000)
})
