import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '../../../dominio/db/tipos'
import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { logFalhas } from '../../../dominio/db/schema'
import {
  avaliarFalhasOperacionais,
  registrarEventoExpiradoSemFalhar,
  registrarExpiradosSemFalhar,
  registrarFalhaOperacional,
  registrarFalhaOperacionalSemFalhar,
} from '../falhas-operacionais'
import { NotificadorLog, NotificadorMemoria } from '../notificador'
import { NotificadorWebhook, notificadorDoAmbiente } from '../notificador-webhook'

const AGORA = new Date('2026-11-03T23:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(logFalhas)
})

describe('falhas operacionais viram alerta', () => {
  it('push expirado nos últimos 10 min vira UM alerta com a soma', async () => {
    await registrarFalhaOperacional(
      banco.db,
      'push-expirado',
      { quantidade: 3 },
      new Date(AGORA.getTime() - 60_000),
    )
    await registrarFalhaOperacional(
      banco.db,
      'push-expirado',
      { quantidade: 2 },
      new Date(AGORA.getTime() - 120_000),
    )
    const n = new NotificadorMemoria()
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, n)).toEqual([
      { origem: 'push-expirado', quantidade: 5 },
    ])
    expect(n.enviados).toHaveLength(1)
    expect(n.enviados[0]?.severidade).toBe('ALTA')
  })

  it('a mesma falha não realerta dentro de 30 min', async () => {
    await registrarFalhaOperacional(
      banco.db,
      'pagamento-aprovado-sem-direito',
      { usuarioId: 'u' },
      AGORA,
    )
    const n = new NotificadorMemoria()
    await avaliarFalhasOperacionais(banco.db, AGORA, n)
    await registrarFalhaOperacional(
      banco.db,
      'pagamento-aprovado-sem-direito',
      { usuarioId: 'v' },
      new Date(AGORA.getTime() + 5 * 60_000),
    )
    await avaliarFalhasOperacionais(banco.db, new Date(AGORA.getTime() + 5 * 60_000), n)
    expect(n.enviados).toHaveLength(1)
  })

  it('falha antiga (mais de 10 min) não alerta', async () => {
    await registrarFalhaOperacional(
      banco.db,
      'push-expirado',
      { quantidade: 1 },
      new Date(AGORA.getTime() - 11 * 60_000),
    )
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([])
  })
})

describe('registrarExpiradosSemFalhar — não pode derrubar a fila (fix round 1)', () => {
  it('grava normalmente quando há expirados', async () => {
    await registrarExpiradosSemFalhar(banco.db, { expirados: 4 }, 'push', AGORA)
    const n = new NotificadorMemoria()
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, n)).toEqual([
      { origem: 'push-expirado', quantidade: 4 },
    ])
  })

  it('sem expirados, não grava nada', async () => {
    await registrarExpiradosSemFalhar(banco.db, { expirados: 0 }, 'push', AGORA)
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([])
  })

  it('erro ao gravar (ex.: timeout do banco) não escapa — a fila teria que confirmar mesmo assim', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dbQuebrado = {
      insert: () => ({
        values: () => Promise.reject(new Error('timeout')),
      }),
    } as unknown as Db
    await expect(
      registrarExpiradosSemFalhar(dbQuebrado, { expirados: 2 }, 'push', AGORA),
    ).resolves.toBeUndefined()
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('falha_operacional_nao_registrada'))
    erro.mockRestore()
  })
})

describe('registrarEventoExpiradoSemFalhar — push que vence na expansão (W2-2/W2-5)', () => {
  it('evento vencido antes de virar lote grava UMA falha, com canal e nível evento', async () => {
    await registrarEventoExpiradoSemFalhar(banco.db, { expirado: true }, 'LISTA_SECRETA', AGORA)
    const linhas = await banco.db.select().from(logFalhas)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.origem).toBe('push-expirado')
    expect(linhas[0]?.contextoJson).toEqual({
      quantidade: 1,
      canal: 'LISTA_SECRETA',
      nivel: 'evento',
    })
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([
      { origem: 'push-expirado', quantidade: 1 },
    ])
  })

  it('evento que não venceu não grava nada', async () => {
    await registrarEventoExpiradoSemFalhar(banco.db, { expirado: false }, 'LISTA_SECRETA', AGORA)
    expect(await banco.db.select().from(logFalhas)).toHaveLength(0)
  })

  it('erro ao gravar não escapa — a expansão confirma mesmo assim', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dbQuebrado = {
      insert: () => ({ values: () => Promise.reject(new Error('timeout')) }),
    } as unknown as Db
    await expect(
      registrarEventoExpiradoSemFalhar(dbQuebrado, { expirado: true }, null, AGORA),
    ).resolves.toBeUndefined()
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('falha_operacional_nao_registrada'))
    erro.mockRestore()
  })
})

