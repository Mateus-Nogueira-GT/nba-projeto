import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '@/modules/motor'
import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogos, times } from '@/modules/dominio/db/schema'
import { emJanelaDeJogo } from '../observabilidade/janela'

const ruleset = carregarRuleset(yamlBruto)
const AGORA = new Date('2026-08-22T23:00:00Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let casaId: string
let visitanteId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(jogos)
  await banco.db.delete(times)
  const [casa] = await banco.db.insert(times).values({ sigla: 'CAS', nome: 'Casa' }).returning()
  const [vis] = await banco.db.insert(times).values({ sigla: 'VIS', nome: 'Visitante' }).returning()
  casaId = casa!.id
  visitanteId = vis!.id
})

function jogo(dataHoraUtc: Date, status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
  return {
    dataHoraUtc,
    dataReferencia: '2026-08-22',
    timeCasaId: casaId,
    timeVisitanteId: visitanteId,
    status,
  }
}

describe('frescor no ruleset', () => {
  it('o ruleset expõe os quatro números operacionais do alerta', () => {
    expect(ruleset.avisos.dado_parado).toEqual({
      fora_de_jogo_minutos: 30,
      em_janela_segundos: 90,
      janela_antecedencia_minutos: 30,
      realerta_minutos: 30,
    })
  })
})

describe('janela de jogo', () => {
  const ANTECEDENCIA = 30

  it('jogo ao vivo abre a janela', async () => {
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-22T21:00:00Z'), 'AO_VIVO'))
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(true)
  })

  it('jogo agendado para daqui 20 minutos abre a janela', async () => {
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-22T23:20:00Z'), 'AGENDADO'))
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(true)
  })

  it('jogo agendado para daqui 2 horas não abre', async () => {
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-23T01:00:00Z'), 'AGENDADO'))
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(false)
  })

  it('jogo encerrado não abre', async () => {
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-22T20:00:00Z'), 'ENCERRADO'))
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(false)
  })

  it('nenhum jogo não abre', async () => {
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(false)
  })

  it('jogo agendado no passado não reabre a janela sozinho', async () => {
    // Agendado que já deveria ter começado e não virou AO_VIVO: dado parado é
    // exatamente o cenário que o alerta existe para pegar — mas a janela olha
    // para frente; quem decide alerta é o frescor.
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-22T22:00:00Z'), 'AGENDADO'))
    expect(await emJanelaDeJogo(banco.db, AGORA, ANTECEDENCIA)).toBe(false)
  })
})
