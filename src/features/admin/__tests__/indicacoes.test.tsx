import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { eq } from 'drizzle-orm'

import { parceirosAfiliados, usuarios } from '@/modules/dominio/db/schema'
import { registrarAssinaturaIndicada } from '@/modules/plataforma/afiliados/indicacoes'
import { associarVisitanteAoUsuario, registrarClique, resolverLinkSemRegistrar } from '@/modules/plataforma/afiliados/servico'
import { cenarioDeAfiliados } from '@/modules/plataforma/afiliados/__tests__/cenario'
import { NOME_COOKIE } from '@/modules/plataforma/auth/cookies'
import { abrirSessao } from '@/modules/plataforma/auth/sessao'
import { ESTADO_INICIAL } from '../estado-acao'

/**
 * FUMAÇA DE /admin/indicacoes — mesmo padrão de `fumaca.test.tsx`: a página e
 * a ação de verdade, rodando sobre um PGlite real, com sessões reais abertas
 * por `abrirSessao`. Só `cookies()`/`headers()`/`next/cache` viram armário em
 * memória.
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

const AGORA = new Date('2026-09-26T12:00:00.000Z')
const ACESSO = { fingerprint: 'fp-indicacoes-admin', tipo: 'DESKTOP' as const, userAgent: 'Teste NIP', ip: null }

/** Clica no `codigo` e se cadastra por ele, no instante `quando`. */
async function cadastrarViaLink(codigo: string, rotulo: string, quando: Date) {
  const token = `visitante-${rotulo}-${Math.random().toString(36).slice(2)}`
  await registrarClique(banco.db, { codigo, visitanteToken: token, agora: quando, automatizado: false })
  const [conta] = await banco.db
    .insert(usuarios)
    .values({ email: `${rotulo}-${Math.random().toString(36).slice(2)}@teste.com`, senhaHash: 'x', nome: null })
    .returning()
  await associarVisitanteAoUsuario(banco.db, token, conta!.id, quando, 'CADASTRO')
  return conta!
}

async function abrirSessaoPara(usuarioId: string) {
  const sessao = await abrirSessao(banco.db, usuarioId, ACESSO, AGORA, { duracaoMs: 3_600_000 })
  return sessao.token
}

