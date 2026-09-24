import { existsSync, readFileSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  eventosAfiliados,
  ofertasAfiliados,
  sessoes,
  usuarios,
} from '@/modules/dominio/db/schema'
import { COOKIE_VISITANTE_AFILIADO, novoTokenVisitante } from '@/modules/plataforma/afiliados/http'
import {
  criarCampanhaComLink,
  criarCasaComercial,
  criarOferta,
  criarParceiro,
  definirStatusLink,
  type AtorAfiliados,
} from '@/modules/plataforma/afiliados/servico'
import { adicionarUsuario } from '@/modules/plataforma/admin/usuarios'
import { NOME_COOKIE } from '@/modules/plataforma/auth/cookies'
import { emitirRedefinicao } from '@/modules/plataforma/auth/redefinicao'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'

import { destinoSeguro } from '../destino'

/**
 * FUMAÇA DAS TELAS PÚBLICAS DO V2 — ligadas ao NOSSO back.
 *
 * As rotas de verdade (`(publico)/{entrar,cadastrar,redefinir,redefinir/[token],
 * oferta/[codigo],oferta-indisponivel,offline}` e `(acesso-admin)/admin/entrar`)
 * e as Server Actions de verdade (`features/publico/acoes.ts`) sobre um PGlite
 * de verdade: scrypt, limite de tentativas, cookie de sessão, token de
 * redefinição e link de afiliado são os do produto. Só o que o Next injeta na
 * requisição é simulado: `cookies()`/`headers()` viram um armário em memória e
 * `redirect()`/`notFound()` lançam, para o teste ler o destino.
 *
 * Herda as invariantes de `telas-05-redefinir.test.ts` (aposentada junto com
 * as telas antigas) — cada caso diz de onde veio.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

// O armário de cookies e os cabeçalhos da "requisição" atual — mutáveis por
// teste, como o Next os entregaria a uma Server Action.
const armario = new Map<string, string>()
let cabecalhos = new Headers()

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
  headers: async () => cabecalhos,
}))
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

const SENHA = 'senha-forte-123'
const AGORA = new Date('2026-10-02T15:00:00.000Z')

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  // Cadastro público abre por padrão e exige APP_PUBLIC_URL; a origem
  // permitida do cadastro é o host dela.
  vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
  banco = await bancoDeTeste()
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

beforeEach(() => {
  armario.clear()
  cabecalhos = new Headers({ origin: 'https://app.example.com' })
})

/** Um e-mail por caso: o limite de login é por conta, e um caso não pode gastar o do outro. */
function emailUnico(prefixo: string) {
  return `${prefixo}-${Math.random().toString(36).slice(2, 8)}@exemplo.com`
}

/** O que uma Server Action que redireciona "devolve": a mensagem (string) ou o destino do redirect. */
async function resultado(acao: () => Promise<string | null | void>) {
  try {
    return { mensagem: await acao() }
  } catch (erro) {
    const texto = String((erro as Error).message)
    if (texto.startsWith('REDIRECT:')) return { redirect: texto.slice('REDIRECT:'.length) }
    if (texto === 'NOT_FOUND') return { notFound: true }
    throw erro
  }
}

function formularioDeLogin(email: string, senha: string, destino?: string) {
  const f = new FormData()
  f.set('email', email)
  f.set('senha', senha)
  f.set('dispositivo', 'fp-fumaca')
  f.set('ua', 'Mozilla/5.0 (Teste NIP)')
  if (destino !== undefined) f.set('destino', destino)
  return f
}

async function entrarCom(email: string, senha: string, destino?: string) {
  const { entrar } = await import('../acoes')
  return resultado(() => entrar(null, formularioDeLogin(email, senha, destino)))
}

/**
 * A MATRIZ DE OPEN REDIRECT do `?destino=` do login. Cada entrada é uma forma
 * de sair do domínio que já passou por algum parser em algum lugar: URL
 * absoluta, protocol-relative, barra invertida (o navegador lê `\` como `/`
 * em http), `.`/`..` que só viram `//` DEPOIS da normalização (fix round 1 da
 * T7), e as versões codificadas de cada uma.
 */
