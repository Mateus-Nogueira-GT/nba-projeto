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
    //
    // Front v2 (Tarefa 3): a página só monta a tela; quem lê é
    // `features/lista/carregar.ts`, e é nele que a ordem é conferida — pelo
    // cache (`lerFeedCacheado`), nunca pelo `lerFeed` cru. A página não pode
    // ter leitura própria que escape desta ordem.
    const fonte = ler('src/features/lista/carregar.ts')
    const sessao = fonte.indexOf("exigirNivel('GRATIS'")
    const direito = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const feed = fonte.indexOf('lerFeedCacheado(')
    expect(sessao).toBeGreaterThan(0)
    expect(direito).toBeGreaterThan(sessao)
    expect(feed).toBeGreaterThan(direito)
    expect(fonte).not.toMatch(/[^a-zA-Z]lerFeed\(/)
    const pagina = ler('src/app/(app)/page.tsx')
    expect(pagina).toContain('carregarLista(')
    expect(pagina).not.toMatch(/lerFeed|linhasDoJogador|getDb/)
  })

  it('o Fire Live também fecha antes de ler o feed do 1º quarto', () => {
    // Mesma trava da home, e por um motivo mais caro: o Fire Live é o produto
    // mais pesado de rodar (spec, decisão 6). Sem esta asserção, um refactor
    // que subisse `lerFeedFireLive` para antes do portão faria a NIP pagar o
    // loop do 1º quarto para quem não assina, sem nada ficar vermelho —
    // provado por mutação na revisão de 16/09.
    //
    // Front v2 (Tarefa 4): quem lê é `features/ao-vivo/carregar.ts`. As duas
    // leituras pagas (o feed do 1º quarto e a Lista do dia, que dá a contagem
    // de alvos aguardando) vêm DEPOIS do `atende`; a Lista, pelo cache.
    const fonte = ler('src/features/ao-vivo/carregar.ts')
    const portao = fonte.indexOf("exigirNivel('GRATIS'")
    const portaoDeNivel = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const feed = fonte.indexOf('lerFeedFireLive(')
    const lista = fonte.indexOf('lerFeedCacheado(')
    expect(portao).toBeGreaterThan(0)
    expect(portaoDeNivel).toBeGreaterThan(portao)
    expect(feed).toBeGreaterThan(portaoDeNivel)
    expect(lista).toBeGreaterThan(portaoDeNivel)
    expect(fonte).not.toMatch(/[^a-zA-Z]lerFeed\(/)
    // A página só monta a tela: nenhuma leitura própria escapa desta ordem.
    const pagina = ler('src/app/(app)/fire-live/page.tsx')
    expect(pagina).toContain('carregarAoVivo(')
    expect(pagina).not.toMatch(/lerFeed|getDb/)
  })

  it('retorno não usa query do navegador como prova de pagamento', () => {
    // Front v2 (Tarefa 7): a página do v2 LÊ `searchParams` — para uma coisa
    // só: `estado=processando`, que a nossa ação de checkout põe na volta e
    // que SEGURA o "confirmado" de quem já era pago e está fazendo upgrade.
    // Proibir a palavra às cegas barraria esse uso legítimo; o risco real é
    // outro — a query CONCEDER ou AFIRMAR pagamento. É isso que se trava:
    //  1. o direito vem de `exigirNivel` (o servidor, a partir do webhook);
    //  2. o único parâmetro lido é `estado`, e ele só entra NEGADO na
    //     condição do "confirmado" (só pode tirar, nunca dar);
    //  3. nada do que o Mercado Pago põe na volta é lido, e a página não
    //     escreve nada (nem banco, nem direito).
    // A fumaça (`features/assinatura/__tests__/fumaca.test.tsx`) prova o
    // mesmo pelo HTML, com a query forjada de "aprovado".
    const fonte = ler('src/app/(app)/retorno/mercadopago/page.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(fonte).toContain("exigirNivel('GRATIS'")
    // Fix round 1: independente do NOME da variável. `searchParams` aparece
    // só na assinatura (desestruturação + tipo) e num único ponto de leitura,
    // que o amarra a `p`; `p` não é repassado nem desestruturado; e dele só
    // se lê `estado`. Um `const { status } = await searchParams` ou um
    // `q.status` acrescentaria uma ocorrência de `searchParams` ou de `status`
    // e ficaria vermelho.
    expect(fonte.match(/\bsearchParams\b/g) ?? []).toHaveLength(3)
    expect(fonte).toMatch(/searchParams,\s*\}\s*:\s*\{\s*searchParams: Promise</)
    expect(fonte).toContain("const [{ acesso }, p] = await Promise.all([exigirNivel('GRATIS', '/conta'), searchParams])")
    // (Tags `<p>`/`</p>` não contam: são JSX, não a variável.)
    const usos = [...fonte.matchAll(/(?<![<\/])\bp\b/g)].map((m) => fonte.slice(m.index, m.index + 9))
    expect(usos).toEqual(['p] = awai', 'p.estado)'])
    expect(fonte).not.toMatch(/\bstatus\b/)
    expect(fonte).toContain("const processando = parametro(p.estado) === 'processando'")
    expect(fonte).toContain("const confirmado = acesso.nivel !== 'GRATIS' && !processando")
    expect(fonte.match(/processando/g) ?? []).toHaveLength(3) // declaração, comparação, negação
    expect(fonte).not.toMatch(/payment_id|preference_id|preapproval|collection_status|approved/)
    expect(fonte).not.toMatch(/getDb|insert\(|update\(|concederCortesia|registrar|nivel\s*=/)
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

  it('as silhuetas do paywall não recebem dado: a única prop é a forma', () => {
    // O StatsHub borra as próprias linhas. Aqui isso não pode ser feito assim:
    // desfoque é CSS, e o conteúdo real estaria no código-fonte de quem não
    // paga. A silhueta é forma pura, e é este teste que a mantém assim.
    //
    // Front v2 (Tarefa 12): são DUAS — a do Ao Vivo (sem prop nenhuma) e a das
    // seções fundas de Estatísticas (`forma` diz o DESENHO; `recurso` e
    // `voltar` são o convite). Nenhuma prop de dado, e nenhuma forma de
    // receber uma. E a quantidade de blocos é FIXA por forma: quantos apitos
    // há hoje também é sinal, e uma silhueta que variasse com a rodada o
    // contaria.
    const semComentarios = (fonte: string) =>
      fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    const aoVivo = semComentarios(ler('src/features/ao-vivo/SilhuetaPaga.tsx'))
    expect(aoVivo).toContain('export function SilhuetaPaga() {')
    expect(aoVivo).toContain('{[0, 1].map((i) => (')

    const estatisticas = semComentarios(ler('src/features/estatisticas/Comum.tsx'))
    const silhueta = estatisticas.slice(estatisticas.indexOf('export function Silhueta('))
    const assinatura = silhueta.slice(0, silhueta.indexOf('}) {'))
    expect(assinatura).toContain("forma: 'tabela' | 'cards' | 'numeros'")
    expect(assinatura).toContain('recurso: string')
    expect(assinatura).toContain('voltar: string')
    expect(assinatura).not.toMatch(/itens|linhas|dados|feed|apitos|children/)
    expect(silhueta).toContain("const blocos = forma === 'cards' ? 3 : 6")
  })

  it('a lateral só lê dado grátis, e o cron da rodada revalida a tag dela', () => {
    // A lateral é cacheada e COMPARTILHADA entre usuários. Isso só é seguro
    // porque ela lê apenas o que é grátis para todos os níveis (Resultados e
    // classificação — spec de planos, decisões 9 e 5). Se um dia alguém
    // acrescentar o feed aqui, o cache passa a servir sinal pago a quem não
    // paga, sem nada ficar vermelho — e é esta asserção que fecha essa porta.
    const leitor = ler('src/modules/entrega/lateral.ts')
    expect(leitor).not.toMatch(/lerFeed|lerFeedFireLive|\bapitos\b|narrativa|confianca/)

    const cache = ler('src/app/_cache/lateral.ts')
    expect(cache).toContain('tags: [TAG_LATERAL]')

    // E o dado tem que ENVELHECER quando muda: é o cron da rodada que fecha o
    // box score da noite e sincroniza a classificação.
    expect(ler('src/app/api/cron/sincronizar-rodada/route.ts')).toContain(
      "revalidateTag(TAG_LATERAL, 'max')",
    )
  })

  it('o detalhe do apito exige MVP antes de ler o feed, pelas DUAS portas', () => {
    // Página cheia e painel interceptado chamam o mesmo `carregarApito`; o
    // portão é a primeira linha dele. As páginas não leem nada por conta própria.
    const fonte = ler('src/features/apito/carregar.ts')
    const portao = fonte.indexOf("await exigirNivel('MVP'")
    expect(portao).toBeGreaterThan(0)
    expect(fonte.indexOf('lerFeedCacheado(')).toBeGreaterThan(portao)
    expect(fonte.indexOf('lerFeedFireLive(')).toBeGreaterThan(portao)
    expect(fonte).not.toMatch(/[^a-zA-Z](lerFeed|linhasDoJogador)\(/)
    for (const pagina of [
      'src/app/(app)/apito/[jogadorId]/page.tsx',
      'src/app/(app)/@painel/(.)apito/[jogadorId]/page.tsx',
    ]) {
      const fontePagina = ler(pagina)
      expect(fontePagina, pagina).toContain('carregarApito(')
      expect(fontePagina, pagina).not.toMatch(/lerFeed|linhasDoJogador|getDb/)
    }
  })

  it('a coluna da direita da Lista lê o feed só DEPOIS do portão, e pelo cache', () => {
    // No front v2 a coluna da Lista é o `ResumoDaRodada` (slot `@painel`), que
    // mostra os turbos do dia — dado PAGO. Ele passa pelo portão sozinho, porque
    // um slot paralelo renderiza independente da página.
    const fonte = ler('src/features/lista/ResumoDaRodada.tsx')
    const sessao = fonte.indexOf("exigirNivel('GRATIS'")
    const direito = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const feed = fonte.indexOf('lerFeedCacheado(')
    expect(sessao).toBeGreaterThan(0)
    expect(direito).toBeGreaterThan(sessao)
    expect(feed).toBeGreaterThan(direito)
    expect(fonte).toContain('assinante ? lerFeedCacheado(hoje) : null')
  })

  it('a Gestão decide o nível ANTES de ler o plano do dia (o feed), e a ação confere de novo', () => {
    // Front v2 (Tarefa 6): o plano do dia é montado sobre o feed — sinal pago.
    // O carregador só o lê para quem registra (MVP+); o grátis recebe um plano
    // vazio e vê a silhueta. Registrar é conferido de novo no servidor, porque
    // um POST direto nunca passa pela tela.
    const fonte = ler('src/features/gestao/carregar.ts')
    const sessao = fonte.indexOf("exigirNivel('GRATIS', '/gestao')")
    const direito = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const plano = fonte.indexOf('planoDoDia(')
    expect(sessao).toBeGreaterThan(0)
    expect(direito).toBeGreaterThan(sessao)
    expect(plano).toBeGreaterThan(direito)
    expect(fonte).toMatch(/registra\s*\?\s*await planoDoDia\(/)
    const acao = ler('src/features/gestao/acoes.ts')
    expect(acao.indexOf("atende(acesso.nivel, 'MVP')")).toBeGreaterThan(0)
    expect(acao.indexOf('registrarEntradaRealizada(')).toBeGreaterThan(acao.indexOf("atende(acesso.nivel, 'MVP')"))
  })

  it('a lateral entra DEPOIS do portão de nível, nunca antes', () => {
    // Ela não lê nada pago, mas montá-la antes do `atende` inverteria a ordem
    // que esta suíte inteira existe para preservar, e o próximo a mexer aqui
    // leria isso como permissão. (A Lista saiu desta lista na Tarefa 3: a
    // coluna dela é o resumo, conferido no caso acima.)
    //
    // Front v2 (Tarefa 4): no Ao Vivo a coluna saiu da página e virou o slot
    // `@painel/fire-live`. Ela continua depois do portão (o `exigirNivel` do
    // slot vem antes de desenhar a coluna) e não lê nada pago.
    //
    // Front v2 (Tarefa 6): Gestão e Resultados ganharam o mesmo slot.
    for (const caminho of [
      'src/app/(app)/@painel/fire-live/page.tsx',
      'src/app/(app)/@painel/gestao/page.tsx',
      'src/app/(app)/@painel/resultados/[data]/page.tsx',
    ]) {
      const painel = ler(caminho)
      expect(painel.indexOf("exigirNivel('GRATIS'"), caminho).toBeGreaterThan(0)
      expect(painel.indexOf('<LateralDaRodada'), caminho).toBeGreaterThan(painel.indexOf("exigirNivel('GRATIS'"))
      expect(painel, caminho).not.toMatch(/lerFeed|linhasDoJogador/)
    }
    expect(ler('src/features/lateral/LateralDaRodada.tsx')).not.toMatch(/lerFeed|linhasDoJogador/)
    expect(ler('src/app/(app)/fire-live/page.tsx')).not.toContain('lateralPadrao')
  })

  it('nenhuma página paga opta por cache compartilhado', () => {
    for (const caminho of [
      'src/app/(app)/page.tsx',
      'src/features/lista/carregar.ts',
      'src/features/lista/ResumoDaRodada.tsx',
      'src/app/(app)/@painel/page.tsx',
      'src/app/(app)/apito/[jogadorId]/page.tsx',
      'src/app/(app)/@painel/(.)apito/[jogadorId]/page.tsx',
      'src/features/apito/carregar.ts',
      'src/app/(app)/fire-live/page.tsx',
      'src/features/ao-vivo/carregar.ts',
      'src/app/(app)/@painel/fire-live/page.tsx',
      'src/app/(app)/gestao/page.tsx',
      'src/features/gestao/carregar.ts',
      'src/app/(app)/@painel/gestao/page.tsx',
      'src/app/(app)/assinar/page.tsx',
      'src/app/(app)/conta/page.tsx',
      'src/app/(app)/retorno/mercadopago/page.tsx',
    ]) {
      expect(ler(caminho)).not.toContain("'use cache'")
    }
  })
})
