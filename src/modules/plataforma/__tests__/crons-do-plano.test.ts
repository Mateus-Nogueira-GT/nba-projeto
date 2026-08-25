import { describe, expect, it, vi } from 'vitest'

type Cron = { path: string; schedule: string }

/**
 * Reavalia `vercel.ts` sob um env específico. `config` é montado no import,
 * então cada cenário precisa de um módulo novo.
 */
async function cronsCom(env: Record<string, string | undefined>): Promise<Cron[]> {
  const anterior = { ...process.env }
  for (const [chave, valor] of Object.entries(env)) {
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  try {
    vi.resetModules()
    const { config } = await import('../../../../vercel')
    return (config.crons ?? []) as Cron[]
  } finally {
    process.env = anterior
  }
}

const ehDiario = (schedule: string) => /^\d+ \d+ \* \* \*$/.test(schedule)

describe('crons declarados no vercel.ts', () => {
  it('por PADRÃO declara só crons diários — é o que o plano Hobby aceita', async () => {
    // O build disparado pelo Git não passa pelos scripts do package.json: ele
    // lê o env do PROJETO. Com o padrão invertido (completo só por opt-in), um
    // deploy pelo Git nasce válido sem depender de variável no painel.
    // Foi assim que um deploy morreu: "Hobby accounts are limited to daily
    // cron jobs. This cron expression (0 */6 * * *) would run more than once
    // per day."
    const crons = await cronsCom({ CRON_COMPLETO: undefined })

    expect(crons.length).toBeGreaterThan(0)
    expect(crons.every((c) => ehDiario(c.schedule))).toBe(true)
    // Decisão de 25/08: dos dois diários que o Hobby permite, um é o
    // re-seed da DEMONSTRAÇÃO. Sem provedor conectado, `sincronizar-elenco`
    // não faz nada — e a demo abrindo "Sem jogos hoje" na frente do cliente
    // custa mais do que um job que não tem de onde sincronizar.
    expect(crons.map((c) => c.path)).toEqual([
      '/api/cron/sincronizar-rodada',
      '/api/cron/demo',
    ])
  })

  it('o re-seed da demo NÃO existe no conjunto completo — Pro não semeia demonstração', async () => {
    const crons = await cronsCom({ CRON_COMPLETO: 'true' })
    expect(crons.map((c) => c.path)).not.toContain('/api/cron/demo')
    // e os dois jobs de sincronização voltam inteiros
    expect(crons.map((c) => c.path)).toContain('/api/cron/sincronizar-elenco')
  })

  it('CRON_COMPLETO=true libera o conjunto inteiro, incluindo o gatilho do Fire Live', async () => {
    // O opt-in é o que a conta Pro liga. Sem `ao-vivo` a cada minuto não existe
    // Fire Live (ADR-0003) — por isso o conjunto completo precisa continuar
    // alcançável, e testado.
    const crons = await cronsCom({ CRON_COMPLETO: 'true' })

    expect(crons.some((c) => c.path === '/api/cron/ao-vivo' && c.schedule === '* * * * *')).toBe(
      true,
    )
    expect(crons.filter((c) => !ehDiario(c.schedule)).length).toBeGreaterThan(0)
    expect(crons.length).toBeGreaterThan(2)
  })
})
