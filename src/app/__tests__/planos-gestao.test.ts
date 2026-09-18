import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import { registrarEntradaRealizada } from '../../modules/entrega/gestao-realizadas'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'

/**
 * A GESTÃO POR NÍVEL (spec §5, linha 7; decisão 8).
 *
 * O grátis mantém o HISTÓRICO do que já registrou — quem cancelou não perde
 * o que tinha (gancho de retenção) — mas a aba Sugeridas, e o formulário
 * "Registrei" que ela carrega, só existe a partir do MVP: esconder o
 * formulário na tela não é o portão (isso é a Task 8 do `acoes.ts`), aqui só
 * se prova o que a TELA mostra.
 *
 * Mesmo arnês de `telas-05-gestao.test.ts` (temporada simulada, uma entrada
 * realizada semeada) mais o ACESSO MUTÁVEL de `planos-home.test.ts` /
 * `planos-fire-live.test.ts`: um banco só, `nivelNoTeste` alterna a
 * renderização entre GRATIS e MVP no mesmo arquivo. NENHUMA asserção nomeia
 * jogador ou time — o sujeito vem do banco.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelNoTeste: NivelDoPlano = 'GRATIS'
let entradaSemeada: { unidadesEmTexto: string }

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
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  // A aba Realizadas é histórico e precisa de UMA linha semeada para provar
  // que o grátis continua vendo o que já registrou. `unidadesEmTexto` é a
  // mesma afirmação que `telas-05-gestao.test.ts` já faz sobre esta linha.
  const feed = await lerFeed(banco.db, HOJE)
  const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
  await registrarEntradaRealizada(banco.db, {
    usuarioId: USUARIO,
    dataReferencia: HOJE,
    jogadorId: item.jogadorId,
    atributo: item.atributo,
    linha: item.linha!,
    unidades: 1,
    odd: null,
    agora: AGORA,
  })
  entradaSemeada = { unidadesEmTexto: '1 unidade' }

  // A tela calcula "hoje" com `new Date()` — sem congelar o relógio no
  // instante semeado, ela nunca acharia a rodada de 15/01.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarGestao(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

describe('a gestão por nível (spec §5, linha 7)', () => {
  it('GRATIS em ?ver=sugeridas: o convite no lugar das sugestões, sem formulário nem sinal', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarGestao({ ver: 'sugeridas' })
    expect(html).toContain('começa no')
    expect(html).not.toContain('name="unidades"')
    expect(html).not.toMatch(/<form[^>]*action=/)

    // COBERTURA FALSA achada na revisão final: as três asserções acima só
    // travam o FORMULÁRIO, não o SINAL — a revisão injetou, neste mesmo
    // ramo, uma lista com nome, sigla e nível do apito de todas as
    // `plano.entradas` (que já está em escopo no JSX de `PaginaGestao`
    // mesmo aqui) e a suíte inteira continuou verde. Hoje card e formulário
    // são inseparáveis dentro de `LinhaSugerida`, mas nada aqui provava
    // isso; um refactor reabre em silêncio. Mesmo padrão de varredura de
    // `planos-home.test.ts`/`planos-fire-live.test.ts`: percorrer TODAS as
    // entradas do plano, não só a primeira.
    const { planoDoDia, BANCA_PADRAO } = await import('../../modules/entrega/gestao')
    const plano = await planoDoDia(banco.db, await rulesetAtivo(), HOJE, BANCA_PADRAO)
    expect(plano.entradas.length).toBeGreaterThan(0)
    for (const { item } of plano.entradas) expect(html).not.toContain(item.nome)
    expect(html).not.toContain('href="/apito/')
  })

  it('GRATIS em ?ver=realizadas: o histórico aparece como sempre', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarGestao({ ver: 'realizadas' })
    expect(html).toContain('Realizadas')
    // A linha semeada está lá — o sujeito é lido do banco pelo arnês.
    expect(html).toContain(entradaSemeada.unidadesEmTexto)
  })

  it('MVP em ?ver=sugeridas: as sugestões e o formulário', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarGestao({ ver: 'sugeridas' })
    expect(html).not.toContain('começa no')
    expect(html).toContain('name="unidades"')
  })
})
