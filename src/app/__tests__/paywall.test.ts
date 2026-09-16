import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const ler = (caminho: string) => readFileSync(caminho, 'utf8')

describe('superfícies da Spec 04', () => {
  it('fecha o feed antes de consultar o snapshot pago', () => {
    // A guarda agora é em DOIS tempos: `exigirNivel('GRATIS', ...)` só exige
    // sessão (quem não está logado vai para /entrar) e devolve o `acesso`; é
    // o `atende(acesso.nivel, 'MVP')` logo depois que decide se a home é a do
    // grátis ou a paga. O que esta suíte trava não mudou — o portão do sinal
    // vem ANTES da leitura do snapshot pago.
    const fonte = ler('src/app/(app)/page.tsx')
    const sessao = fonte.indexOf("exigirNivel('GRATIS'")
    const direito = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const feed = fonte.indexOf('await lerFeed')
    expect(sessao).toBeGreaterThan(0)
    expect(direito).toBeGreaterThan(sessao)
    expect(feed).toBeGreaterThan(direito)
  })

  it('o Fire Live também fecha antes de ler o feed do 1º quarto', () => {
    // Mesma trava da home, e por um motivo mais caro: o Fire Live é o produto
    // mais pesado de rodar (spec, decisão 6). Sem esta asserção, um refactor
    // que subisse `lerFeedFireLive` para antes do portão faria a NIP pagar o
    // loop do 1º quarto para quem não assina, sem nada ficar vermelho —
    // provado por mutação na revisão de 16/09.
    const fonte = ler('src/app/(app)/fire-live/page.tsx')
    const portao = fonte.indexOf("exigirNivel('GRATIS'")
    const portaoDeNivel = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const feed = fonte.indexOf('lerFeedFireLive(')
    expect(portao).toBeGreaterThan(0)
    expect(portaoDeNivel).toBeGreaterThan(portao)
    expect(feed).toBeGreaterThan(portaoDeNivel)
  })

  it('retorno não usa query do navegador como prova de pagamento', () => {
    const fonte = ler('src/app/(app)/retorno/mercadopago/page.tsx')
    expect(fonte).not.toContain('searchParams')
    expect(fonte).toContain('exigirNivel')
    expect(fonte).not.toMatch(/status.*searchParams|payment_id|preference_id/)
  })

  it('webhook usa corpo bruto, headers e query; cron de reconciliação está agendado', async () => {
    const webhook = ler('src/app/api/webhook/mercadopago/route.ts')
    expect(webhook).toContain('requisicao.text()')
    expect(webhook).toContain('requisicao.headers.entries()')
    expect(webhook).toContain('new URL(requisicao.url).searchParams.entries()')

    // O conjunto COMPLETO é o de produção — o padrão do `vercel.ts` passou a
    // ser só o diário, porque o plano Hobby recusa cron sub-diário e o deploy
    // pelo Git não passa pelos scripts do package.json. A exigência da Spec 04
    // não mudou: em produção este cron existe, e é isso que se afirma aqui.
    // Ver `crons-do-plano.test.ts`, que trava os dois lados da flag.
    const anterior = process.env.CRON_COMPLETO
    process.env.CRON_COMPLETO = 'true'
    try {
      vi.resetModules()
      const { config } = await import('../../../vercel')
      expect(config.crons).toContainEqual({
        path: '/api/cron/reconciliar-pagamentos',
        schedule: '*/10 * * * *',
      })
    } finally {
      if (anterior === undefined) delete process.env.CRON_COMPLETO
      else process.env.CRON_COMPLETO = anterior
    }
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
