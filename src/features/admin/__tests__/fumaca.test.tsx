import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { casas, rulesets, usuarios } from '@/modules/dominio/db/schema'
import { adicionarUsuario } from '@/modules/plataforma/admin/usuarios'
import { NOME_COOKIE } from '@/modules/plataforma/auth/cookies'
import { abrirSessao } from '@/modules/plataforma/auth/sessao'
import { ESTADO_INICIAL } from '../estado-acao'

/**
 * FUMAÇA DO PAINEL DO V2 — o portão em tempo de execução.
 *
 * O teste de fonte (`portao.test.ts`) prova que cada tela e cada ação
 * ESCREVEM a chamada da guarda. Este prova que a guarda FUNCIONA: as páginas
 * de verdade (`src/app/(app)/admin/**`) e as ações de verdade
 * (`features/admin/**`) rodam sobre um PGlite com duas contas reais — uma
 * USUARIO, uma ADMIN — e sessões reais abertas por `abrirSessao`. O
 * `exigirAdmin` é o de produção; só `cookies()`/`headers()` do Next viram um
 * armário em memória, como em `features/publico/__tests__/fumaca.test.tsx`.
 *
 * Herda de `telas-galeria.test.ts` (aposentado com a galeria antiga) o que
 * ainda faz sentido: a galeria renderiza atrás da guarda e nunca diz
 * "probabilidade". As asserções de marcação da Identidade 04/05
 * ("AGUARDANDO OFICIAL", "LINHA 20+", "apitou aqui", "FIM 1º Q · congelada",
 * "nº 1 LeBron James", "Identidade 05 · marca", "Acento · azul do manual")
 * eram de componentes do design-system antigo e morrem com ele.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const armario = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (armario.has(nome) ? { name: nome, value: armario.get(nome)! } : undefined),
    set: (nome: string, valor: string) => {
      armario.set(nome, valor)
    },
    delete: (nome: string) => {
      armario.delete(nome)
    },
  }),
  headers: async () => new Headers(),
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    redirect: (destino: string) => {
      throw new Error(`REDIRECT:${destino}`)
    },
    notFound: () => {
      throw new Error('NOT_FOUND')
    },
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/admin',
    useSearchParams: () => new URLSearchParams(),
  }
})
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

const AGORA = new Date('2026-09-24T12:00:00.000Z')
const SENHA = 'Senha-forte-123'
const ACESSO = { fingerprint: 'fp-fumaca-admin', tipo: 'DESKTOP' as const, userAgent: 'Teste NIP', ip: null }

const contas = {
  usuario: { id: '', email: 'comum@teste.com', token: '' },
  admin: { id: '', email: 'chefe@teste.com', token: '' },
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
  banco = await bancoDeTeste()

  const comum = await adicionarUsuario(banco.db, { email: contas.usuario.email, senha: SENHA, nome: 'Pessoa Comum' })
  contas.usuario.id = comum.id
  const [chefe] = await banco.db
    .insert(usuarios)
    .values({
      email: contas.admin.email,
      senhaHash: 'x',
      papel: 'ADMIN',
      // A galeria passa por `carregarLista` → `exigirNivel`, que manda quem
      // não aceitou a metodologia para /metodologia. O admin já aceitou.
      metodologiaAceitaEm: AGORA,
    })
    .returning({ id: usuarios.id })
  contas.admin.id = chefe!.id

  for (const conta of [contas.usuario, contas.admin]) {
    const sessao = await abrirSessao(banco.db, conta.id, ACESSO, AGORA, { duracaoMs: 3600_000 })
    conta.token = sessao.token
  }
  // As sessões nascem em AGORA com 1 h de validade e `sessaoAtual` as confere
  // contra o relógio: sem congelá-lo, a suíte inteira virava "Acesso restrito"
  // uma hora depois do instante semeado (aconteceu em 24/09/2026, 13:00Z).
  // Só `Date` — timers de verdade travariam o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

beforeEach(() => {
  armario.clear()
})

function como(quem: 'ninguem' | 'usuario' | 'admin') {
  armario.clear()
  if (quem !== 'ninguem') armario.set(NOME_COOKIE, contas[quem].token)
}

type Busca = Record<string, string | string[] | undefined>
type Pagina = (props: { searchParams: Promise<Busca> }) => Promise<React.ReactNode>

async function renderizar(modulo: () => Promise<{ default: unknown }>, busca: Busca = {}): Promise<string> {
  const { default: Pagina } = (await modulo()) as { default: Pagina }
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

/** O que uma Server Action que redireciona "devolve": o estado, ou o destino do redirect. */
async function resultado<T>(acao: () => Promise<T>) {
  try {
    return { estado: await acao() }
  } catch (erro) {
    const texto = String((erro as Error).message)
    if (texto.startsWith('REDIRECT:')) return { redirect: texto.slice('REDIRECT:'.length) }
    if (texto === 'NOT_FOUND') return { notFound: true }
    throw erro
  }
}

