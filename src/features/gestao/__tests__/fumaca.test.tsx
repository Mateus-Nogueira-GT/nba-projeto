import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, usuarios } from '@/modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { registrarEntradaRealizada } from '@/modules/entrega/gestao-realizadas'
import { agruparPorJogador, lerFeed } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { LLMFake } from '@/modules/ingestao/llm'
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * FUMAÇA DA GESTÃO DO V2 — ligada ao NOSSO back.
 *
 * A página de verdade (`src/app/(app)/gestao/page.tsx` → `features/gestao`)
 * e a AÇÃO de verdade (`features/gestao/acoes.ts`) sobre um PGlite semeado
 * pela temporada simulada (30 dias: a janela inteira do "Seu mês"). Sessão e
 * acesso são simulados e o nível é MUTÁVEL (`nivelDoTeste`).
 *
 * Regra de ouro das suítes de tela: NENHUMA asserção nomeia jogador, time ou
 * horário — o sujeito é lido do banco.
 *
 * Herda as invariantes de `telas-05-gestao.test.ts` (aposentado com a tela
 * antiga) e os casos de gestão de `telas-demo.test.ts` e de
 * `escrita-identidade-04.test.ts`: cada caso diz de onde veio.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'
/** Um segundo usuário, só para o "Seu mês" com 30 dias de registro. */
const VETERANO = '00000000-0000-4000-8000-000000000002'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelDoTeste: NivelDoPlano = 'MVP'
let sessaoDoTeste: { usuarioId: string; email: string } | null = { usuarioId: USUARIO, email: 'demo@teste.com' }
let itensDeHoje: ItemFeed[] = []
/** Quantos registros o veterano tem na janela de 30 dias. */
let registrosDoVeterano = 0
const chamadasDoPlano: string[] = []

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => (sessaoDoTeste ? 'token-de-teste' : null),
  sessaoAtual: async () => sessaoDoTeste,
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelDoTeste) }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))
// O plano do dia lê o FEED (dado pago). O espião conta quem o pediu, para
// provar que o grátis nem chega a lê-lo.
vi.mock('@/modules/entrega/gestao', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/modules/entrega/gestao')>()
  return {
    ...real,
    planoDoDia: async (...args: Parameters<typeof real.planoDoDia>) => {
      chamadasDoPlano.push(nivelDoTeste)
      return real.planoDoDia(...args)
    },
  }
})
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/gestao',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 30, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values([
      { id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' },
      { id: VETERANO, email: 'veterano@teste.com', senhaHash: 'x' },
    ])
    .onConflictDoNothing()

  itensDeHoje = (await lerFeed(banco.db, HOJE))!.conteudo.itens

  // O VETERANO registrou uma entrada por noite com lista nos últimos 30 dias
  // (a de hoje incluída): é o pior caso do "Seu mês" — 30 leituras de
  // registro mais a conferência da janela inteira.
  for (let i = 0; i < 30; i++) {
    const dia = somarDias(HOJE, -i)
    const feed = await lerFeed(banco.db, dia)
    const item = feed?.conteudo.itens.find((x) => x.linha !== null)
    if (!item) continue
    await registrarEntradaRealizada(banco.db, {
      usuarioId: VETERANO,
      dataReferencia: dia,
      jogadorId: item.jogadorId,
      atributo: item.atributo,
      linha: item.linha!,
      unidades: 1,
      odd: 1.8,
      agora: AGORA,
    })
    registrosDoVeterano++
  }

  // A tela calcula "hoje" com `new Date()`. Só `Date` — timers travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 240_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

type Busca = Record<string, string | string[] | undefined>