describe('Fire Live falhando ciclo após ciclo (pós-merge da Onda 2)', () => {
  it('duas falhas de ciclo em 10 min não alertam: um soluço não acorda ninguém', async () => {
    for (const s of [60_000, 40_000]) {
      await registrarFalhaOperacional(
        banco.db,
        'fire-live-ciclo-falhou',
        { jogoId: 'j1' },
        new Date(AGORA.getTime() - s),
      )
    }
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([])
  })

  it('um soluço em vários jogos no mesmo ciclo não alerta: o limite é por jogo', async () => {
    for (const jogoId of ['j1', 'j2', 'j3', 'j4']) {
      await registrarFalhaOperacional(
        banco.db,
        'fire-live-ciclo-falhou',
        { jogoId },
        new Date(AGORA.getTime() - 30_000),
      )
    }
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([])
  })

  it('três falhas de ciclo do mesmo jogo em 10 min alertam', async () => {
    for (const s of [60_000, 40_000, 20_000]) {
      await registrarFalhaOperacional(
        banco.db,
        'fire-live-ciclo-falhou',
        { jogoId: 'j1' },
        new Date(AGORA.getTime() - s),
      )
    }
    const n = new NotificadorMemoria()
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, n)).toEqual([
      { origem: 'fire-live-ciclo-falhou', quantidade: 3 },
    ])
    expect(n.enviados[0]?.severidade).toBe('ALTA')
  })

  it('registrar sem falhar: erro ao gravar não escapa', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dbQuebrado = {
      insert: () => ({ values: () => Promise.reject(new Error('timeout')) }),
    } as unknown as Db
    await expect(
      registrarFalhaOperacionalSemFalhar(dbQuebrado, 'fire-live-ciclo-falhou', {}, AGORA),
    ).resolves.toBeUndefined()
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})

describe('notificador', () => {
  it('sem ALERTA_WEBHOOK_URL fica no log (desligado)', () => {
    expect(notificadorDoAmbiente({})).toBeInstanceOf(NotificadorLog)
  })

  it('com a URL, faz POST do aviso em JSON', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const n = new NotificadorWebhook('https://hooks.exemplo/abc', fetchFalso)
    await n.enviar({ severidade: 'ALTA', titulo: 'T', corpo: 'C' })
    expect(fetchFalso).toHaveBeenCalledWith(
      'https://hooks.exemplo/abc',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(fetchFalso.mock.calls[0]![1].body)).toEqual({
      severidade: 'ALTA',
      titulo: 'T',
      corpo: 'C',
    })
  })

  it('webhook fora do ar não derruba quem avisa: cai no log', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const n = new NotificadorWebhook(
      'https://hooks.exemplo/abc',
      vi.fn().mockRejectedValue(new Error('rede')),
    )
    await expect(n.enviar({ severidade: 'ALTA', titulo: 'T', corpo: 'C' })).resolves.toBeUndefined()
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})

describe('fonte — pontas ligadas (W2-5)', () => {
  it('o webhook grava a origem que a saúde lê', () => {
    expect(readFileSync('src/modules/plataforma/assinatura/webhook.ts', 'utf8')).toContain(
      "origem: 'pagamento-aprovado-sem-direito'",
    )
  })

  it('a rota de eventos registra o evento que venceu na expansão', () => {
    expect(readFileSync('src/app/api/fila/push/route.ts', 'utf8')).toMatch(
      /registrarEventoExpiradoSemFalhar\(/,
    )
  })

  it('a instrumentação exporta onRequestError', () => {
    expect(readFileSync('src/instrumentation.ts', 'utf8')).toMatch(/export const onRequestError/)
  })
})