const formulario = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

const TELAS = {
  indice: () => import('@/app/(app)/admin/page'),
  usuarios: () => import('@/app/(app)/admin/usuarios/page'),
  afiliados: () => import('@/app/(app)/admin/afiliados/page'),
  visual: () => import('@/app/(app)/admin/afiliados/visual/page'),
  backtest: () => import('@/app/(app)/admin/backtest/page'),
  galeria: () => import('@/app/(app)/admin/galeria/page'),
  mapeamento: () => import('@/app/(app)/admin/mapeamento/page'),
  mercados: () => import('@/app/(app)/admin/mercados/page'),
} as const

/** A recusa da guarda: o estado vazio "Acesso restrito" com o link do login do painel. */
function esperaAcessoRestrito(html: string) {
  expect(html).toContain('Acesso restrito')
  expect(html).toContain('href="/admin/entrar"')
  // Nenhum dado do painel vaza junto com a recusa.
  expect(html).not.toContain(contas.admin.email)
  expect(html).not.toContain(contas.usuario.email)
}

// ===========================================================================
// PÁGINAS
// ===========================================================================

describe('/admin e /admin/usuarios — quem vê', () => {
  it('sem cookie, as duas telas recusam', async () => {
    como('ninguem')
    esperaAcessoRestrito(await renderizar(TELAS.indice))
    esperaAcessoRestrito(await renderizar(TELAS.usuarios))
  })

  it('uma sessão USUARIO de verdade recusa — a sessão é válida, o papel não basta', async () => {
    como('usuario')
    const indice = await renderizar(TELAS.indice)
    esperaAcessoRestrito(indice)
    expect(indice).not.toContain('Resumo do painel')

    const lista = await renderizar(TELAS.usuarios)
    esperaAcessoRestrito(lista)
    expect(lista).not.toContain('Resumo das contas')
  })

  it('uma sessão ADMIN de verdade renderiza o hub e a lista de contas', async () => {
    como('admin')
    const indice = await renderizar(TELAS.indice)
    expect(indice).toContain('Painel administrativo')
    expect(indice).toContain('Resumo do painel')
    for (const area of ['usuarios', 'afiliados', 'backtest', 'mapeamento', 'mercados', 'galeria']) {
      expect(indice).toContain(`href="/admin/${area}"`)
    }

    const lista = await renderizar(TELAS.usuarios)
    expect(lista).toContain('Resumo das contas')
    expect(lista).toContain(contas.admin.email)
    expect(lista).toContain(contas.usuario.email)
    expect(lista).not.toContain('Acesso restrito')
  })

  it('a busca e o filtro de status da lista de contas valem no servidor', async () => {
    como('admin')
    const soComum = await renderizar(TELAS.usuarios, { busca: 'comum' })
    expect(soComum).toContain(contas.usuario.email)
    expect(soComum).not.toContain(contas.admin.email)

    const bloqueadas = await renderizar(TELAS.usuarios, { status: 'BLOQUEADO' })
    expect(bloqueadas).toContain('Nenhuma conta com esse filtro.')
  })
})

