import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Front v2 (Tarefa 7): a vitrine de /assinar é `features/assinatura/TelaPlanos`,
// que lê a matriz de `features/assinatura/matriz`.
import { BENEFICIOS_POR_NIVEL } from '@/features/assinatura/matriz'

let nivelNoTeste: 'GRATIS' | 'MVP' | 'ALL_STAR' = 'GRATIS'
let modalidadeNoTeste: 'MENSAL' | 'TEMPORADA' | null = null
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: '00000000-0000-4000-8000-000000000001', email: 'x@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return {
    avaliarAcesso: async () => ({ ...acessoDeTeste(nivelNoTeste), modalidade: modalidadeNoTeste }),
  }
})
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

beforeAll(() => {
  // Cadastro público abre por padrão (spec de planos, §7); a config falha
  // alto sem APP_PUBLIC_URL, e /assinar a lê no render.
  vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

// Front v2 (Tarefa 12): `ConviteDoPlano` e `JogosDoDia` eram peças da home
// antiga do grátis. O que eles garantiam vive na fumaça da Lista do v2
// (`features/lista/__tests__/fumaca.test.tsx`): o convite volta para a tela de
// origem com `?nivel=…&voltar=…`, e o grátis recebe só os jogos do dia — nenhum
// campo de item do feed no dado, nenhum jogadorId no HTML.

describe('a página /assinar como comparação', () => {
  it('lista os três níveis com os benefícios da matriz e destaca o pedido em ?nivel=', async () => {
    nivelNoTeste = 'GRATIS'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ nivel: 'ALL_STAR', voltar: '/fire-live' }) }),
    )
    // Front v2 (Tarefa 7): o "(em breve)" do texto vira uma etiqueta "em breve"
    // colada no benefício — a promessa continua dizendo a verdade.
    for (const beneficio of [...BENEFICIOS_POR_NIVEL.MVP, ...BENEFICIOS_POR_NIVEL.ALL_STAR]) {
      const emBreve = beneficio.endsWith(' (em breve)')
      const textoVisivel = beneficio.replace(' (em breve)', '')
      expect(html).toContain(emBreve ? `${textoVisivel}<span` : textoVisivel)
      if (emBreve) expect(html).toMatch(new RegExp(`${textoVisivel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<span[^>]*>em breve<`))
    }
    expect(html).toContain('Grátis')
    expect(html).toContain('All Star')
    // Front v2 (Tarefa 7): o plano PEDIDO em ?nivel= é o destacado
    // (`data-destaque`); `aria-current` passou a marcar o plano ATUAL da pessoa
    // ("Seu plano") — que é o que o atributo significa.
    expect(html).toMatch(/data-destaque="true"[^>]*aria-labelledby="plano-ALL_STAR"/)
    expect(html.match(/data-destaque="true"/g) ?? []).toHaveLength(1)
    expect(html).toMatch(/aria-current="true"[^>]*>Grátis</)
    expect(html).toMatch(/href="\/fire-live"/)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('quem já tem nível NÃO é redirecionado — a comparação é para todo mundo', async () => {
    nivelNoTeste = 'MVP'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('All Star')
  })
})

/**
 * `caminhoDeVolta` não é exportada — a única superfície é o `href` do link
 * "Voltar" na página renderizada. Validar por prefixo (`startsWith('/') &&
 * !startsWith('//')`) deixava passar `/\evil.com`: o segundo caractere é
 * `\`, não `/`, então o teste de `//` não pega, mas o parser de URL do
 * navegador trata `\` como `/` em esquemas http — o link vira
 * `https://evil.com`. A correção resolve o valor contra uma origem
 * descartável e só aceita o que continuar nela.
 */
describe('o link "Voltar" — só caminho interno volta', () => {
  const casos: [string | undefined, string][] = [
    ['/gestao', '/gestao'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'], // barra invertida: o caso que a validação por prefixo deixava passar
    ['\\\\evil.com', '/'],
    ['/../admin', '/admin'],
    // Fix round 1 da Tarefa 7: a normalização do caminho acontece DEPOIS da
    // checagem de origem — `/.//evil.com` resolve para o pathname `//evil.com`
    // com a origem ainda "interna", e o `href` sairia protocol-relative.
    ['/.//evil.com', '/'],
    ['/..//evil.com', '/'],
    ['/a/..//evil.com', '/'],
    ['x/..//evil.com', '/'],
    ['/./\\evil.com', '/'],
    ['/a\\b', '/'],
    ['/a\u0000b', '/'],
    ['/a\tb', '/'],
    ['', '/'],
    [undefined, '/'],
  ]

  it.each(casos)('voltar=%j vira href=%j', async (bruto, esperado) => {
    nivelNoTeste = 'GRATIS'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const parametros: Record<string, string> = {}
    if (bruto !== undefined) parametros.voltar = bruto
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }))
    const casamento = html.match(/href="([^"]*)">Voltar<\/a>/)
    expect(casamento?.[1]).toBe(esperado)
  })
})