const DESTINOS_HOSTIS = [
  'https://evil.com',
  'https://evil.com/abrir',
  '//evil.com',
  '//evil.com/abrir',
  '/\\evil.com',
  '\\\\evil.com',
  '/.//evil.com',
  '/..//evil.com',
  '/abrir/..//evil.com',
  '/./\\evil.com',
  '%2F%2Fevil.com',
  '/%2F%2Fevil.com',
  '/%5Cevil.com',
  'https:%2F%2Fevil.com',
  '%68ttps://evil.com',
  '/abrir%0d%0aLocation:%20https://evil.com',
  '/abrir\r\nLocation: https://evil.com',
  'javascript:alert(1)',
  '/\tevil.com',
  '/abrir\u0000https://evil.com',
]

/** Só o que a allowlist do login (`destinoInternoSeguro`) conhece pode sair de um redirect. */
const ALLOWLIST_DO_LOGIN = ['/', '/abrir', '/assinar', '/conta', '/admin', '/admin/usuarios']

// ===========================================================================
// ENTRAR
// ===========================================================================

describe('/entrar — a ação real sobre a conta real', () => {
  it('senha errada recebe a frase única; senha certa grava o cookie de sessão e abre em /abrir', async () => {
    const email = emailUnico('entrar')
    const { id } = await adicionarUsuario(banco.db, { email, senha: SENHA, nome: 'Pessoa' })

    expect(await entrarCom(email, 'senha-errada-99')).toEqual({ mensagem: 'E-mail ou senha incorretos.' })
    expect(armario.has(NOME_COOKIE)).toBe(false)

    expect(await entrarCom(email, SENHA)).toEqual({ redirect: '/abrir' })
    const token = armario.get(NOME_COOKIE)
    expect(token, 'o cookie de sessão precisa ter sido gravado antes do redirect').toBeTruthy()
    // O token do cookie NÃO está em claro no banco — só o hash dele.
    const [sessao] = await banco.db.select().from(sessoes).where(eq(sessoes.usuarioId, id))
    expect(sessao).toBeDefined()
    expect(sessao!.tokenHash).not.toBe(token)
  }, 60_000)

  it('a 6ª falha seguida da mesma conta é barrada com a frase do limite (Onda 1)', async () => {
    const email = emailUnico('limite')
    await adicionarUsuario(banco.db, { email, senha: SENHA })
    for (let n = 0; n < 5; n++) {
      expect(await entrarCom(email, `errada-${n}-000`)).toEqual({ mensagem: 'E-mail ou senha incorretos.' })
    }
    expect(await entrarCom(email, 'errada-final-000')).toEqual({
      mensagem: 'Muitas tentativas. Aguarde alguns minutos.',
    })
    // Nem a senha CERTA passa enquanto o bloqueio vale.
    expect(await entrarCom(email, SENHA)).toEqual({ mensagem: 'Muitas tentativas. Aguarde alguns minutos.' })
    expect(armario.has(NOME_COOKIE)).toBe(false)
  }, 60_000)

  it('matriz de open redirect: nenhum destino hostil sai da allowlist — na ação e no helper', async () => {
    const email = emailUnico('redirect')
    await adicionarUsuario(banco.db, { email, senha: SENHA })
    for (const hostil of DESTINOS_HOSTIS) {
      const seguro = destinoSeguro(hostil, '/abrir')
      expect(ALLOWLIST_DO_LOGIN, `helper: ${JSON.stringify(hostil)} → ${seguro}`).toContain(seguro)
      expect(seguro).not.toContain('evil')

      const r = await entrarCom(email, SENHA, hostil)
      expect(r.redirect, `ação: ${JSON.stringify(hostil)}`).toBeDefined()
      expect(ALLOWLIST_DO_LOGIN, `ação: ${JSON.stringify(hostil)} → ${r.redirect}`).toContain(r.redirect)
    }
    // Interno e na allowlist: respeitado. Interno fora dela: cai no padrão, não em `/`.
    expect(await entrarCom(email, SENHA, '/conta')).toEqual({ redirect: '/conta' })
    expect(destinoSeguro('/gestao', '/abrir')).toBe('/')
  }, 120_000)

  it('a página sanitiza o ?destino= antes de pô-lo no campo oculto — o HTML nunca carrega o host hostil', async () => {
    const { default: Pagina } = await import('@/app/(publico)/entrar/page')
    for (const hostil of DESTINOS_HOSTIS) {
      const html = renderToStaticMarkup(
        await Pagina({ searchParams: Promise.resolve({ destino: hostil }) }),
      )
      expect(html, JSON.stringify(hostil)).not.toContain('evil')
      const valor = /name="destino" value="([^"]*)"/.exec(html)?.[1]
      expect(ALLOWLIST_DO_LOGIN, `página: ${JSON.stringify(hostil)} → ${valor}`).toContain(valor)
    }
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('name="destino" value="/abrir"')
    // (telas-05-redefinir) A tela de entrar leva ao "esqueci a senha".
    expect(html).toContain('href="/redefinir"')
    expect(html).toContain('href="/cadastrar"')
  })

  it('?aviso= passa por dicionário: código conhecido vira frase, texto forjado some', async () => {
    const { default: Pagina } = await import('@/app/(publico)/entrar/page')
    const conhecido = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ aviso: 'senha-redefinida' }) }),
    )
    expect(conhecido).toContain('Senha redefinida. Entre com a senha nova.')
    const forjado = 'ligue agora para 0800-000-000'
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ aviso: forjado }) }))
    expect(html).not.toContain(forjado)
  })
})