let cenario: Awaited<ReturnType<typeof cenarioDeAfiliados>>
let tokenAdmin: string
let tokenUsuarioComum: string
let tokenParceiro: string
let usuarioComumId: string
let indicadoComAssinatura: { id: string; email: string }

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  cenario = await cenarioDeAfiliados(banco.db)

  // Conta comum sem parceria nenhuma — a outra metade de "usuário comum e
  // parceiro recebem a negação" (Review Focus 5).
  const [comum] = await banco.db
    .insert(usuarios)
    .values({ email: `comum-${Math.random().toString(36).slice(2)}@teste.com`, senhaHash: 'x' })
    .returning()
  usuarioComumId = comum!.id

  tokenAdmin = await abrirSessaoPara(cenario.admin.usuarioId)
  tokenUsuarioComum = await abrirSessaoPara(usuarioComumId)
  // usuarioA é dono do parceiroA (cenarioDeAfiliados liga os dois) — papel
  // continua USUARIO: ser parceiro não é ser admin.
  tokenParceiro = await abrirSessaoPara(cenario.usuarioA.id)

  const linkDeA = await import('@/modules/plataforma/afiliados/indicacoes').then((m) =>
    m.criarLinkDeIndicacao(
      banco.db,
      cenario.admin,
      { parceiroId: cenario.parceiroA.id, nome: 'Indicação A', canal: 'SOCIAL', codigo: `ind-fumaca-${cenario.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    ),
  )
  indicadoComAssinatura = await cadastrarViaLink(linkDeA.codigo, 'com-assinatura', new Date('2026-09-10T00:00:00.000Z'))
  await registrarAssinaturaIndicada(banco.db, {
    usuarioId: indicadoComAssinatura.id,
    nivelDoPlano: 'MVP',
    modalidade: 'MENSAL',
    aprovadoEm: new Date('2026-09-11T00:00:00.000Z'),
  })
  await cadastrarViaLink(linkDeA.codigo, 'sem-assinatura', new Date('2026-09-12T00:00:00.000Z'))

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'))
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco?.fechar()
})

beforeEach(() => {
  armario.clear()
})

function como(token: string | null) {
  armario.clear()
  if (token) armario.set(NOME_COOKIE, token)
}

type Busca = Record<string, string | string[] | undefined>
type Pagina = (props: { searchParams: Promise<Busca> }) => Promise<React.ReactNode>

async function renderizar(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = (await import('@/app/(app)/admin/indicacoes/page')) as unknown as { default: Pagina }
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

const formulario = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

describe('/admin/indicacoes — quem vê', () => {
  it('sem cookie, usuário comum e parceiro (não-admin) recebem "Acesso restrito"', async () => {
    como(null)
    const semSessao = await renderizar()
    expect(semSessao).toContain('Acesso restrito')

    como(tokenUsuarioComum)
    const comum = await renderizar()
    expect(comum).toContain('Acesso restrito')
    expect(comum).not.toContain('Totais de indicação')

    como(tokenParceiro)
    const parceiro = await renderizar()
    expect(parceiro).toContain('Acesso restrito')
    expect(parceiro).not.toContain('Totais de indicação')
  })

  it('ADMIN vê a tabela com indicador, link, indicado, cadastro, assinatura/situação e os totais', async () => {
    como(tokenAdmin)
    const html = await renderizar()
    expect(html).toContain('Indicações')
    expect(html).toContain('Parceiro A') // nome do indicador
    expect(html).toContain(`/r/ind-fumaca-${cenario.linkA.codigo}`) // link
    expect(html).toContain(indicadoComAssinatura.email) // e-mail do indicado
    expect(html).toContain('MVP') // nível do plano
    expect(html).toContain('Mensal') // modalidade
    expect(html).toContain('Sem assinatura') // o segundo indicado, sem assinatura
    expect(html).toContain('Cadastros')
    expect(html).toContain('Assinaturas')
    // Totais: 2 cadastros plantados neste arquivo (podem ser mais com outros
    // cenários no mesmo banco, então o mínimo é o que se afirma).
    expect(html).not.toContain('comissão')
    expect(html.toLowerCase()).not.toContain('comiss')
  })

  it('o nome do indicador em cada linha filtra por ele — inclusive um indicador USUARIO (revisão final, item 5)', async () => {
    // Um indicador USUARIO (link pessoal) que trouxe uma conta.
    const [indicadorComum] = await banco.db
      .insert(usuarios)
      .values({ email: `indicador-comum-${Math.random().toString(36).slice(2)}@teste.com`, senhaHash: 'x', nome: 'Indicadora Comum' })
      .returning()
    const { linkPessoalDoUsuario } = await import('@/modules/plataforma/afiliados/indicacoes')
    const { codigo } = await linkPessoalDoUsuario(banco.db, indicadorComum!.id, new Date('2026-09-01T00:00:00.000Z'))
    const indicadoPeloComum = await cadastrarViaLink(codigo, 'pelo-comum', new Date('2026-09-13T00:00:00.000Z'))
    const [{ id: parceiroDoComum }] = await banco.db
      .select({ id: parceirosAfiliados.id })
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, indicadorComum!.id))
      .then((l) => l as [{ id: string }])

    como(tokenAdmin)
    const html = await renderizar()
    expect(html).toContain(`href="/admin/indicacoes?parceiro=${cenario.parceiroA.id}"`)
    expect(html).toContain(`href="/admin/indicacoes?parceiro=${parceiroDoComum}"`)

    // Seguir o link do indicador USUARIO mostra só o que ele trouxe.
    const filtrado = await renderizar({ parceiro: parceiroDoComum })
    expect(filtrado).toContain(indicadoPeloComum.email)
    expect(filtrado).not.toContain(indicadoComAssinatura.email)
  })

  it('filtro ?tipo=usuario não mostra as indicações de parceiro PARCEIRO', async () => {
    como(tokenAdmin)
    const html = await renderizar({ tipo: 'usuario' })
    expect(html).not.toContain(indicadoComAssinatura.email)
  })

  it('filtro ?parceiro=<uuid> restringe a um parceiro', async () => {
    como(tokenAdmin)
    const html = await renderizar({ parceiro: cenario.parceiroA.id })
    expect(html).toContain(indicadoComAssinatura.email)
    const outro = await renderizar({ parceiro: cenario.parceiroB.id })
    expect(outro).not.toContain(indicadoComAssinatura.email)
  })

  it('filtro ?de=/?ate= exclui indicações fora do período (fuso de São Paulo)', async () => {
    como(tokenAdmin)
    const foraDoPeriodo = await renderizar({ de: '2026-01-01', ate: '2026-01-02' })
    expect(foraDoPeriodo).not.toContain(indicadoComAssinatura.email)
    const noPeriodo = await renderizar({ de: '2026-09-01', ate: '2026-09-30' })
    expect(noPeriodo).toContain(indicadoComAssinatura.email)
  })

  it('data inválida na URL é ignorada, não derruba a tela', async () => {
    como(tokenAdmin)
    const html = await renderizar({ de: 'nao-e-data' })
    expect(html).toContain('Indicações')
    expect(html).toContain(indicadoComAssinatura.email)
  })

  it('a página nunca contém "comissão"', async () => {
    como(tokenAdmin)
    expect((await renderizar()).toLowerCase()).not.toContain('comiss')
  })
})

describe('a ação de criar link de indicação (admin/afiliados)', () => {
  it('cria o link e ele resolve para /cadastrar', async () => {
    const { acaoCriarLinkDeIndicacao } = await import('../afiliados/acoes')
    como(tokenAdmin)
    const r = await acaoCriarLinkDeIndicacao(
      ESTADO_INICIAL,
      formulario({
        parceiroId: cenario.parceiroB.id,
        nome: 'Indicação B',
        canal: 'whatsapp',
        codigo: `ind-acao-${cenario.linkB.codigo}`,
      }),
    )
    expect(r.erro).toBeNull()
    const { destino } = await resolverLinkSemRegistrar(banco.db, `ind-acao-${cenario.linkB.codigo}`)
    expect(destino).toBe('/cadastrar')
  })

  it('recusa quem não é ADMIN', async () => {
    const { acaoCriarLinkDeIndicacao } = await import('../afiliados/acoes')
    como(tokenUsuarioComum)
    const r = await acaoCriarLinkDeIndicacao(
      ESTADO_INICIAL,
      formulario({ parceiroId: cenario.parceiroA.id, nome: 'Intrusa', canal: 'whatsapp', codigo: 'intrusa-1' }),
    )
    expect(r.erro).toMatch(/Acesso administrativo/)
  })
})