describe('BENEFICIOS_POR_NIVEL — a vitrine não promete o que a plataforma não entrega', () => {
  it('todo item de fora da plataforma aparece marcado', () => {
    // Escrito à mão de propósito: importar a lista do módulo faria o teste
    // comparar o arquivo consigo mesmo — foi assim que uma mutação que
    // apagou um "(em breve)" passou batido antes desta suíte.
    // 'live' sozinho bateria em "Fire Live" (feature real, entregue hoje) —
    // por isso os termos de "live" saem específicos o bastante para não
    // confundir o nome do produto com o benefício fora da plataforma.
    const foraDaPlataforma = [
      'Telegram',
      'comunidade',
      'live mensal',
      'lives semanais',
      'mentoria',
      'Reprises',
      'especialistas',
      'Acesso antecipado',
    ]
    for (const nivelDoPlano of ['MVP', 'ALL_STAR'] as const) {
      for (const beneficio of BENEFICIOS_POR_NIVEL[nivelDoPlano]) {
        const citado = foraDaPlataforma.some((assunto) =>
          beneficio.toLowerCase().includes(assunto.toLowerCase()),
        )
        if (citado) {
          expect(beneficio, `"${beneficio}" promete algo que a plataforma não entrega`).toContain(
            '(em breve)',
          )
        }
      }
    }
  })
})

/**
 * O SELETOR (spec §9).
 *
 * `nivelNoTeste` e o mock de `avaliarAcesso` já existem no topo deste
 * arquivo; aqui o acesso também precisa de MODALIDADE, porque é ela que
 * decide se a oferta de temporada aparece. O mock do topo passa a devolver
 * `acessoDeTeste(nivelNoTeste)` com a modalidade sobrescrita por
 * `modalidadeNoTeste`.
 */
