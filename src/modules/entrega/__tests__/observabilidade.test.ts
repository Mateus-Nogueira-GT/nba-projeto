import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { carregarRuleset } from '@/modules/motor'
import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogos, logFalhas, saudeProvedor, times } from '@/modules/dominio/db/schema'
import { emJanelaDeJogo } from '../observabilidade/janela'
import { avaliarESinalizar } from '../observabilidade/alerta'
import { NotificadorMemoria } from '../observabilidade/notificador'

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
  await banco.db.delete(logFalhas)
  await banco.db.delete(saudeProvedor)
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

describe('alerta de dado parado', () => {
  const parado = (provedor: string, ha: number, agora: Date) => ({
    provedor,
    tipo: 'NBA_PRIMARIO' as const,
    status: 'OK',
    ultimaRespostaOk: new Date(agora.getTime() - ha),
    dadoMaisRecenteEm: new Date(agora.getTime() - ha),
  })

  it('provedor parado há uma hora fora de janela gera um alerta com contexto', async () => {
    await banco.db.insert(saudeProvedor).values(parado('balldontlie', 60 * 60_000, AGORA))
    const memoria = new NotificadorMemoria()

    const emitidos = await avaliarESinalizar(banco.db, AGORA, ruleset, memoria)

    expect(emitidos).toHaveLength(1)
    expect(memoria.enviados).toHaveLength(1)
    const linhas = await banco.db.select().from(logFalhas)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ origem: 'alerta-dado-parado', severidade: 'ERRO' })
    expect(linhas[0]!.contextoJson).toMatchObject({ provedor: 'balldontlie' })
  })

  it('segunda execução dentro do realerta não repete o alerta', async () => {
    await banco.db.insert(saudeProvedor).values(parado('balldontlie', 60 * 60_000, AGORA))
    const memoria = new NotificadorMemoria()

    await avaliarESinalizar(banco.db, AGORA, ruleset, memoria)
    const cincoMinDepois = new Date(AGORA.getTime() + 5 * 60_000)
    const emitidos = await avaliarESinalizar(banco.db, cincoMinDepois, ruleset, memoria)

    expect(emitidos).toHaveLength(0)
    expect(memoria.enviados).toHaveLength(1)
    expect(await banco.db.select().from(logFalhas)).toHaveLength(1)
  })

  it('passado o realerta, avisa de novo', async () => {
    await banco.db.insert(saudeProvedor).values(parado('balldontlie', 60 * 60_000, AGORA))
    const memoria = new NotificadorMemoria()

    await avaliarESinalizar(banco.db, AGORA, ruleset, memoria)
    const depoisDoRealerta = new Date(
      AGORA.getTime() + (ruleset.avisos.dado_parado.realerta_minutos + 1) * 60_000,
    )
    const emitidos = await avaliarESinalizar(banco.db, depoisDoRealerta, ruleset, memoria)

    expect(emitidos).toHaveLength(1)
    expect(memoria.enviados).toHaveLength(2)
  })

  it('em janela de jogo vale o limite apertado', async () => {
    await banco.db.insert(jogos).values(jogo(new Date('2026-08-22T21:00:00Z'), 'AO_VIVO'))
    // 2 minutos: tolerável fora de janela (30 min), pane dentro dela (90 s)
    await banco.db.insert(saudeProvedor).values(parado('balldontlie', 2 * 60_000, AGORA))
    const memoria = new NotificadorMemoria()

    const emitidos = await avaliarESinalizar(banco.db, AGORA, ruleset, memoria)

    expect(emitidos).toHaveLength(1)
  })

  it('dado fresco não gera nada', async () => {
    await banco.db.insert(saudeProvedor).values(parado('balldontlie', 10_000, AGORA))
    const memoria = new NotificadorMemoria()

    expect(await avaliarESinalizar(banco.db, AGORA, ruleset, memoria)).toHaveLength(0)
    expect(await banco.db.select().from(logFalhas)).toHaveLength(0)
  })
})
