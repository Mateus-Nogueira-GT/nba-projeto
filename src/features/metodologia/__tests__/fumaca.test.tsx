import { eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogos, times, usuarios } from '@/modules/dominio/db/schema'
import { dataDeReferencia } from '@/modules/dominio/rodada'

/**
 * FUMAÇA DO PORTÃO DA METODOLOGIA E DA ABERTURA DO V2 (I7).
 *
 * Aqui o guarda e o direito são os DE VERDADE, sobre um PGlite de verdade: o
 * único mock de acesso é a sessão (o cookie). É isso que prova o laço inteiro
 * — sem aceite, `/` manda para `/metodologia`; a ação grava a data na coluna
 * que `avaliarAcesso` lê; e na visita seguinte o MESMO `exigirNivel` deixa
 * passar. Um mock de `avaliarAcesso` provaria só que o teste sabe mentir.
 *
 * Herda as invariantes de `telas-metodologia.test.ts` (aposentada junto com a
 * página antiga) e dá corpo de comportamento à abertura, que
 * `telas-abrir.test.ts` só conferia pela fonte.
 */

const USUARIO = '00000000-0000-4000-8000-000000000001'
const FUSO = 'America/Sao_Paulo'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    useRouter: () => ({ refresh: () => {}, back: () => {}, push: () => {} }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  }
})

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  await banco.db.insert(usuarios).values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

/** O destino do `redirect()` — o Next o carrega no `digest` do erro lançado. */
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

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

async function paginaDaLista() {
  const { default: Pagina } = await import('@/app/(app)/page')
  return Pagina({ searchParams: Promise.resolve({}) })
}

async function paginaDaMetodologia(destino?: string) {
  const { default: Pagina } = await import('@/app/(app)/metodologia/page')
  return Pagina({ searchParams: Promise.resolve(destino === undefined ? {} : { destino }) })
}

async function zerarAceite() {
  await banco.db.update(usuarios).set({ metodologiaAceitaEm: null }).where(eq(usuarios.id, USUARIO))
}

