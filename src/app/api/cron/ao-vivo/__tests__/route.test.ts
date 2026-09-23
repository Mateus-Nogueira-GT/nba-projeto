import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  executarJobComLease: vi.fn(),
  reservarJogosParaObservar: vi.fn(),
  iniciarWorkflowsReservados: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag, unstable_cache: (fn: unknown) => fn }))
vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('@/workflows/fire-live', () => ({ fireLiveDoJogo: vi.fn() }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('@/modules/ingestao/jobs/contexto', () => ({
  contextoDoJob: async () => ({ agora: new Date('2026-11-04T01:00:00Z'), ruleset: { rodada: { fuso: 'America/New_York' } }, temporada: '2026-27', config: {} }),
}))
vi.mock('@/modules/ingestao/sincronizar/fonte', () => ({ montarFontes: () => ({}) }))
vi.mock('@/modules/ingestao/jobs/execucao', () => ({ executarJobComLease: m.executarJobComLease }))
vi.mock('@/modules/ingestao/jobs/orquestradores', () => ({
  dataReferenciaNba: () => '2026-11-03',
  executarJobAoVivo: vi.fn(),
}))
vi.mock('@/modules/entrega/fire-live/inicio', () => ({
  reservarJogosParaObservar: m.reservarJogosParaObservar,
  iniciarWorkflowsReservados: m.iniciarWorkflowsReservados,
}))
vi.mock('@/modules/entrega/cron/guarda', () => ({
  executarCronProtegido: async (_r: Request, o: { tarefa: () => Promise<unknown> }) => {
    try {
      return Response.json(await o.tarefa())
    } catch (erro) {
      return Response.json({ erro: String(erro) }, { status: 500 })
    }
  },
}))

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  m.reservarJogosParaObservar.mockResolvedValue([])
  m.iniciarWorkflowsReservados.mockResolvedValue({ iniciados: [], obsoletos: [], falhas: [] })
})

describe('cron ao-vivo', () => {
  it('ingestão falhando NÃO impede reservar e iniciar o Fire Live; a falha ainda aparece', async () => {
    m.executarJobComLease.mockRejectedValue(new Error('BDL 502'))
    const r = await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.reservarJogosParaObservar).toHaveBeenCalled()
    expect(m.iniciarWorkflowsReservados).toHaveBeenCalled()
    expect(r.status).toBe(500)
  })

  it('ingestão que gravou algo invalida a lateral', async () => {
    m.executarJobComLease.mockResolvedValue({ executado: true, execucaoId: 'e', resultado: { snapshots: 3 } })
    await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.revalidateTag).toHaveBeenCalledWith('lateral', 'max')
  })

  it('ingestão sem nada gravado não invalida', async () => {
    m.executarJobComLease.mockResolvedValue({ executado: true, execucaoId: 'e', resultado: { snapshots: 0 } })
    await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})