describe('as outras telas do painel — a mesma guarda, antes de ler', () => {
  it('USUARIO não vê afiliados, backtest, galeria, mapeamento nem mercados', async () => {
    como('usuario')
    esperaAcessoRestrito(await renderizar(TELAS.afiliados))
    esperaAcessoRestrito(await renderizar(TELAS.galeria))
    esperaAcessoRestrito(await renderizar(TELAS.mapeamento))
    esperaAcessoRestrito(await renderizar(TELAS.mercados))
  })

  it('o backtest não roda numa requisição sem ADMIN, mesmo com período e candidato na URL', async () => {
    const yaml = (await import('node:fs')).readFileSync('config/ruleset.v1.yaml', 'utf8').replace('version: 1', 'version: 2')
    await banco.db
      .insert(rulesets)
      .values({ versao: 'candidato-fumaca', conteudoYaml: yaml, status: 'provisorio' })
      .onConflictDoNothing()

    como('usuario')
    const html = await renderizar(TELAS.backtest, { de: '2026-01-01', ate: '2026-01-02', candidato: 'candidato-fumaca' })
    esperaAcessoRestrito(html)
    expect(html).not.toContain('Resultado ·')
    expect(html).not.toContain('Comparar')
  })

  it('ADMIN vê as cinco, cada uma com o seu título', async () => {
    como('admin')
    expect(await renderizar(TELAS.afiliados)).toContain('Trilha de saídas')
    expect(await renderizar(TELAS.backtest)).toContain('Backtest de rulesets')
    expect(await renderizar(TELAS.mapeamento)).toContain('Mapeamento de jogadores')
    expect(await renderizar(TELAS.mercados)).toContain('Curadoria de mercados')
    const galeria = await renderizar(TELAS.galeria)
    expect(galeria).toContain('Design System · NIP v2')
    expect(galeria).toContain('Nível do jogador')
    expect(galeria).toContain('Nível do apito')
  })

  it('nenhuma tela do painel chama o score de probabilidade', async () => {
    como('admin')
    for (const tela of Object.values(TELAS)) {
      expect((await renderizar(tela)).toLowerCase()).not.toContain('probabilidade')
    }
  })
})

describe('/admin/afiliados/visual — prévia sintética', () => {
  it('em produção é 404 antes de qualquer coisa, até para ADMIN', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      como('admin')
      expect(await resultado(() => renderizar(TELAS.visual))).toEqual({ notFound: true })
    } finally {
      vi.stubEnv('NODE_ENV', 'test')
    }
  })

  it('fora de produção, a guarda vale: USUARIO recusa, ADMIN vê a prévia', async () => {
    como('usuario')
    esperaAcessoRestrito(await renderizar(TELAS.visual))
    como('admin')
    expect(await renderizar(TELAS.visual)).toContain('Valores sintéticos')
  })
})

// ===========================================================================
// AÇÕES — o POST direto, sem passar pela página
// ===========================================================================

describe('as ações do painel recusam quem não é ADMIN', () => {
  it('bloquear uma conta como USUARIO devolve a recusa e não grava', async () => {
    const { acaoBloquear } = await import('../usuarios/acoes')
    como('usuario')
    const r = await acaoBloquear(ESTADO_INICIAL, formulario({ id: contas.admin.id }))
    expect(r.erro).toMatch(/Acesso restrito/)
    const [chefe] = await banco.db.select().from(usuarios).where(eq(usuarios.id, contas.admin.id))
    expect(chefe!.status).toBe('ATIVO')
  })

  it('criar uma casa comercial como USUARIO (e sem cookie) devolve a recusa e não grava', async () => {
    const { acaoCriarCasa } = await import('../afiliados/acoes')
    como('usuario')
    expect((await acaoCriarCasa(ESTADO_INICIAL, formulario({ nome: 'Casa Intrusa' }))).erro).toMatch(/Acesso administrativo/)
    como('ninguem')
    expect((await acaoCriarCasa(ESTADO_INICIAL, formulario({ nome: 'Casa Intrusa' }))).erro).toMatch(/Acesso administrativo/)
    expect(await banco.db.select().from(casas)).toEqual([])
  })

  it('salvar candidato, confirmar vínculo e confirmar mercado como USUARIO devolvem a recusa', async () => {
    const { salvarCandidato } = await import('../backtest/acoes')
    const { confirmarVinculo } = await import('../mapeamento/acoes')
    const { confirmarVinculoDeMercado } = await import('../mercados/acoes')
    como('usuario')
    expect((await salvarCandidato(ESTADO_INICIAL, formulario({ versao: 'x', conteudoYaml: 'a: 1' }))).erro).toBe('Acesso restrito.')
    expect(
      (
        await confirmarVinculo(
          ESTADO_INICIAL,
          formulario({ nomeNaLista: 'Fulano', jogadorId: contas.admin.id, provedorPlayerId: '1', provedor: 'balldontlie', score: '1' }),
        )
      ).erro,
    ).toBe('Acesso restrito.')
    expect(
      (await confirmarVinculoDeMercado(ESTADO_INICIAL, formulario({ casaId: contas.admin.id, nomeMercadoNaCasa: 'Pts', atributo: 'PONTOS' }))).erro,
    ).toBe('Acesso restrito.')
  })

  it('como ADMIN, a mesma ação grava — a recusa é do papel, não da ação', async () => {
    const { acaoCriarCasa } = await import('../afiliados/acoes')
    como('admin')
    expect((await acaoCriarCasa(ESTADO_INICIAL, formulario({ nome: 'Casa Homologada' }))).ok).toBe('Casa cadastrada.')
    expect((await banco.db.select().from(casas)).map((c) => c.nome)).toEqual(['Casa Homologada'])
  })
})

