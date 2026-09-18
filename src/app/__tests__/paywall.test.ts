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

  it('a silhueta do paywall não recebe dado: a única prop é a forma', () => {
    // O StatsHub borra as próprias linhas. Aqui isso não pode ser feito assim:
    // desfoque é CSS, e o conteúdo real estaria no código-fonte de quem não
    // paga. A silhueta é forma pura, e é este teste que a mantém assim.
    const fonte = ler('src/components/planos/SilhuetaPaga.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    // A assinatura é o contrato: `forma` diz o DESENHO e `children` é o
    // convite. Nenhuma prop de dado, e nenhuma forma de receber uma.
    expect(fonte).toContain(
      '{ forma, children }: { forma: FormaDaSilhueta; children?: ReactNode }',
    )
    // E a quantidade de blocos é FIXA por forma: quantos apitos há hoje
    // também é sinal, e uma silhueta que variasse com a rodada o contaria.
    expect(fonte).toContain('const BLOCOS: Record<FormaDaSilhueta, number>')
  })

  it('a lateral só lê dado grátis, e o cron da rodada revalida a tag dela', () => {
    // A lateral é cacheada e COMPARTILHADA entre usuários. Isso só é seguro
    // porque ela lê apenas o que é grátis para todos os níveis (Resultados e
    // classificação — spec de planos, decisões 9 e 5). Se um dia alguém
    // acrescentar o feed aqui, o cache passa a servir sinal pago a quem não
    // paga, sem nada ficar vermelho — e é esta asserção que fecha essa porta.
    const leitor = ler('src/modules/entrega/lateral.ts')
    expect(leitor).not.toMatch(/lerFeed|lerFeedFireLive|\bapitos\b|narrativa|confianca/)

    const cache = ler('src/app/(app)/lateral/leitura.ts')
    expect(cache).toContain('tags: [TAG_LATERAL]')

    // E o dado tem que ENVELHECER quando muda: é o cron da rodada que fecha o
    // box score da noite e sincroniza a classificação.
    expect(ler('src/app/api/cron/sincronizar-rodada/route.ts')).toContain(
      "revalidateTag(TAG_LATERAL, 'max')",
    )
  })

  it('a lateral entra DEPOIS do portão de nível, nunca antes', () => {
    // Ela não lê nada pago, mas montá-la antes do `atende` inverteria a ordem
    // que esta suíte inteira existe para preservar, e o próximo a mexer aqui
    // leria isso como permissão.
    for (const caminho of ['src/app/(app)/page.tsx', 'src/app/(app)/fire-live/page.tsx']) {
      const fonte = ler(caminho)
      expect(fonte.indexOf('lateralPadrao({')).toBeGreaterThan(
        fonte.indexOf("atende(acesso.nivel, 'MVP')"),
      )
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