describe('o seletor dos quatro SKUs', () => {
  const ENV_DE_VENDA = {
    MERCADOPAGO_CHECKOUT_ENABLED: 'true',
    PLANO_MVP_MENSAL_CENTAVOS: '5990',
    PLANO_MVP_MENSAL_DE_CENTAVOS: '7990',
    PLANO_MVP_TEMPORADA_CENTAVOS: '39700',
    PLANO_ALL_STAR_MENSAL_CENTAVOS: '9990',
    PLANO_ALL_STAR_MENSAL_DE_CENTAVOS: '14900',
    PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '59700',
    TEMPORADA_FIM: '2099-06-30',
  }

  beforeEach(() => {
    for (const [chave, valor] of Object.entries(ENV_DE_VENDA)) vi.stubEnv(chave, valor)
    nivelNoTeste = 'GRATIS'
    modalidadeNoTeste = null
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
  })

  async function renderizar(parametros: Record<string, string> = {}) {
    const { default: Pagina } = await import('../(app)/assinar/page')
    return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }))
  }

  /** Os SKUs que a página oferece, lidos do campo escondido de cada formulário. */
  function skusOferecidos(html: string): string[] {
    return [...html.matchAll(/name="sku" value="([A-Z_]+)"/g)].map((casamento) => casamento[1]!)
  }

  it('o grátis vê os quatro, com preço, e cada botão carrega o seu SKU', async () => {
    const html = await renderizar()

    expect(skusOferecidos(html).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
    // Os valores são escritos À MÃO aqui: derivá-los do env faria o teste
    // repetir a mesma conta que a página faz, e uma divisão trocada por
    // multiplicação passaria batida.
    expect(html).toContain('R$ 59,90')
    expect(html).toContain('R$ 397,00')
    expect(html).toContain('R$ 99,90')
    expect(html).toContain('R$ 597,00')
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('o preço "de" aparece só onde foi configurado', async () => {
    const html = await renderizar()
    expect(html).toContain('R$ 79,90')
    expect(html).toContain('R$ 149,00')
    // Temporada não tem "de": nada de riscar um preço que ninguém definiu.
    expect(html).not.toContain('R$ 497,00')
    // A asserção acima não basta: um componente que SEMPRE renderiza o `<s>` (por
    // exemplo com `preco.deCentavos ?? preco.centavos`) passaria batido, porque
    // riscaria as ofertas de temporada com o próprio preço cheio — nada de "R$ 497,00"
    // apareceria, mas um risco sem desconto real (anunciando promoção que não existe)
    // sobreviveria verde. Por isso conta-se quantos `<s>` existem no total: só
    // MVP_MENSAL e ALL_STAR_MENSAL têm "de" configurado no `ENV_DE_VENDA` desta suíte —
    // as duas ofertas de temporada não podem contribuir nenhum.
    const riscados = html.match(/<s /g) ?? []
    expect(riscados.length).toBe(2)
  })

  it('passada a data da temporada, só os mensais são oferecidos', async () => {
    vi.stubEnv('TEMPORADA_FIM', '2020-06-30')
    const html = await renderizar()
    expect(skusOferecidos(html).sort()).toEqual(['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort())
  })

  it('quem é MVP mensal não vê o próprio plano à venda', async () => {
    nivelNoTeste = 'MVP'
    modalidadeNoTeste = 'MENSAL'
    const html = await renderizar()
    expect(skusOferecidos(html)).not.toContain('MVP_MENSAL')
    expect(skusOferecidos(html).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('para quem já paga, a tela avisa ANTES de cobrar que o plano atual acaba sem devolução', async () => {
    nivelNoTeste = 'MVP'
    modalidadeNoTeste = 'MENSAL'
    const html = await renderizar()
    expect(html).toMatch(/encerrad|substitu/i)
    expect(html).toMatch(/sem devolu/i)
    // A presença sozinha não prova a regra da spec §9 ("depois de cobrar, avisar já não
    // é avisar"): mover o bloco do aviso para depois dos botões deixaria as duas
    // asserções acima igualmente verdes, porque elas só checam que o texto existe em
    // algum lugar do HTML, não ONDE. A ordem é o que importa — por isso comparamos a
    // posição do aviso com a do primeiro campo de SKU (o primeiro botão de compra).
    // Primeiro confirma-se que as duas substrings realmente existem: um `indexOf` que
    // devolvesse -1 (não encontrado) passaria a comparação `-1 < posSku` por acidente,
    // sem provar nada sobre ordem.
    const posAviso = html.indexOf('sem devolu')
    const posSku = html.indexOf('name="sku"')
    expect(posAviso).toBeGreaterThanOrEqual(0)
    expect(posSku).toBeGreaterThanOrEqual(0)
    expect(posAviso).toBeLessThan(posSku)
  })

  it('para o grátis não há aviso de substituição — não há o que substituir', async () => {
    const html = await renderizar()
    expect(html).not.toMatch(/sem devolu/i)
  })

  it('quem já está no topo não vê botão nenhum, e a tela explica', async () => {
    nivelNoTeste = 'ALL_STAR'
    modalidadeNoTeste = 'TEMPORADA'
    const html = await renderizar()
    expect(skusOferecidos(html)).toEqual([])
    // O texto não pode afirmar "você está no topo": a mesma tela vazia também aparece
    // para quem NÃO está no topo (MVP/All Star temporada depois que a janela fecha —
    // "temporada não volta para mensal" bloqueia o único caminho de baixo, e a
    // temporada some do cardápio). A explicação certa é sobre o que se SABE (não há o
    // que vender agora), não sobre uma posição que não foi verificada.
    expect(html).toMatch(/n[ãa]o h[áa] plano.*acima/i)
  })

  it('com o checkout desligado, a comparação continua e ninguém compra', async () => {
    vi.stubEnv('MERCADOPAGO_CHECKOUT_ENABLED', 'false')
    const html = await renderizar()
    expect(skusOferecidos(html)).toEqual([])
    expect(html).toContain('em breve')
    // A comparação é o valor da página mesmo sem venda.
    expect(html).toContain('All Star')
  })

  it('o erro devolvido pela ação vira mensagem, e só os códigos conhecidos', async () => {
    expect(await renderizar({ erro: 'limite' })).toContain('Muitas tentativas')
    // Um link forjado com `?erro=<qualquer coisa>` não pode virar texto dentro da
    // página — só os códigos conhecidos ('limite') viram mensagem; qualquer outro cai
    // no "checkout indisponível" fixo. Num app que leva a uma casa de apostas, texto de
    // atacante aparecendo dentro de um alerta da própria NIP é o vetor.
    // O marcador precisa ser uma string que não exista em NENHUM lugar do repositório —
    // 'alerta' colidia com a copy legítima "Dois filtros de alerta no Telegram" em
    // matriz.ts (mesma armadilha de um teste anterior que usou 'live' e bateu em "Fire
    // Live"), então o teste falhava por um motivo que nada tinha a ver com o que estava
    // sob prova. 'xyzzy-forjado' foi conferida com `grep -rn` antes de usar.
    const forjado = await renderizar({ erro: '<script>xyzzy-forjado</script>' })
    expect(forjado).not.toContain('xyzzy-forjado')
  })
})
