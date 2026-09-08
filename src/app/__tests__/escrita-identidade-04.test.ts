import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlanoDoDia } from '../../modules/entrega/gestao'
import type { Ruleset } from '../../modules/motor/ruleset/schema'

let homologado: Ruleset
let ruleset: Ruleset
let plano: PlanoDoDia

// As páginas e os componentes são reais; estas leituras não precisam de banco
// para provar a escrita de uma nota, de uma linha ou da política de odds.
vi.mock('../../modules/entrega/ruleset-ativo', () => ({ rulesetAtivo: async () => ruleset }))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: 'usuario', email: 'teste@example.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => ({ permitido: true }),
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('../../modules/entrega/gestao', () => ({
  BANCA_PADRAO: 1000,
  planoDoDia: async () => plano,
}))

beforeAll(async () => {
  const entrega = await vi.importActual<typeof import('../../modules/entrega/ruleset-ativo')>(
    '../../modules/entrega/ruleset-ativo',
  )
  homologado = await entrega.rulesetAtivo()
})

beforeEach(() => {
  ruleset = structuredClone(homologado)
  vi.stubEnv('DATABASE_URL', 'postgres://escrita-sem-banco')
  plano = {
    temModelo: true,
    origem: 'demonstracao',
    banca: 1000,
    unidade: 10,
    limites: null,
    totalExposto: 0,
    entradas: [
      {
        entrada: null,
        item: {
          chave: 'jogo-jogador-rebotes',
          jogoId: 'jogo',
          jogadorId: 'jogador',
          nome: 'Jogador de exemplo',
          timeSigla: 'LAL',
          timeNome: 'Los Angeles Lakers',
          fotoUrl: null,
          atributo: 'REBOTES',
          nivelJogador: 'MVP',
          nivelApito: 3,
          turbo: false,
          modoFire: false,
          opdOrigemNivel: null,
          linha: 8,
          confianca: 92,
          grauConfianca: 4,
          alvo1Q: null,
          metodo: 'OSCILACAO',
          posicao: 'C',
          ultimos5: [],
          mediaTemporada: 10,
          oddFaixa: null,
        },
      },
    ],
  }
})

afterEach(() => vi.unstubAllEnvs())

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const secao = (html: string, titulo: string) => {
  const trecho = html.match(/<section\b[\s\S]*?<\/section>/g)?.find((s) => s.includes(titulo))
  expect(trecho, `seção ${titulo}`).toBeDefined()
  return trecho!
}

async function guia() {
  const { default: Pagina } = await import('../(app)/como-funciona/page')
  return renderToStaticMarkup(await Pagina())
}

describe('escrita da identidade 04 · guia', () => {
  it('explica confiança como nota numérica e bônus em pontos da nota', async () => {
    const html = await guia()
    const confianca = texto(secao(html, 'linhas de pontos'))
    expect(confianca).not.toMatch(/%|percentual|probabilidade/i)
    expect(confianca).toContain('nota de confiança')
    for (const faixa of ruleset.confianca_exibicao.faixas) {
      expect(confianca).toContain(`${faixa.de} ou mais`)
    }
    const bonus = ruleset.confianca.bonus_por_nivel_apito.MVP?.['3'] ?? 0
    expect(confianca).toContain(`${bonus} pontos na nota`)
    expect(texto(html)).not.toMatch(/percentuais|probabilidade/i)
  })

  it('orienta abrir o card e conserva linhas inteiras com +', async () => {
    const html = await guia()
    expect(texto(html)).toContain('Toque no card')
    expect(texto(html)).not.toContain('Toque em “linhas e confiança”')
    const atributos = texto(secao(html, 'Pontos, rebotes e assistências'))
    expect(atributos).not.toContain('funcionam igual nos três atributos')
    for (const linha of Object.keys(ruleset.confianca.base.MVP ?? {})) {
      expect(atributos).toContain(`${linha}+`)
    }
  })

  it.each(['media', 'faixa'] as const)(
    'explica e demonstra a exibição de odds: %s',
    async (exibicao) => {
      ruleset.odds.exibicao = exibicao
      const html = await guia()
      const odds = texto(secao(html, 'As odds'))
      expect(odds).toContain(
        exibicao === 'media' ? 'média das odds' : 'faixa entre a menor e a maior odd',
      )
      expect(odds).toContain('última coleta')
      expect(odds).toContain('tabela de referência')
      expect(odds).not.toContain('próxima da média do mercado')
      const exemplo = texto(secao(html, 'Um exemplo de card'))
      if (exibicao === 'media') expect(exemplo).toContain('ODD MÉDIA')
      else expect(exemplo).not.toContain('ODD MÉDIA')
    },
  )

  it('informa o papel do push sem prometer chegada instantânea', async () => {
    const fireLive = texto(secao(await guia(), 'Fire Live —'))
    expect(fireLive).toContain('última atualização')
    expect(fireLive).not.toMatch(/no exato momento|apita na hora/)
  })
})

describe('escrita da identidade 04 · gestão', () => {
  it.each([8, null])('a linha %s usa + somente quando há linha', async (linha) => {
    plano.entradas[0]!.item.linha = linha
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const resumo = texto(html.match(/<a\b[^>]*href="\/apito\/[\s\S]*?<\/a>/)?.[0] ?? '')
    expect(resumo).toContain(linha === null ? 'REB · nível' : 'REB 8+ · nível')
    expect(resumo).not.toMatch(/REB\s*\+|null/)
  })
})