// ===========================================================================
// CADASTRAR
// ===========================================================================

describe('/cadastrar — a ação real, com a checagem de origem e UM scrypt só', () => {
  function formularioDeCadastro(email: string, senha = SENHA) {
    const f = new FormData()
    f.set('nome', 'Pessoa Nova')
    f.set('email', email)
    f.set('senha', senha)
    f.set('dispositivo', 'fp-fumaca')
    f.set('ua', 'Mozilla/5.0 (Teste NIP)')
    return f
  }
  async function cadastrarCom(email: string, senha?: string) {
    const { cadastrar } = await import('../acoes')
    return resultado(() => cadastrar(null, formularioDeCadastro(email, senha)))
  }
  const contaExiste = async (email: string) =>
    (await banco.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))).length > 0

  it('cria a conta, abre a sessão e manda para /assinar', async () => {
    const email = emailUnico('cadastro')
    expect(await cadastrarCom(email)).toEqual({ redirect: '/assinar' })
    expect(await contaExiste(email)).toBe(true)
    expect(armario.get(NOME_COOKIE)).toBeTruthy()
    // A sessão aberta é da conta recém-criada — e a senha gravada funciona no login.
    armario.clear()
    expect(await entrarCom(email, SENHA)).toEqual({ redirect: '/abrir' })
  }, 60_000)

  it('origem ausente ou de fora é recusada ANTES de criar qualquer coisa', async () => {
    const email = emailUnico('origem')
    cabecalhos = new Headers()
    expect(await cadastrarCom(email)).toEqual({ mensagem: 'Origem da solicitação inválida.' })
    cabecalhos = new Headers({ origin: 'https://evil.com' })
    expect(await cadastrarCom(email)).toEqual({ mensagem: 'Origem da solicitação inválida.' })
    expect(await contaExiste(email)).toBe(false)
    expect(armario.has(NOME_COOKIE)).toBe(false)
  })

  it('senha fora da política (11 caracteres) é recusada pelo back, com mensagem — e sem conta', async () => {
    const email = emailUnico('senha')
    const r = await cadastrarCom(email, 'curta-1234a')
    expect(typeof r.mensagem).toBe('string')
    expect(await contaExiste(email)).toBe(false)
  })

  it('o formulário exige 12 caracteres, como o back (senhaSchema.min(12)), e diz a regra com a frase única', async () => {
    const { default: Pagina } = await import('@/app/(publico)/cadastrar/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html.toLowerCase()).toContain('minlength="12"')
    expect(html.toLowerCase()).not.toContain('minlength="10"')
    expect(html).toContain(MENSAGEM_REGRA_SENHA)
    expect(html).toContain('href="/entrar"')
  })
})

