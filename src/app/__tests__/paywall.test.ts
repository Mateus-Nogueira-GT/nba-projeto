import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ler = (caminho: string) => readFileSync(caminho, 'utf8')

describe('superfícies da Spec 04', () => {
  it('fecha o feed antes de consultar o snapshot pago', () => {
    const fonte = ler('src/app/(app)/page.tsx')
    const sessao = fonte.indexOf('if (!sessao) redirect')
    const direito = fonte.indexOf('if (!acesso.permitido) redirect')
    const feed = fonte.indexOf('await lerFeed')
    expect(sessao).toBeGreaterThan(0)
    expect(direito).toBeGreaterThan(sessao)
    expect(feed).toBeGreaterThan(direito)
  })

  it('retorno não usa query do navegador como prova de pagamento', () => {
    const fonte = ler('src/app/(app)/retorno/mercadopago/page.tsx')
    expect(fonte).not.toContain('searchParams')
    expect(fonte).toContain('avaliarAcesso')
    expect(fonte).not.toMatch(/status.*searchParams|payment_id|preference_id/)
  })

  it('webhook usa corpo bruto, headers e query; cron de reconciliação está agendado', async () => {
    const webhook = ler('src/app/api/webhook/mercadopago/route.ts')
    expect(webhook).toContain('requisicao.text()')
    expect(webhook).toContain('requisicao.headers.entries()')
    expect(webhook).toContain('new URL(requisicao.url).searchParams.entries()')

    const { config } = await import('../../../vercel')
    expect(config.crons).toContainEqual({
      path: '/api/cron/reconciliar-pagamentos',
      schedule: '*/10 * * * *',
    })
  })

  it('nenhuma página paga opta por cache compartilhado', () => {
    for (const caminho of [
      'src/app/(app)/page.tsx',
      'src/app/(app)/assinar/page.tsx',
      'src/app/(app)/conta/page.tsx',
      'src/app/(app)/retorno/mercadopago/page.tsx',
    ]) {
      expect(ler(caminho)).not.toContain("'use cache'")
    }
  })
})
