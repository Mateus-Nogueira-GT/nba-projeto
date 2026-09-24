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
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
// Esta suíte cobra a ESCRITA da tela e usa um banco de mentira (`{}`). No v2
// a coluna da direita é o slot `@painel`, fora da página — nada a simular aqui.
vi.mock('../../modules/entrega/gestao', () => ({
  BANCA_PADRAO: 1000,
  planoDoDia: async () => plano,
}))
// Front v2 (Tarefa 6): a Gestão do v2 também lê os registros do dia e a
// conferência dos 30 dias ("Seu mês"). Sem banco aqui, os dois voltam vazios:
// o que está sob teste é a escrita da linha do plano.
// O feed da Gestão vem do cache; o plano de mentira acima não o usa.
vi.mock('../_cache/feed', () => ({ lerFeedCacheado: async () => null }))
vi.mock('../../modules/entrega/gestao-realizadas', () => ({
  entradasRealizadasDoDia: async () => [],
}))
vi.mock('../../modules/entrega/resultados', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../modules/entrega/resultados')>()),
  conferirRodadas: async () => [],
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

// Front v2 (Tarefa 7): o guia é o `features/metodologia/Conteudo` do v2. O
// "card de exemplo" virou "Um exemplo de linha da lista" e o toque é na linha.
// O caso "o número grande do exemplo permanece legível sobre o card escuro"
// saiu: ele media contraste sobre a cor EMBUTIDA do design-system antigo, e a
// linha do v2 pinta por `var(--…)` de `src/ui/tokens.css` — contraste de token
// é assunto do teste de marca (Tarefa 11b), não de string de HTML.
describe('escrita da identidade 04 · guia', () => {
  it('o exemplo mostra a odd só com o valor, na forma que o ruleset manda — o rótulo fica para o leitor de tela', async () => {
    // Como a `PilulaOdd` da Lista e o v2: "1,85" na tela, nunca "Odd 1,85". O
    // "(odd)" que sobra no texto é o `.so-leitor`, invisível.
    ruleset.odds.exibicao = 'casa_unica'
    const exemplo = texto(secao(await guia(), 'Um exemplo de linha'))
    expect(exemplo).toContain('1,85 (odd)')
    expect(exemplo).not.toContain('Odd 1,85')
  })

  it('explica confiança como nota numérica e bônus em pontos da nota', async () => {
    const html = await guia()
    const confianca = texto(secao(html, 'A nota de confiança e as linhas'))
    expect(confianca).not.toMatch(/%|percentual/i)
    expect(confianca).toContain('nota de confiança')
    expect(confianca).toContain('Não é probabilidade de acerto')
    for (const faixa of ruleset.confianca_exibicao.faixas) {
      expect(confianca).toContain(`${faixa.de} ou mais`)
    }
    const bonus = ruleset.confianca.bonus_por_nivel_apito.MVP?.['3'] ?? 0
    expect(confianca).toContain(`${bonus} pontos na nota`)
    expect(texto(html)).not.toMatch(/percentuais/i)
  })

  it('orienta abrir o card e conserva linhas inteiras com +', async () => {
    const html = await guia()
    expect(texto(html)).toContain('Toque na linha')
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
      // A forma do ruleset muda o VALOR do exemplo; o rótulo só vai ao leitor de tela.
      const exemplo = texto(secao(html, 'Um exemplo de linha'))
      if (exibicao === 'media') expect(exemplo).toContain('1,54 (odd média)')
      else expect(exemplo).toContain('1,47–1,62 (odd)')
      expect(exemplo).not.toMatch(/Odd (média )?\d/)
      if (exibicao !== 'media') expect(exemplo).not.toMatch(/odd média/i)
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
    // Front v2 (Tarefa 6): a pílula de mercado do v2 escreve o sinal à frente
    // ("+8 REB"); sem linha, só o mercado — e a linha não oferece registro.
    const resumo = texto(html.match(/<a\b[^>]*href="\/apito\/[\s\S]*?<\/a>/)?.[0] ?? '')
    expect(resumo).toContain(linha === null ? 'MVP REB' : 'MVP +8 REB')
    expect(resumo).not.toMatch(/\+\s*REB|null/)
    if (linha === null) expect(texto(html)).toContain('Sem linha para registrar')
  })
})