async function renderizar(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('@/app/(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

async function destinoDoRedirect(render: Promise<unknown>): Promise<string | null> {
  try {
    await render
    return null
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    if (!digest.startsWith('NEXT_REDIRECT')) throw erro
    return digest.split(';')[2] ?? ''
  }
}

const semEntidades = (t: string) =>
  t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** O texto que se lê: sem marcação e sem o script de replay de formulário do React. */
const texto = (html: string) =>
  semEntidades(
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()

function formulario(item: ItemFeed, sobre: Record<string, string> = {}): FormData {
  const f = new FormData()
  f.set('dataReferencia', HOJE)
  f.set('jogadorId', item.jogadorId)
  f.set('atributo', item.atributo)
  f.set('linha', String(item.linha))
  f.set('unidades', '1.5')
  f.set('odd', '1.62')
  for (const [k, v] of Object.entries(sobre)) f.set(k, v)
  return f
}

const linhasDe = (usuarioId: string) =>
  banco.db.select().from(entradasRealizadas).where(eq(entradasRealizadas.usuarioId, usuarioId))

/** Os cards da tela: um por jogador e atributo, como a Lista (pente fino de 22/09). */
const cardsDeHoje = () => agruparPorJogador(itensDeHoje)

// ===========================================================================
// PORTÃO DE NÍVEL — tela e ação
// ===========================================================================

describe('Gestão do v2 — portão de nível', () => {
  it('MVP: a tela traz o formulário "Registrei" por card com linha', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const comLinha = cardsDeHoje().filter((c) => c.linha !== null)
    expect(comLinha.length).toBeGreaterThan(0)
    expect((html.match(/>Registrei</g) ?? []).length).toBe(comLinha.length)
    expect(html).toContain('name="unidades"')
    expect(html).toContain('name="odd"')
    expect(texto(html)).toContain(comLinha[0]!.nome)
  }, 60_000)

  it('MVP registra pela AÇÃO real: grava o que digitou e a visão Realizadas mostra', async () => {
    nivelDoTeste = 'MVP'
    sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    const alvo = cardsDeHoje().find((c) => c.linha !== null)!
    const { registrarEntrada } = await import('../acoes')

    expect(await destinoDoRedirect(registrarEntrada(formulario(alvo)))).toBe('/gestao?ver=realizadas')
    const linhas = await linhasDe(USUARIO)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ jogadorId: alvo.jogadorId, linha: alvo.linha, unidades: '1.50', odd: '1.62' })

    const html = await renderizar({ ver: 'realizadas' })
    expect(texto(html)).toContain(alvo.nome)
    // E a linha da visão Sugeridas abre dizendo que já foi registrada hoje.
    const sugeridas = await renderizar()
    expect(sugeridas).toContain('Registrada hoje')
  }, 60_000)

  it('GRÁTIS vê a silhueta e o convite: sem formulário, sem nenhum item do feed, e o plano nem é lido', async () => {
    nivelDoTeste = 'GRATIS'
    chamadasDoPlano.length = 0
    try {
      const html = await renderizar({ ver: 'sugeridas' })
      expect(html).toContain('Registrar entradas é do plano MVP')
      expect(html).toContain('href="/assinar?nivel=MVP&amp;voltar=%2Fgestao"')
      expect(html).not.toContain('name="unidades"')
      expect(html).not.toContain('>Registrei<')
      expect(html).not.toMatch(/<form[^>]*action=/)
      expect(html).not.toContain('href="/apito/')
      // (planos-gestao) varre TODOS os itens, não só o primeiro.
      expect(itensDeHoje.length).toBeGreaterThan(0)
      for (const i of itensDeHoje) {
        expect(html).not.toContain(i.jogadorId)
        expect(texto(html)).not.toContain(i.nome)
      }
      // O dado pago nem sai do banco para o grátis.
      expect(chamadasDoPlano).toEqual([])
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('GRÁTIS: a silhueta é inerte — nenhum controle dentro dela (o "clico e nada acontece")', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar()
      const inicio = html.indexOf('aria-hidden="true"', html.indexOf('Ver planos'))
      expect(inicio).toBeGreaterThan(-1)
      // Do fim do convite até o fim da tela: só blocos de forma.
      const silhueta = html.slice(inicio, html.indexOf('</div></div>', inicio))
      expect(silhueta).not.toMatch(/<(a|button|input|form|select)\b/)
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('GRÁTIS: a AÇÃO recusa no servidor (POST direto) e não grava nada', async () => {
    nivelDoTeste = 'GRATIS'
    sessaoDoTeste = { usuarioId: VETERANO, email: 'veterano@teste.com' }
    try {
      const antes = (await linhasDe(VETERANO)).length
      const alvo = cardsDeHoje().filter((c) => c.linha !== null).at(-1)!
      const { registrarEntrada } = await import('../acoes')
      expect(await destinoDoRedirect(registrarEntrada(formulario(alvo, { linha: String(alvo.linha! + 7) })))).toBe(
        '/assinar?nivel=MVP&voltar=%2Fgestao',
      )
      expect(await linhasDe(VETERANO)).toHaveLength(antes)
    } finally {
      nivelDoTeste = 'MVP'
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  }, 60_000)

  it('GRÁTIS mantém o histórico: a visão Realizadas mostra o que já registrou (decisão 8)', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const html = await renderizar({ ver: 'realizadas' })
      const [linha] = await linhasDe(USUARIO)
      expect(linha).toBeDefined()
      expect(html).toContain('Entradas registradas hoje')
      expect(html).not.toContain('Nada registrado hoje')
    } finally {
      nivelDoTeste = 'MVP'
    }
  }, 60_000)

  it('sem sessão, a tela manda para /entrar com destino /gestao', async () => {
    sessaoDoTeste = null
    try {
      expect(await destinoDoRedirect(renderizar())).toBe(`/entrar?destino=${encodeURIComponent('/gestao')}`)
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  })
})

// ===========================================================================
// "SEU MÊS" — 30 dias de registro
// ===========================================================================

describe('Gestão do v2 — "Seu mês" com 30 dias de semente', () => {
  it('renderiza a retrospectiva e cabe no orçamento de 2 s no PGlite', async () => {
    nivelDoTeste = 'MVP'
    sessaoDoTeste = { usuarioId: VETERANO, email: 'veterano@teste.com' }
    try {
      expect(registrosDoVeterano).toBeGreaterThanOrEqual(20)
      // Aquece o import e o plano de consulta; a medida é a da visita seguinte.
      await renderizar()
      const inicio = performance.now()
      const html = await renderizar()
      const ms = performance.now() - inicio
      // O número vai para o relatório da tarefa (ledger), não só para o assert.
      console.info(`[fumaça gestão] "Seu mês" com ${registrosDoVeterano} registros em 30 dias: ${ms.toFixed(0)} ms`)

      expect(html).toContain('Seu mês')
      expect(texto(html)).toContain('Últimos 30 dias')
      // A contagem é a dos registros da janela — nada inventado.
      expect(texto(html)).toMatch(new RegExp(`Entradas ${registrosDoVeterano}\\b`))
      expect(ms).toBeLessThan(2000)
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  }, 60_000)

  it('quem nunca registrou não vê o bloco', async () => {
    nivelDoTeste = 'MVP'
    sessaoDoTeste = { usuarioId: '00000000-0000-4000-8000-000000000009', email: 'novo@teste.com' }
    try {
      const html = await renderizar()
      expect(html).not.toContain('Seu mês')
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  }, 60_000)
})

// ===========================================================================
// AS INVARIANTES DA TELA ANTIGA
// ===========================================================================

describe('Gestão do v2 — invariantes herdadas', () => {
  it('(telas-05-gestao) duas visões por URL, a ativa anunciada', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    expect(html).toContain('href="/gestao?ver=realizadas"')
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Sugeridas<\/a>/)
    expect(html).not.toMatch(/<a[^>]*aria-current="page"[^>]*>Realizadas<\/a>/)
    const realizadas = await renderizar({ ver: 'realizadas' })
    expect(realizadas).toMatch(/<a[^>]*aria-current="page"[^>]*>Realizadas<\/a>/)
  }, 60_000)

  it('(telas-05-gestao) sem nada registrado, a visão Realizadas explica onde registrar', async () => {
    nivelDoTeste = 'MVP'
    sessaoDoTeste = { usuarioId: '00000000-0000-4000-8000-000000000009', email: 'novo@teste.com' }
    try {
      const html = await renderizar({ ver: 'realizadas' })
      expect(texto(html)).toContain('Nada registrado hoje')
      expect(texto(html)).toContain('Registre pela visão Sugeridas')
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  }, 60_000)

  it('(telas-05-gestao) a visão Realizadas repete a fronteira de somente leitura', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar({ ver: 'realizadas' })
    expect(texto(html).toLowerCase()).toContain('somente leitura')
    expect(texto(html)).toContain('não o que a NIP sugeriu')
  }, 60_000)

  it('(telas-05-gestao) ?erro= passa por dicionário: código conhecido vira texto, texto forjado some', async () => {
    nivelDoTeste = 'MVP'
    const conhecido = await renderizar({ erro: 'entrada-invalida' })
    expect(conhecido).toContain('role="alert"')
    expect(conhecido).toContain('Confira unidades e odd.')
    const frase = 'sua conta foi comprometida, ligue agora para 0800-000-000'
    const forjado = await renderizar({ erro: frase })
    expect(forjado).not.toContain(frase)
    expect(forjado).not.toContain('role="alert"')
  }, 60_000)

  it('o erro volta JUNTO do card recusado: o formulário dele abre com o alerta', async () => {
    nivelDoTeste = 'MVP'
    const alvo = cardsDeHoje().find((c) => c.linha !== null)!
    const { registrarEntrada } = await import('../acoes')
    const destino = await destinoDoRedirect(registrarEntrada(formulario(alvo, { unidades: '0' })))
    expect(destino).toContain('/gestao?erro=entrada-invalida')
    expect(destino).toContain(`jogador=${alvo.jogadorId}`)

    const busca = Object.fromEntries(new URLSearchParams(destino!.split('?')[1]))
    const html = await renderizar(busca)
    const doCard = html.slice(html.indexOf(`/apito/${alvo.jogadorId}?atributo=${alvo.atributo}`))
    const form = doCard.slice(0, doCard.indexOf('</form>'))
    expect(form).toMatch(/<details[^>]*open/)
    expect(form).toContain('role="alert"')
    expect(form).toContain('Confira unidades e odd.')
  }, 60_000)

  it('(telas-05-gestao) "Registrei" não é o primário da tela — o primário é Aplicar, que se faz uma vez', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const aplicar = html.match(/<button[^>]*class="([^"]*)"[^>]*>Aplicar<\/button>/)?.[1]
    const registrei = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>Registrei<\/button>/g)].map((m) => m[1])
    expect(aplicar).toBeTruthy()
    expect(registrei.length).toBeGreaterThan(1)
    for (const classe of registrei) expect(classe).not.toBe(aplicar)
  }, 60_000)

  it('(telas-05-gestao) as sugeridas agrupam por time, e nenhuma linha se perde no caminho', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const cards = cardsDeHoje()
    const grupos = [...html.matchAll(/<section[^>]*aria-label="([^"]+)"[^>]*><header/g)]
    expect(grupos.length).toBe(new Set(cards.map((c) => c.timeSigla)).size)
    expect(grupos.length).toBeGreaterThan(1)
    // Um link de detalhe por card: nenhum ficou fora de um grupo.
    expect((html.match(/href="\/apito\/[0-9a-f-]+\?atributo=/g) ?? []).length).toBe(cards.length)
  }, 60_000)

  it('(telas-05-gestao) a linha escreve o nível do jogador e o do apito — a cor não é o único sinal', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const primeiro = html.slice(html.indexOf('href="/apito/'))
    const link = texto(primeiro.slice(0, primeiro.indexOf('</a>')))
    expect(link).toMatch(/\b(MVP|All-Star|All Star|Suporte|Randola)\b/)
  }, 60_000)

  it('(telas-demo) cada linha do plano leva ao detalhe do apito, e o aviso de demonstração aparece', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar({ banca: '1000' })
    expect(html).toMatch(/href="\/apito\/[0-9a-f-]+\?atributo=(PONTOS|REBOTES|ASSISTENCIAS)"/)
    expect(texto(html)).toContain('Gestão de banca')
    expect(texto(html)).toContain('Plano do dia')
    const ruleset = await rulesetAtivo()
    if (ruleset.gestao_banca?.origem === 'demonstracao') expect(html).toContain('Modelo de demonstração')
    expect(html).toContain('1 unidade')
    expect(html).not.toContain('Modelo de gestão ainda não definido')
  }, 60_000)

  it('(telas-demo / pente fino) banca inválida cai no padrão de R$ 1.000, sem NaN', async () => {
    nivelDoTeste = 'MVP'
    for (const banca of ['abc', '0', '-5']) {
      const html = await renderizar({ banca })
      expect(html).not.toContain('NaN')
      expect(html).toMatch(/aria-current="true"[^>]*>R\$\s?1\.000</)
    }
  }, 60_000)

  it('(escrita-identidade-04) a linha usa "+" só quando há linha, sem "null"', async () => {
    nivelDoTeste = 'MVP'
    const html = await renderizar()
    const t = texto(html)
    expect(t).not.toMatch(/null|undefined|NaN/)
    expect(t).not.toMatch(/\d+,\d+\+|\+\d+,\d/)
    // Toda linha escrita é inteira com "+". A pílula de mercado do v2
    // (`ui/marcas.tsx`, compartilhada com a Lista) escreve o sinal à frente:
    // "+15 PTS".
    for (const c of cardsDeHoje().filter((x) => x.linha !== null)) expect(t).toContain(`+${c.linha} `)
  }, 60_000)

  it('regras de escrita: nada de probabilidade, meio ponto, "Carlos" ou a lista do CJ', async () => {
    nivelDoTeste = 'MVP'
    for (const busca of [{}, { ver: 'realizadas' }]) {
      const t = texto(await renderizar(busca))
      expect(t.toLowerCase()).not.toContain('probabilidade')
      expect(t.toLowerCase()).not.toContain('meio ponto')
      expect(t).not.toContain('Carlos')
      expect(t.toLowerCase()).not.toContain('lista do cj')
      expect(t).not.toContain('...')
      expect(t).not.toContain('…')
    }
  }, 60_000)
})