// ===========================================================================
// REDEFINIR (telas-05-redefinir)
// ===========================================================================

describe('/redefinir e /redefinir/[token] — a ação real sobre o token real', () => {
  async function concluirCom(token: string, novaSenha: string) {
    const { concluirNovaSenha } = await import('../acoes')
    const f = new FormData()
    f.set('token', token)
    f.set('novaSenha', novaSenha)
    return resultado(() => concluirNovaSenha(f))
  }

  it('senha fraca → ?erro=senha sem queimar o token; senha boa troca, encerra as sessões e volta ao login; reuso → ?erro=usada', async () => {
    const email = emailUnico('redefinir')
    const { id } = await adicionarUsuario(banco.db, { email, senha: SENHA })
    // Uma sessão viva, para provar que a troca a derruba.
    expect(await entrarCom(email, SENHA)).toEqual({ redirect: '/abrir' })
    armario.clear()

    const { token } = await emitirRedefinicao(banco.db, { usuarioId: id, criadaPorId: null, agora: AGORA })

    expect(await concluirCom(token, 'fraca')).toEqual({
      redirect: `/redefinir/${encodeURIComponent(token)}?erro=senha`,
    })
    expect(await concluirCom(token, 'nova-senha-forte-12')).toEqual({
      redirect: '/entrar?aviso=senha-redefinida',
    })
    expect(await concluirCom(token, 'outra-senha-forte-12')).toEqual({
      redirect: `/redefinir/${encodeURIComponent(token)}?erro=usada`,
    })
    expect(await concluirCom('token-que-nao-existe', 'outra-senha-forte-12')).toEqual({
      redirect: '/redefinir/token-que-nao-existe?erro=token',
    })

    const vivas = await banco.db
      .select({ id: sessoes.id })
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, id), isNull(sessoes.encerradaEm)))
    expect(vivas).toHaveLength(0)
    expect(await entrarCom(email, SENHA)).toEqual({ mensagem: 'E-mail ou senha incorretos.' })
    expect(await entrarCom(email, 'nova-senha-forte-12')).toEqual({ redirect: '/abrir' })
  }, 60_000)

  it('(telas-05) a página do token tem o formulário, exige 12 caracteres e nunca mostra o token em texto', async () => {
    const { default: Pagina } = await import('@/app/(publico)/redefinir/[token]/page')
    const html = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('name="novaSenha"')
    expect(html.toLowerCase()).toContain('minlength="12"')
    expect(html).toContain('type="hidden" name="token"')
    expect(html).not.toMatch(/>abc</)
    // O token não vai para link nenhum — nem interno: só para o campo oculto.
    expect(html).not.toMatch(/href="[^"]*abc/)
  })

  it('(telas-05) ?erro= passa por dicionário: código conhecido vira português, texto forjado não aparece', async () => {
    const { default: Pagina } = await import('@/app/(publico)/redefinir/[token]/page')
    const conhecido = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({ erro: 'expirada' }) }),
    )
    expect(conhecido).toContain('Link expirado.')
    const comSenha = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({ erro: 'senha' }) }),
    )
    expect(comSenha).toContain(MENSAGEM_REGRA_SENHA)

    const fraseDoAtacante = 'sua conta foi comprometida, ligue agora para 0800-000-000'
    const forjado = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ token: 'abc' }),
        searchParams: Promise.resolve({ erro: fraseDoAtacante }),
      }),
    )
    expect(forjado).not.toContain(fraseDoAtacante)
  })

  it('(telas-05) a rota do token manda Referrer-Policy: no-referrer, para o Referer não vazar para fora', () => {
    const configuracao = readFileSync('next.config.ts', 'utf8')
    expect(configuracao).toContain("source: '/redefinir/:token'")
    expect(configuracao).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
  })

  it('(telas-05) "esqueci a senha" explica que o link vem do admin e vale uma hora', async () => {
    const { default: Esqueci } = await import('@/app/(publico)/redefinir/page')
    const html = renderToStaticMarkup(await Esqueci())
    expect(html.toLowerCase()).toContain('uma hora')
    expect(html).toContain('href="/entrar"')
  })
})

