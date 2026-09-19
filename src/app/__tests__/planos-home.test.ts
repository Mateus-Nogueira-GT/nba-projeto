import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'

/**
 * A HOME E OS RESULTADOS POR NÍVEL (spec §5, decisões 5 e 9).
 *
 * Mesmo arnês das demais suítes de tela: componente de servidor de verdade
 * sobre banco semeado por `simularAte`; sessão fixa e ACESSO mutável — é o
 * `nivelNoTeste` que alterna a renderização entre GRATIS e MVP no mesmo
 * arquivo, sem reabrir o banco. NENHUMA asserção nomeia jogador ou time: o
 * sujeito vem do banco.
 */

const AGORA = new Date('2026-01-15T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelNoTeste: NivelDoPlano = 'GRATIS'

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelNoTeste) }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  // 2 dias não bastam: sem médias suficientes o motor não apita rodada
  // passada nenhuma, e o teste de Resultados precisa achar UMA rodada com
  // conferência antes de hoje. Com 5 dias, a rodada de ontem já tem apito e
  // está ENCERRADA (conferido diretamente contra o banco de teste).
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 5, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  // A tela calcula "hoje" com `new Date()` — sem congelar o relógio no
  // instante semeado, ela consultaria o dia real e nunca acharia a rodada.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)
afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await banco.fechar()
})

async function renderizarHome() {
  const { default: Pagina } = await import('../(app)/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

/** O HTML sem a coluna da direita. */
function semLateral(html: string): string {
  return html.replace(/<aside[\s\S]*?<\/aside>/g, '')
}

describe('a home por nível (spec §5, linha 1)', () => {
  it('GRATIS vê os jogos do dia e o convite — e NENHUM apito', async () => {
    nivelNoTeste = 'GRATIS'
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const ruleset = await rulesetAtivo()
    const feed = await lerFeed(banco.db, dataDeReferencia(AGORA, ruleset.rodada.fuso))
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const jogos = await jogosDoDiaResumo(
      banco.db,
      dataDeReferencia(AGORA, ruleset.rodada.fuso),
      ruleset.rodada.fuso,
    )
    expect(feed!.conteudo.itens.length).toBeGreaterThan(0)
    expect(jogos.length).toBeGreaterThan(0)

    const html = await renderizarHome()
    // Os confrontos estão lá — o sujeito vem do banco, nunca de um nome fixo.
    expect(html).toContain(jogos[0]!.casaSigla)
    // O sinal NÃO está: nem o nome de quem apitou, nem a confiança, nem o card.
    for (const item of feed!.conteudo.itens) expect(html).not.toContain(item.nome)
    expect(html).not.toMatch(/confian[çc]a/i)
    expect(html).not.toContain('href="/apito/')
    expect(html).toContain('começa no')
    expect(html).toMatch(/href="\/assinar\?nivel=MVP/)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('MVP vê a Lista inteira', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarHome()
    expect(html).toContain('href="/apito/')
    // A LATERAL fica de fora: o banner de plano mora nela para o grátis
    // (identidade 05, §8) e não bloqueia nada — o que esta asserção prova é
    // que o CONTEÚDO da tela vem inteiro, sem convite no lugar dele.
    expect(semLateral(html)).not.toContain('começa no')
  })

  it('Resultados é inteiro para o GRATIS — a prova social (decisão 9)', async () => {
    nivelNoTeste = 'GRATIS'
    const { recapDaNoite, ultimaRodadaConferida } = await import('../../modules/entrega/resultados')
    const ruleset = await rulesetAtivo()
    const hoje = dataDeReferencia(AGORA, ruleset.rodada.fuso)
    const data = await ultimaRodadaConferida(banco.db, hoje)
    expect(data).not.toBeNull()
    const recap = await recapDaNoite(banco.db, data!)
    expect(recap.publicados).toBeGreaterThan(0)

    const { default: Pagina } = await import('../(app)/resultados/[data]/page')
    const html = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ data: data! }), searchParams: Promise.resolve({}) }),
    )
    // Nada de convite nem redirecionamento — a tela é a mesma para todo nível.
    // A LATERAL fica de fora: o banner de plano mora nela para o grátis
    // (identidade 05, §8) e não bloqueia nada — o que esta asserção prova é
    // que o CONTEÚDO da tela vem inteiro, sem convite no lugar dele.
    expect(semLateral(html)).not.toContain('começa no')
    // O conteúdo da análise está inteiro: um card conferido por apitado
    // publicado, o mesmo que o pago veria (spec, decisão 9). Diferente da
    // home, esta tela não linka para `/apito/` para nenhum nível — o card
    // aqui é o `CardEntrada` sem `detalheHref` — então a prova de que está
    // "inteira" é o conteúdo em si, não um link que nunca existiu aqui.
    expect((html.match(/<article\b/g) ?? []).length).toBe(recap.publicados)
    expect(html).toContain('APITOS')
  })
})
