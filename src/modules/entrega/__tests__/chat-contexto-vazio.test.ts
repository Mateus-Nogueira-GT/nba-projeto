import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { validarTexto } from '../../ingestao/llm'
import { montarContexto } from '../chat-contexto'

// BANCO VAZIO DE PROPÓSITO — nada semeado. É o estado de produção no primeiro
// dia, e é o estado de TODA virada de temporada: em outubro a temporada muda
// de rótulo e `classificacao` ainda não tem linha nenhuma para a nova. Um
// contexto que lançasse aqui derrubaria o chat inteiro exatamente nesse dia.
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 60_000)
afterAll(async () => {
  await banco.fechar()
})

describe('montarContexto num banco sem temporada', () => {
  it('não lança, diz que não há jogo, e a invariante dos números continua valendo', async () => {
    for (const comDireito of [true, false]) {
      const c = await montarContexto(banco.db, {
        dataReferencia: '2026-10-01',
        fuso: 'America/Sao_Paulo',
        temporada: '2026-27',
        comDireito,
        cotaDiaria: 20,
      })
      expect(c.fatos).toContain('Nenhum jogo hoje.')
      expect(c.fatos).toContain('CLASSIFICAÇÃO')
      expect(validarTexto(c.fatos, { numeros: c.numeros, limiteCaracteres: 1_000_000 }).ok).toBe(true)
    }
  })
})