// ===========================================================================
// OFERTA (afiliados)
// ===========================================================================

describe('/oferta/[codigo] — o resolvedor da Onda 2 ({ destino, configuracao })', () => {
  /** Parceiro → oferta ATIVA → campanha → link NIP apontando para a própria /oferta/<codigo>. */
  async function linkNip() {
    const sufixo = Math.random().toString(36).slice(2, 8)
    const [admin] = await banco.db
      .insert(usuarios)
      .values({ email: `admin-oferta-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' })
      .returning()
    const ator: AtorAfiliados = { usuarioId: admin!.id, papel: 'ADMIN' }
    const casa = await criarCasaComercial(banco.db, ator, `Casa Oferta ${sufixo}`, AGORA)
    const oferta = await criarOferta(
      banco.db,
      ator,
      {
        casaId: casa.id,
        nome: `Oferta ${sufixo}`,
        modalidade: 'HIBRIDO',
        moeda: 'BRL',
        urlDestino: `https://casa-${sufixo}.test/nba`,
        hostDestino: `casa-${sufixo}.test`,
      },
      AGORA,
    )
    await banco.db.update(ofertasAfiliados).set({ status: 'ATIVA' }).where(eq(ofertasAfiliados.id, oferta.id))
    const parceiro = await criarParceiro(
      banco.db,
      ator,
      { codigo: `parceiro-oferta-${sufixo}`, nomePublico: 'Parceiro Oferta' },
      AGORA,
    )
    const codigo = `oferta-link-${sufixo}`
    const link = await criarCampanhaComLink(
      banco.db,
      ator,
      {
        parceiroId: parceiro.id,
        ofertaId: oferta.id,
        nome: `Campanha ${sufixo}`,
        canal: 'SOCIAL',
        codigo,
        tipoDestino: 'NIP',
        caminhoNip: `/oferta/${codigo}`,
      },
      AGORA,
    )
    const linkCasa = await criarCampanhaComLink(
      banco.db,
      ator,
      {
        parceiroId: parceiro.id,
        ofertaId: oferta.id,
        nome: `Campanha casa ${sufixo}`,
        canal: 'SOCIAL',
        codigo: `${codigo}-casa`,
        tipoDestino: 'CASA',
      },
      AGORA,
    )
    return { ator, link, linkCasa, codigo }
  }

  async function renderizar(codigo: string) {
    const { default: Pagina } = await import('@/app/(publico)/oferta/[codigo]/page')
    return resultado(async () => {
      const html = renderToStaticMarkup(await Pagina({ params: Promise.resolve({ codigo }) }))
      return html
    })
  }

  it('link válido renderiza o cartão com a saída por /ir/<codigo> e registra a visita de quem tem cookie', async () => {
    const { link, codigo } = await linkNip()

    // Sem cookie de visitante: renderiza, mas nada é registrado.
    const anonimo = await renderizar(codigo)
    expect(anonimo.mensagem).toContain(`href="/ir/${codigo}"`)
    expect(anonimo.mensagem).toContain('Continuar para a oferta')
    expect(anonimo.mensagem).toContain('href="/"')
    let visitas = await banco.db.select().from(eventosAfiliados).where(eq(eventosAfiliados.linkId, link.id))
    expect(visitas).toHaveLength(0)

    // Com cookie (chegou por /r/<codigo>): a visita é atribuída ao link.
    armario.set(COOKIE_VISITANTE_AFILIADO, novoTokenVisitante())
    const comCookie = await renderizar(codigo)
    expect(comCookie.mensagem).toContain(`href="/ir/${codigo}"`)
    visitas = await banco.db.select().from(eventosAfiliados).where(eq(eventosAfiliados.linkId, link.id))
    expect(visitas).toHaveLength(1)
    expect(visitas[0]!.tipo).toBe('VISITA_NIP')
  })

  it('link pausado vai para /oferta-indisponivel; link que aponta para a casa (não para a NIP) é 404', async () => {
    const { ator, link, linkCasa, codigo } = await linkNip()
    await definirStatusLink(banco.db, ator, link.id, false, AGORA)
    expect(await renderizar(codigo)).toEqual({ redirect: '/oferta-indisponivel' })
    expect(await renderizar(linkCasa.codigo)).toEqual({ notFound: true })
    expect(await renderizar('nao-existe')).toEqual({ redirect: '/oferta-indisponivel' })
  })
})

