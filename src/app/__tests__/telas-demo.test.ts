import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { semearDemo } from '../../modules/ingestao/demo/semear'

/**
 * FUMAÇA DAS TELAS NOVAS.
 *
 * O `next build` prova que compilam; não prova que renderizam. Estas duas
 * telas leem estruturas que acabaram de nascer (conferência agrupada por
 * jogador, plano de banca) e um erro de runtime aqui só apareceria com o
 * cliente na frente da tela.
 *
 * Renderiza o componente de servidor de verdade, com o banco de verdade
 * semeado pela demo. Só sessão e direito de acesso são simulados — são a
 * fronteira de autenticação, não o que está sob teste.
 */

// Pelo carregador da ENTREGA, não pelo do motor: a fronteira proíbe `src/app`
// de importar valor do motor, e o teste vive dentro de src/app.
const AGORA = new Date()
const HOJE = AGORA.toISOString().slice(0, 10)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: 'u1', email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => ({ permitido: true }),
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await semearDemo(banco.db, await rulesetAtivo(), AGORA)
}, 180_000)

afterAll(async () => {
  await banco.fechar()
})

describe('Lista Secreta', () => {
  it('mostra um card por jogador e atributo, com o filtro de atributo', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('Lista Secreta')
    // Com rebotes e assistências no ar, o recorte por atributo precisa existir.
    expect(html).toContain('Atributo')
    expect(html).toContain('Rebotes')
    expect(html).toContain('Assistências')
    // O link do detalhe leva o atributo: sem ele a tela de linhas escolheria
    // sozinha qual dos três apitos do jogador mostrar.
    expect(html).toMatch(/\/apito\/[0-9a-f-]+\?atributo=(PONTOS|REBOTES|ASSISTENCIAS)/)
    expect(html).not.toContain('Nenhuma entrada para hoje')
  }, 60_000)

  it('o recorte por atributo devolve só aquele atributo', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ atributo: 'REBOTES' }) }),
    )

    expect(html).not.toContain('Nada com esse filtro')
    expect(html).toContain('REB')
    expect(html).not.toContain(' · PTS')
  }, 60_000)
})

describe('detalhe do apito', () => {
  it('mostra as linhas do atributo pedido, com a faixa das casas', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const rebote = feed!.conteudo.itens.find((i) => i.atributo === 'REBOTES')!

    const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ jogadorId: rebote.jogadorId }),
        searchParams: Promise.resolve({ atributo: 'REBOTES' }),
      }),
    )

    expect(html).toContain('Linhas de rebotes')
    expect(html).toContain('REB')
    // O seed cotou três casas: a tela não pode cair na tabela de referência.
    expect(html).toContain('Faixa entre 3 casas')
    // P12: o percentual nunca é chamado de probabilidade sem negação na frente.
    expect(html).toContain('não uma')
  }, 60_000)
})

describe('tela de Resultados', () => {
  it('renderiza a conferência das rodadas encerradas', async () => {
    const { default: Pagina } = await import('../(app)/resultados/page')
    const html = renderToStaticMarkup(await Pagina())

    expect(html).toContain('Resultados')
    expect(html).toContain('bateram a linha')
    // Se a conferência viesse vazia, a tela cairia no estado vazio — e a demo
    // abriria numa tela em branco.
    expect(html).not.toContain('Nenhuma rodada encerrada ainda')
    expect(html).toMatch(/bateu \d+/)
  }, 60_000)
})

describe('tela de Gestão de banca', () => {
  it('renderiza o plano do dia com o aviso de modelo de demonstração', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ banca: '1000' }) }))

    expect(html).toContain('Gestão de banca')
    // O aviso não é decoração: é o que separa um exemplo de uma recomendação.
    expect(html).toContain('Modelo de demonstração')
    expect(html).toContain('1 unidade')
    expect(html).not.toContain('Modelo de gestão ainda não definido')
  }, 60_000)

  it('banca inválida cai no padrão em vez de espalhar NaN pela tela', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ banca: 'abc' }) }))

    expect(html).not.toContain('NaN')
  }, 60_000)
})