// ===========================================================================
// ÁREA DO AFILIADO — paridade com o fluxo antigo
// ===========================================================================

describe('/afiliados e o convite — o fluxo real de parceiro', () => {
  const PaginaAfiliado = () => import('@/app/(afiliados)/afiliados/page')

  it('sem sessão, /afiliados manda entrar com o destino de volta', async () => {
    como('ninguem')
    expect(await resultado(() => renderizar(PaginaAfiliado))).toEqual({ redirect: '/entrar?destino=/afiliados' })
  })

  it('logado sem parceria, a tela explica em vez de quebrar — sem número nenhum', async () => {
    como('usuario')
    const html = await renderizar(PaginaAfiliado)
    expect(html).toContain('Sua conta ainda não possui uma parceria NIP ativa')
    expect(html).not.toContain('Visão geral')
  })

  it('o convite sem sessão oferece entrar; aceitar sem sessão é recusado', async () => {
    const { default: PaginaConvite } = await import('@/app/(afiliados)/afiliados/convite/[token]/page')
    const { aceitar } = await import('@/features/afiliados/acoes')
    como('ninguem')
    const html = renderToStaticMarkup(await PaginaConvite({ params: Promise.resolve({ token: 'abc' }) }))
    expect(html).toContain('Entrar para continuar')
    expect(html).toContain('href="/entrar?destino=%2Fafiliados%2Fconvite%2Fabc"')
    expect((await aceitar(ESTADO_INICIAL, formulario({ token: 'abc' }))).erro).toMatch(/Entre na sua conta/)
  })

  it('ADMIN convida, o convidado aceita com a própria conta e passa a ver a área de parceiro', async () => {
    const { acaoCriarConvite } = await import('../afiliados/acoes')
    const { aceitar } = await import('@/features/afiliados/acoes')

    como('admin')
    const convite = await acaoCriarConvite(ESTADO_INICIAL, formulario({ email: contas.usuario.email, nomePublico: 'Parceiro Comum' }))
    expect(convite.erro).toBeNull()
    const token = /\/afiliados\/convite\/([^\s"]+)$/.exec(convite.ok ?? '')?.[1]
    expect(token).toBeTruthy()

    // Outra conta com o convite na mão não aceita: o e-mail tem de bater.
    como('admin')
    expect((await aceitar(ESTADO_INICIAL, formulario({ token: token! }))).erro).toMatch(/Não foi possível aceitar/)

    como('usuario')
    expect(await resultado(() => aceitar(ESTADO_INICIAL, formulario({ token: token! })))).toEqual({ redirect: '/afiliados' })
    const html = await renderizar(PaginaAfiliado)
    expect(html).toContain('Visão geral')
    expect(html).toContain('Parceiro Comum')
    expect(html).toContain('Nenhum link disponível.')
    // O convite é de uso único.
    expect((await aceitar(ESTADO_INICIAL, formulario({ token: token! }))).erro).toMatch(/Não foi possível aceitar/)
  })
})