// ===========================================================================
// ESTÁTICAS: offline, oferta-indisponivel, redefinir
// ===========================================================================

describe('as três telas estáticas não leem requisição nem banco', () => {
  const ESTATICAS = [
    'src/app/(publico)/offline/page.tsx',
    'src/app/(publico)/oferta-indisponivel/page.tsx',
    'src/app/(publico)/redefinir/page.tsx',
  ]

  it.each(ESTATICAS)('%s: sem cookies(), headers(), banco, sessão ou searchParams', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf8')
    expect(fonte).not.toMatch(/sessaoAtual|getDb|DATABASE_URL|cookies\(|headers\(|searchParams|force-dynamic/)
  })

  it('offline e oferta-indisponivel renderizam sem dado nenhum, com o texto que o service worker precisa', async () => {
    const { default: Offline } = await import('@/app/(publico)/offline/page')
    const offline = renderToStaticMarkup(await Offline())
    expect(offline).toContain('Sem conexão')
    expect(offline).toContain('Nenhum dado')
    expect(offline).toContain('href="/"')

    const { default: Indisponivel } = await import('@/app/(publico)/oferta-indisponivel/page')
    const indisponivel = renderToStaticMarkup(await Indisponivel())
    expect(indisponivel).toContain('Esta oferta não está disponível')
    expect(indisponivel).toContain('Nenhuma ação comercial')
    expect(indisponivel).toContain('href="/"')
  })

  it('o service worker continua pré-cacheando /offline nesse caminho', () => {
    expect(readFileSync('public/sw.js', 'utf8')).toContain("'/offline'")
  })
})

// ===========================================================================
// ADMIN / ENTRAR
// ===========================================================================

describe('/admin/entrar — uma rota só, com o login do painel', () => {
  it('só existe a versão do v2; o grupo (admin) inteiro saiu com a Tarefa 9 e o painel mora em (app)/admin', () => {
    expect(existsSync('src/app/(acesso-admin)/admin/entrar/page.tsx')).toBe(true)
    expect(existsSync('src/app/(admin)')).toBe(false)
    expect(existsSync('src/app/(app)/admin/page.tsx')).toBe(true)
  })

  it('o destino do login do painel é o índice /admin, que está na allowlist — senão cairia em / em silêncio', async () => {
    const { default: Pagina } = await import('@/app/(acesso-admin)/admin/entrar/page')
    const html = renderToStaticMarkup(await Pagina())
    const destino = /name="destino" value="([^"]*)"/.exec(html)?.[1]
    expect(ALLOWLIST_DO_LOGIN).toContain(destino)
    expect(destino).toBe('/admin')
    expect(html).toContain('Painel administrativo')
    // A ação do painel passa pela MESMA allowlist e pelo MESMO autenticar.
    const acao = readFileSync('src/features/admin/entrar/acoes.ts', 'utf8')
    expect(acao).toContain('destinoInternoSeguro(')
    expect(acao).toContain('ipDaRequisicao()')
    expect(acao).toMatch(/autenticar\(/)
  })
})