// ===========================================================================
// A COLUNA DA SEÇÃO E AS REGRAS DE FONTE
// ===========================================================================

describe('Gestão do v2 — a coluna da seção (@painel/gestao)', () => {
  async function renderizarPainel() {
    const { default: Painel } = await import('@/app/(app)/@painel/gestao/page')
    return Painel()
  }

  it('tem portão próprio: sem sessão vai para /entrar com a MESMA rota da página', async () => {
    sessaoDoTeste = null
    try {
      expect(await destinoDoRedirect(renderizarPainel())).toBe(`/entrar?destino=${encodeURIComponent('/gestao')}`)
    } finally {
      sessaoDoTeste = { usuarioId: USUARIO, email: 'demo@teste.com' }
    }
  })

  it('com sessão, é a coluna da rodada', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const elemento = await renderizarPainel()
      expect(elemento.props).toMatchObject({ modo: 'resumo', rota: '/gestao', rotulo: 'Coluna da rodada' })
    } finally {
      nivelDoTeste = 'MVP'
    }
  })
})

describe('Gestão do v2 — fonte', () => {
  const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('o carregador passa pelo portão e decide o nível ANTES de ler o plano (feed)', () => {
    const fonte = semComentarios(readFileSync('src/features/gestao/carregar.ts', 'utf8'))
    const portao = fonte.indexOf("exigirNivel('GRATIS', '/gestao')")
    const nivel = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    const plano = fonte.indexOf('planoDoDia(')
    expect(portao).toBeGreaterThan(0)
    expect(nivel).toBeGreaterThan(portao)
    expect(plano).toBeGreaterThan(nivel)
    expect(fonte).not.toContain("'use cache'")
  })

  it('o "Seu mês" lê a conferência pelo cache, e o plano recebe o feed do cache', () => {
    // Fix round 1 da Tarefa 6: a conferência da janela é igual para todos na
    // mesma rodada — não vai ao banco por visita.
    const fonte = semComentarios(readFileSync('src/features/gestao/carregar.ts', 'utf8'))
    expect(fonte).toContain('realizadoDaJanelaCacheado(')
    expect(fonte).not.toMatch(/[^a-zA-Z]conferirRodadas\(/)
    expect(fonte).toContain('lerFeedCacheado(')
    expect(fonte).not.toMatch(/[^a-zA-Z]lerFeed\(/)
    expect(fonte.indexOf('lerFeedCacheado(')).toBeGreaterThan(fonte.indexOf("atende(acesso.nivel, 'MVP')"))
  })

  it('a ação confere o nível no servidor antes de validar e gravar', () => {
    const fonte = semComentarios(readFileSync('src/features/gestao/acoes.ts', 'utf8'))
    const nivel = fonte.indexOf("atende(acesso.nivel, 'MVP')")
    expect(nivel).toBeGreaterThan(0)
    expect(fonte.indexOf('registrarEntradaRealizada(')).toBeGreaterThan(nivel)
    expect(fonte).toContain('acesso.nivel === null ||')
  })

  it('o slot desenha a coluna só depois do portão', () => {
    const painel = readFileSync('src/app/(app)/@painel/gestao/page.tsx', 'utf8')
    expect(painel.indexOf("exigirNivel('GRATIS', '/gestao')")).toBeGreaterThan(0)
    expect(painel.indexOf('<LateralDaRodada')).toBeGreaterThan(painel.indexOf("exigirNivel('GRATIS'"))
  })
})
