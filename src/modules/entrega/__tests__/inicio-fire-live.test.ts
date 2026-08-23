import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { fireLiveExecucoes, jogos, times } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import {
  confirmarInicioWorkflow,
  DURACAO_LEASE_INICIO_MS,
  iniciarWorkflowsReservados,
  reservarJogosParaObservar,
} from '../fire-live/inicio'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-21T23:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterAll(async () => {
  vi.restoreAllMocks()
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(fireLiveExecucoes)
  await banco.db.delete(jogos)
  await banco.db.delete(times)

  const [casa] = await banco.db.insert(times).values({ sigla: 'CAS', nome: 'Casa' }).returning()
  const [visitante] = await banco.db
    .insert(times)
    .values({ sigla: 'VIS', nome: 'Visitante' })
    .returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: AGORA,
      dataReferencia: '2026-08-21',
      timeCasaId: casa!.id,
      timeVisitanteId: visitante!.id,
      quartoAtual: ruleset.fire_live.quarto,
    })
    .returning()
  jogoId = jogo!.id
})

describe('lease do início do Fire Live', () => {
  it('duas invocações concorrentes chamam start no máximo uma vez', async () => {
    let chamadas = 0
    const gatilho = async () => {
      const disparos = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
      return iniciarWorkflowsReservados(
        banco.db,
        disparos,
        async () => {
          chamadas += 1
          return { runId: `run-${chamadas}` }
        },
        () => AGORA,
      )
    }

    const [a, b] = await Promise.all([gatilho(), gatilho()])

    expect(chamadas).toBe(1)
    expect(a.iniciados.length + b.iniciados.length).toBe(1)
  })

  it('falha de start fica registrada e é retomada no ciclo seguinte', async () => {
    const [primeiro] = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
    const falha = await iniciarWorkflowsReservados(
      banco.db,
      [primeiro!],
      async () => {
        throw new Error('timeout em https://provedor.invalid?token=segredo')
      },
      () => AGORA,
    )

    expect(falha.falhas).toHaveLength(1)
    const [aposFalha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(aposFalha).toMatchObject({
      estado: 'FALHOU_AO_INICIAR',
      runId: null,
      tentativasInicio: 1,
    })
    expect(aposFalha!.erroInicio).not.toContain('provedor.invalid')
    expect(aposFalha!.erroInicio).not.toContain('segredo')

    const [retry] = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
    expect(retry).toMatchObject({ jogoId, tentativa: 2 })
    expect(retry!.leaseToken).not.toBe(primeiro!.leaseToken)

    const sucesso = await iniciarWorkflowsReservados(
      banco.db,
      [retry!],
      async () => ({ runId: 'run-retry' }),
      () => AGORA,
    )
    expect(sucesso.iniciados).toEqual([jogoId])
    expect(await reservarJogosParaObservar(banco.db, ruleset, AGORA)).toEqual([])
  })

  it('reserva abandonada só é retomada depois de expirar', async () => {
    const [abandonada] = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
    const antesDoPrazo = new Date(AGORA.getTime() + DURACAO_LEASE_INICIO_MS - 1)
    expect(await reservarJogosParaObservar(banco.db, ruleset, antesDoPrazo)).toEqual([])

    const depoisDoPrazo = new Date(AGORA.getTime() + DURACAO_LEASE_INICIO_MS + 1)
    const [recuperada] = await reservarJogosParaObservar(banco.db, ruleset, depoisDoPrazo)

    expect(recuperada).toMatchObject({ jogoId, tentativa: 2, iniciadoEm: AGORA })
    expect(recuperada!.leaseToken).not.toBe(abandonada!.leaseToken)
  })

  it('fencing rejeita run atrasado e torna a confirmação vencedora idempotente', async () => {
    const [antiga] = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
    const depoisDoPrazo = new Date(AGORA.getTime() + DURACAO_LEASE_INICIO_MS + 1)
    const [atual] = await reservarJogosParaObservar(banco.db, ruleset, depoisDoPrazo)

    expect(await confirmarInicioWorkflow(banco.db, antiga!, 'run-atrasado', depoisDoPrazo)).toBe(
      false,
    )
    expect(await confirmarInicioWorkflow(banco.db, atual!, 'run-vencedor', depoisDoPrazo)).toBe(
      true,
    )
    expect(await confirmarInicioWorkflow(banco.db, atual!, 'run-vencedor', depoisDoPrazo)).toBe(
      true,
    )
    expect(await confirmarInicioWorkflow(banco.db, atual!, 'run-duplicado', depoisDoPrazo)).toBe(
      false,
    )

    const [linha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha).toMatchObject({ estado: 'INICIADA', runId: 'run-vencedor' })
  })
})