describe('I7 · o aceite da metodologia é obrigatório — e depois dele a pessoa entra', () => {
  beforeEach(zerarAceite)

  it('sem aceite, abrir a Lista leva a /metodologia com o destino na URL', async () => {
    expect(await destinoDoRedirect(paginaDaLista())).toBe('/metodologia?destino=%2F')
  }, 60_000)

  it('a tela do portão tem o texto da metodologia e o botão de aceitar, carregando o destino', async () => {
    const html = renderToStaticMarkup(await paginaDaMetodologia('/'))
    expect(html).toContain('OK, concordo')
    expect(html).toContain('Ao confirmar, você declara que leu')
    expect(html).toMatch(/type="hidden" name="destino" value="\/"/)
    // É um portão, não uma leitura: nada de "voltar".
    expect(html).not.toContain('aria-label="Voltar"')
  }, 60_000)

  it('aceitar grava a DATA pela ação real, volta ao destino, e o guarda passa a deixar entrar', async () => {
    const { aceitarMetodologia } = await import('@/features/metodologia/acoes')
    const dados = new FormData()
    dados.set('destino', '/')
    expect(await destinoDoRedirect(aceitarMetodologia(dados))).toBe('/')

    const [linha] = await banco.db.select().from(usuarios).where(eq(usuarios.id, USUARIO))
    expect(linha!.metodologiaAceitaEm).toBeInstanceOf(Date)

    const { exigirNivel } = await import('@/modules/plataforma/assinatura/guarda')
    await expect(exigirNivel('GRATIS', '/')).resolves.toMatchObject({
      acesso: { nivel: 'GRATIS' },
    })
    // E a Lista renderiza de fato — o laço fechou.
    expect(await destinoDoRedirect(paginaDaLista())).toBeNull()
  }, 60_000)

  it.each([
    ['https://evil.com', '/abrir'],
    ['//evil.com', '/abrir'],
    ['/\\evil.com', '/abrir'],
    ['javascript:alert(1)', '/abrir'],
    ['/assinar', '/assinar'],
    ['/conta', '/conta'],
  ])('destino=%j: só caminho interno volta (sem open redirect) → %j', async (bruto, esperado) => {
    const { aceitarMetodologia } = await import('@/features/metodologia/acoes')
    const dados = new FormData()
    dados.set('destino', bruto)
    expect(await destinoDoRedirect(aceitarMetodologia(dados))).toBe(esperado)
  }, 60_000)

  it('sem destino, o aceite cai na ABERTURA', async () => {
    const { aceitarMetodologia } = await import('@/features/metodologia/acoes')
    expect(await destinoDoRedirect(aceitarMetodologia(new FormData()))).toBe('/abrir')
  }, 60_000)

  it('o destino forjado na URL do portão também é saneado antes de ir para o formulário', async () => {
    const html = renderToStaticMarkup(await paginaDaMetodologia('https://evil.com'))
    expect(html).toMatch(/name="destino" value="\/abrir"/)
    expect(html).not.toContain('evil.com')
  }, 60_000)

  it('a página do portão não passa pelo guarda de nível — senão mandaria para ela mesma', () => {
    const fonte = semComentarios(readFileSync('src/app/(app)/metodologia/page.tsx', 'utf8'))
    expect(fonte).not.toContain('exigirNivel')
    expect(fonte).toContain('sessaoAtual')
    // A casca também não é portão (mesmo laço).
    expect(semComentarios(readFileSync('src/app/(app)/layout.tsx', 'utf8'))).not.toContain('exigirNivel')
  })

  it('o aceite viaja na consulta do acesso — nenhuma ida extra ao banco por navegação', () => {
    // `avaliarAcesso` faz UMA consulta de propósito (ADR-0008). Ler a coluna à
    // parte no guarda acrescentaria uma terceira ida em toda navegação.
    const guarda = readFileSync('src/modules/plataforma/assinatura/guarda.ts', 'utf8')
    expect(guarda).toContain('acesso.metodologiaAceitaEm')
    expect(guarda).not.toContain('select(')
    const direito = readFileSync('src/modules/plataforma/assinatura/direito.ts', 'utf8')
    expect(direito).toContain('metodologiaAceitaEm: usuarios.metodologiaAceitaEm')
  })

  it('o guarda confere o aceite ANTES do nível: a conta nova lê o método antes de ver preço', async () => {
    const { exigirNivel } = await import('@/modules/plataforma/assinatura/guarda')
    // GRATIS pedindo uma tela MVP, sem aceite: metodologia, não /assinar.
    const destino = await destinoDoRedirect(exigirNivel('MVP', '/gestao'))
    expect(destino).toBe('/metodologia?destino=%2Fgestao')
  }, 60_000)
})

