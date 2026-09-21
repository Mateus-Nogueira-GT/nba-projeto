import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { acessoDeTeste } from '../../modules/plataforma/__tests__/acesso-de-teste'

/**
 * O PORTÃO DA METODOLOGIA (spec 20/09).
 *
 * Três coisas precisam ser verdade: a tela mostra o MESMO texto da
 * `/como-funciona` com um aceite no fim; aceitar grava a data e devolve a
 * pessoa ao destino; e o guarda manda para cá quem ainda não aceitou, ANTES de
 * mandar para os planos.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const USUARIO = '00000000-0000-4000-8000-000000000001'

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
// O aceite viaja no ACESSO (ele vem na mesma consulta, ADR-0008), então é por
// aqui que o portão é exercitado: `null` = nunca aceitou.
let aceiteNoTeste: Date | null = null
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => acessoDeTeste('MVP', aceiteNoTeste),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
}, 60_000)

afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  aceiteNoTeste = null
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .update(usuarios)
    .set({ metodologiaAceitaEm: null })
    .where(eq(usuarios.id, USUARIO))
})

async function renderizar(destino?: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/metodologia/page')
  return renderToStaticMarkup(
    await Pagina({ searchParams: Promise.resolve(destino ? { destino } : {}) }),
  )
}

/** `redirect()` do Next lança; o destino vai na mensagem. */
async function destinoDoRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (erro) {
    const texto = String((erro as { digest?: string }).digest ?? erro)
    const partes = texto.split(';')
    return partes[2] ?? texto
  }
  throw new Error('esperava um redirect e não houve')
}

describe('a tela de metodologia', () => {
  it('mostra o mesmo texto da /como-funciona, com o aceite no fim', async () => {
    const html = await renderizar()
    expect(html).toContain('OK, CONCORDO')
    // Uma frase que só existe no conteúdo da metodologia: prova que as duas
    // telas leem o MESMO componente, e não duas cópias do texto.
    expect(html).toContain('depois os cards se explicam sozinhos')
  }, 60_000)

  it('não passa pelo guarda de nível — senão o portão a mandaria para ela mesma', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/app/(app)/metodologia/page.tsx', 'utf8')
    expect(fonte).not.toContain('exigirNivel')
    expect(fonte).toContain('sessaoAtual')
  })

  it('não oferece voltar: é um portão, não uma leitura', async () => {
    const html = await renderizar()
    expect(html).not.toContain('aria-label="Voltar"')
  }, 60_000)

  it('aceitar grava a DATA e devolve ao destino pedido', async () => {
    const { aceitarMetodologia } = await import('../(app)/metodologia/acoes')
    const dados = new FormData()
    dados.set('destino', '/assinar')
    const destino = await destinoDoRedirect(() => aceitarMetodologia(dados))
    expect(destino).toContain('/assinar')

    const { usuarios } = await import('../../modules/dominio/db/schema')
    const [linha] = await banco.db.select().from(usuarios).where(eq(usuarios.id, USUARIO))
    expect(linha!.metodologiaAceitaEm).not.toBeNull()
  }, 60_000)

  it('sem destino, o aceite cai na ABERTURA', async () => {
    const { aceitarMetodologia } = await import('../(app)/metodologia/acoes')
    const destino = await destinoDoRedirect(() => aceitarMetodologia(new FormData()))
    expect(destino).toContain('/abrir')
  }, 60_000)
})

describe('o guarda manda para a metodologia quem ainda não aceitou', () => {
  it('sem aceite, qualquer tela vira /metodologia com o destino na URL', async () => {
    const { exigirNivel } = await import('../../modules/plataforma/assinatura/guarda')
    const destino = await destinoDoRedirect(() => exigirNivel('GRATIS', '/gestao'))
    expect(destino).toContain('/metodologia')
    expect(destino).toContain('destino=%2Fgestao')
  }, 60_000)

  it('com aceite, o guarda deixa passar', async () => {
    aceiteNoTeste = new Date()
    const { exigirNivel } = await import('../../modules/plataforma/assinatura/guarda')
    await expect(exigirNivel('GRATIS', '/gestao')).resolves.toBeTruthy()
  }, 60_000)

  it('o aceite viaja na consulta do acesso — nenhuma ida extra ao banco por navegação', async () => {
    // `avaliarAcesso` faz UMA consulta de propósito (ADR-0008: função em iad1,
    // banco em sa-east-1, ~150 ms por ida). Ler a coluna à parte no guarda
    // acrescentaria uma terceira ida em toda navegação autenticada.
    const { readFileSync } = await import('node:fs')
    const guarda = readFileSync('src/modules/plataforma/assinatura/guarda.ts', 'utf8')
    expect(guarda).toContain('acesso.metodologiaAceitaEm')
    expect(guarda).not.toContain('select(')
    const direito = readFileSync('src/modules/plataforma/assinatura/direito.ts', 'utf8')
    expect(direito).toContain('metodologiaAceitaEm: usuarios.metodologiaAceitaEm')
  })
})
