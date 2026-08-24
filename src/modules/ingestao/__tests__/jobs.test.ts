import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { execucoesIngestao } from '../../dominio/db/schema'
import { executarJobComLease } from '../jobs/execucao'
import { dataReferenciaNba, deslocarData } from '../jobs/orquestradores'
import { configDoAmbiente } from '../sincronizar/fonte'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

describe('configuração de ingestão', () => {
  it('falha fechado em configuração parcial e não inclui o segredo no erro', () => {
    const segredo = 'segredo-que-nao-pode-vazar'
    expect(() =>
      configDoAmbiente({
        BALLDONTLIE_API_KEY: segredo,
        NBA_RESERVA_OBRIGATORIA: 'true',
      }),
    ).toThrow(/API_SPORTS_NBA_KEY/)

    try {
      configDoAmbiente({
        BALLDONTLIE_API_KEY: segredo,
        NBA_RESERVA_OBRIGATORIA: 'true',
      })
    } catch (erro) {
      expect(String(erro)).not.toContain(segredo)
    }
  })

  it('fixa os namespaces escolhidos e valida limites', () => {
    const config = configDoAmbiente({
      BALLDONTLIE_API_KEY: 'bdl',
      API_SPORTS_NBA_KEY: 'sports',
      NBA_INGESTAO_HABILITADA: 'true',
      NBA_TIMEOUT_MS: '5000',
    })

    expect(config).toMatchObject({
      habilitada: true,
      timeoutMs: 5000,
      primario: { nome: 'balldontlie' },
      reserva: { nome: 'api-sports-nba' },
    })
  })
})

describe('rodada NBA', () => {
  it('não trunca UTC quando a noite de Nova York cruza meia-noite', () => {
    // 00:30Z de 03/01 ainda é 02/01 em Nova York (19:30) e também 02/01 em
    // Brasília (21:30) — os dois fusos concordam neste instante.
    expect(dataReferenciaNba(new Date('2026-01-03T00:30:00.000Z'), 'America/New_York')).toBe('2026-01-02')
    expect(dataReferenciaNba(new Date('2026-01-03T00:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-01-02')

    // Mas às 03:30Z já é 03/01 em Brasília e ainda 02/01 em Nova York: é aqui
    // que a noite de NBA se parte em duas rodadas.
    expect(dataReferenciaNba(new Date('2026-01-03T03:30:00.000Z'), 'America/New_York')).toBe('2026-01-02')
    expect(dataReferenciaNba(new Date('2026-01-03T03:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-01-03')
    expect(deslocarData('2026-01-02', -2)).toBe('2025-12-31')
  })
})

describe.sequential('lease dos jobs', () => {
  it('registra sucesso e impede duas execuções simultâneas da mesma janela', async () => {
    let liberar!: () => void
    let iniciou!: () => void
    const pronta = new Promise<void>((resolve) => (iniciou = resolve))
    const bloqueio = new Promise<void>((resolve) => (liberar = resolve))
    const opcoes = {
      job: 'teste-concorrencia',
      janelaInicio: '2026-01-02',
      janelaFim: '2026-01-02',
      temporada: '2025-26',
      origem: 'CRON' as const,
      leaseMs: 60_000,
    }

    const primeira = executarJobComLease(banco.db, opcoes, async () => {
      iniciou()
      await bloqueio
      return { itens: 1 }
    })
    await pronta

    const segunda = await executarJobComLease(banco.db, opcoes, async () => ({ itens: 2 }))
    expect(segunda).toMatchObject({ executado: false, motivo: 'LOCK_OCUPADO' })

    liberar()
    const concluida = await primeira
    expect(concluida).toMatchObject({ executado: true, resultado: { itens: 1 } })

    if (concluida.executado) {
      const [registro] = await banco.db
        .select({ estado: execucoesIngestao.estado })
        .from(execucoesIngestao)
        .where(eq(execucoesIngestao.id, concluida.execucaoId))
      expect(registro?.estado).toBe('SUCESSO')
    }
  })

  it('registra falha com erro sanitizado e libera a janela para retry', async () => {
    const opcoes = {
      job: 'teste-falha',
      janelaInicio: '2026-01-03',
      janelaFim: '2026-01-03',
      temporada: '2025-26',
      origem: 'CRON' as const,
    }
    await expect(
      executarJobComLease(banco.db, opcoes, async () => {
        throw new Error('Authorization=segredo HTTP 503')
      }),
    ).rejects.toThrow('segredo')

    const [falha] = await banco.db
      .select({ estado: execucoesIngestao.estado, erro: execucoesIngestao.erro })
      .from(execucoesIngestao)
      .where(eq(execucoesIngestao.job, 'teste-falha'))
    expect(falha).toMatchObject({ estado: 'FALHA' })
    expect(falha?.erro).not.toContain('segredo')

    await expect(
      executarJobComLease(banco.db, opcoes, async () => ({ recuperou: true })),
    ).resolves.toMatchObject({ executado: true })
  })

  it('fencing impede commit final depois que o lease expirou', async () => {
    let relogio = new Date('2026-01-04T00:00:00.000Z')
    const opcoes = {
      job: 'teste-fencing',
      janelaInicio: '2026-01-04',
      janelaFim: '2026-01-04',
      temporada: '2025-26',
      origem: 'CRON' as const,
      leaseMs: 1_000,
      agora: () => relogio,
    }

    await expect(
      executarJobComLease(banco.db, opcoes, async () => {
        relogio = new Date('2026-01-04T00:00:02.000Z')
        return { itens: 1 }
      }),
    ).rejects.toThrow(/lease de ingestão perdido/)

    const [execucao] = await banco.db
      .select({ estado: execucoesIngestao.estado })
      .from(execucoesIngestao)
      .where(eq(execucoesIngestao.job, 'teste-fencing'))
    expect(execucao?.estado).toBe('FALHA')
  })
})