describe('Como funciona — a mesma leitura, sem aceite e sem assinatura', () => {
  beforeEach(zerarAceite)

  it('renderiza para quem ainda não aceitou, com o mesmo texto do portão e sem o botão', async () => {
    const { default: Pagina } = await import('@/app/(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    const portao = renderToStaticMarkup(await paginaDaMetodologia())
    // Uma frase que só existe no conteúdo da metodologia: as duas telas leem o
    // MESMO componente, e não duas cópias do texto.
    const frase = 'nota de confiança da análise NIP'
    expect(html).toContain(frase)
    expect(portao).toContain(frase)
    expect(html).not.toContain('OK, concordo')
  }, 60_000)

  it('a odd do exemplo mostra só o valor, na forma do ruleset — o rótulo fica para o leitor de tela', async () => {
    // Como a `PilulaOdd` da Lista e o v2: "1,85", nunca "Odd 1,85". O valor
    // continua vindo de `oddDaLinha` (o ruleset diz a forma: `casa_unica`).
    const { default: Pagina } = await import('@/app/(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html).toMatch(/<span class="num" title="Odd">1,85</)
    expect(html).not.toContain('Odd 1,85')
  }, 60_000)

  it('exige sessão, mas NÃO o guarda de nível (vitrine para quem ainda não assinou)', () => {
    const fonte = semComentarios(readFileSync('src/app/(app)/como-funciona/page.tsx', 'utf8'))
    expect(fonte).toContain('sessaoAtual')
    expect(fonte).not.toContain('exigirNivel')
    expect(fonte).not.toContain('avaliarAcesso')
  })
})

describe('I7 · /abrir leva ao Ao Vivo quando há jogo no 1º quarto, e à Lista quando não há', () => {
  // Meio da noite de jogo em Brasília: a rodada de referência é a de hoje.
  const AGORA = new Date('2026-01-15T23:30:00.000Z')
  let casa: string
  let visitante: string

  beforeAll(async () => {
    const [a, b] = await banco.db
      .insert(times)
      .values([
        { sigla: 'AAA', nome: 'Time A' },
        { sigla: 'BBB', nome: 'Time B' },
      ])
      .returning({ id: times.id })
    casa = a!.id
    visitante = b!.id
  })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await banco.db.delete(jogos)
  })

  async function comJogo(status: 'AGENDADO' | 'AO_VIVO', quartoAtual: number | null) {
    await banco.db.insert(jogos).values({
      dataHoraUtc: new Date(AGORA.getTime() - 10 * 60_000),
      dataReferencia: dataDeReferencia(AGORA, FUSO),
      timeCasaId: casa,
      timeVisitanteId: visitante,
      status,
      quartoAtual,
    })
  }

  async function abrir() {
    const { default: Pagina } = await import('@/app/abrir/page')
    return destinoDoRedirect(Pagina())
  }

  it('jogo AO VIVO no 1º quarto → Ao Vivo', async () => {
    await comJogo('AO_VIVO', 1)
    expect(await abrir()).toBe('/fire-live')
  }, 60_000)

  it('jogo já depois do 1º quarto → Lista', async () => {
    await comJogo('AO_VIVO', 2)
    expect(await abrir()).toBe('/')
  }, 60_000)

  it('jogo ainda agendado → Lista', async () => {
    await comJogo('AGENDADO', null)
    expect(await abrir()).toBe('/')
  }, 60_000)

  it('hiato entre temporadas (fix round 1): sem jogo hoje e só a temporada passada com dado → Estatísticas', async () => {
    // O calendário já virou para 2026-27 (outubro), mas o único jogo
    // encerrado no banco é de 2025-26: a consulta ainda exibe a passada, e a
    // Lista estaria vazia por ~32 dias. `/abrir` manda para Estatísticas.
    await banco.db.insert(jogos).values({
      dataHoraUtc: new Date('2026-01-15T23:00:00.000Z'),
      dataReferencia: '2026-01-15',
      timeCasaId: casa,
      timeVisitanteId: visitante,
      status: 'ENCERRADO',
    })
    vi.setSystemTime(new Date('2026-10-02T18:00:00.000Z'))
    expect(await abrir()).toBe('/estatisticas')
  }, 60_000)

  it('banco vazio não é hiato: sem dado nenhum, a abertura é a Lista', async () => {
    vi.setSystemTime(new Date('2026-10-02T18:00:00.000Z'))
    expect(await abrir()).toBe('/')
  }, 60_000)

  it('existe UMA rota /abrir — fora da casca, sem portão próprio, com a regra do hiato', () => {
    // Grupos não mudam a URL: duas `abrir/page.tsx` seriam a mesma rota duas vezes.
    expect(() => readFileSync('src/app/(app)/abrir/page.tsx', 'utf8')).toThrow()
    const fonte = semComentarios(readFileSync('src/app/abrir/page.tsx', 'utf8'))
    expect(fonte).not.toContain('exigirNivel')
    expect(fonte).toContain('emHiato')
    expect(fonte).toContain("redirect('/estatisticas')")
  })
})
