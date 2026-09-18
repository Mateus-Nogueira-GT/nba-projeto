import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { gravarConferencia } from './conferencia'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { classificacao, times } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../modules/dominio/temporada'
import { rotaDoTime } from '../../modules/entrega/estatisticas/rotas'
import { telaDaClassificacao } from '../../modules/entrega/estatisticas/time'
import type { TelaClassificacao } from '../../modules/entrega/estatisticas/time'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { semearClassificacao } from '../../modules/ingestao/demo/jogos'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { identidadeDoTime } from '../../design-system/times'
import { semantico } from '../../design-system/tokens/semantico'

/**
 * A CLASSIFICAÇÃO POR CONFERÊNCIA (spec 12/09, §4.2).
 *
 * O print de produção mostrava os 30 times numa tabela só — e marcava
 * "playoff" para os seis primeiros da LIGA. A NBA classifica por conferência:
 * seis vagas diretas e quatro de play-in EM CADA LADO. Do jeito antigo a
 * tabela afirmava uma classificação que não existe.
 *
 * Mesmo arnês de `telas-demo.test.ts` — o componente de servidor de verdade
 * sobre um PGlite semeado pela temporada simulada; só sessão e direito de
 * acesso são simulados. E a mesma regra de ouro: NENHUMA asserção nomeia
 * jogador, time ou horário. O sujeito é LIDO do banco e a afirmação é sobre
 * ele.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let temporada: string
/** A classificação como a entrega a devolve — o sujeito de toda asserção. */
let dados: TelaClassificacao
/** As conferências que o banco tem, na ordem em que a tela as escreve. */
let conferencias: (string | null)[]

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO_DEMO, email: 'demo@teste.com' }),
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
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  const ruleset = await rulesetAtivo()
  // 21 dias: o histórico precisa dar campanha a TODOS os times, senão uma
  // conferência chega à tela com menos de dez linhas e o corte do play-in
  // deixa de ter o que cortar.
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })

  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  temporada = temporadaDe(AGORA, calendarioDoRuleset(ruleset))
  dados = await telaDaClassificacao(banco.db, temporada)
  conferencias = [...new Set(dados.linhas.map((l) => l.conferencia))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  )
  expect(conferencias.length, 'o banco de teste nasce dividido em conferências').toBe(2)

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarIndice(): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

/** Texto visível, sem marcação — para afirmar sobre rótulo e valor vizinhos. */
function texto(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

/**
 * O HTML de UMA seção da classificação, do título dela até o fim da seção.
 *
 * Contar sobre a página inteira não distingue Leste de Oeste — e é justamente
 * a mistura dos dois que este arquivo existe para impedir.
 */
function secaoDa(html: string, conferencia: string | null): string {
  const titulo = `Classificação · ${conferencia ?? 'sem conferência'}`
  const inicio = html.indexOf(titulo)
  expect(inicio, `a tela escreve "${titulo}"`).toBeGreaterThan(-1)
  const resto = html.slice(inicio)
  const fim = resto.indexOf('</section>')
  expect(fim, `a seção "${titulo}" se fecha`).toBeGreaterThan(-1)
  return resto.slice(0, fim)
}

/** O HTML de cada `<tr>` do corpo da tabela de um trecho, na ordem. */
function linhasDaTabela(html: string): string[] {
  return html
    .split('<tbody>')
    .slice(1)
    .flatMap((corpo) => corpo.slice(0, corpo.indexOf('</tbody>')).split('<tr').slice(1))
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</tr>')))
}

/** A linha daquele time — achada pela porta que ela abre, não pelo nome. */
function linhaDoTime(html: string, timeId: string): string {
  const linha = linhasDaTabela(html).find((l) => l.includes(`href="${rotaDoTime(timeId)}"`))
  expect(linha, 'o time tem uma linha na classificação').toBeDefined()
  return linha!
}

/** As células que o celular esconde, na ordem em que a tabela as escreve. */
function celulasSoDesktop(linha: string): string[] {
  return linha.match(/<td\b[^>]*class="so-desktop"[^>]*>[\s\S]*?<\/td>/g) ?? []
}

/** Onde cada coluna escondida cai dentro de `celulasSoDesktop`. */
const SO_DESKTOP = { franquia: 0, sequencia: 1, jogosAtras: 2 } as const

/**
 * A liga tem 30 franquias, 15 em cada conferência, e o corte do play-in passa
 * entre a 10ª e a 11ª. Estrutura da LIGA — é o que o "Pronto quando" da spec
 * §4.2 exige que a tela conte certo.
 */
const FRANQUIAS = { naLiga: 30, porConferencia: 15 } as const
const CORTE_DO_PLAY_IN = 10

/** A régua do corte, como a `Tabela` a desenha. */
const REGUA = `border-bottom:2px solid ${semantico.divisor}`

describe('a classificação sai por conferência', () => {
  it('são duas tabelas, uma por conferência, e a posição reinicia em 1º em cada uma', async () => {
    const html = await renderizarIndice()
    await gravarConferencia('classificacao', html)

    // Uma tabela por conferência NO CONTEÚDO e mais nenhuma: a tabela única da
    // liga era o erro factual do print. A lateral tem a sua, compacta, que é
    // outra coisa — por isso ela sai da conta.
    const conteudo = html.replace(/<aside[\s\S]*?<\/aside>/g, '')
    expect(conteudo.match(/<table/g)).toHaveLength(conferencias.length)

    expect(dados.linhas).toHaveLength(FRANQUIAS.naLiga)

    for (const conferencia of conferencias) {
      const grupo = dados.linhas.filter((l) => l.conferencia === conferencia)
      expect(grupo).toHaveLength(FRANQUIAS.porConferencia)

      const secao = secaoDa(html, conferencia)
      expect(linhasDaTabela(secao)).toHaveLength(grupo.length)
      // 1º a Nº DENTRO da conferência, em ordem — e não a numeração da liga.
      const posicoes = [...secao.matchAll(/>(\d+)º</g)].map((m) => Number(m[1]))
      expect(posicoes).toEqual(grupo.map((_, indice) => indice + 1))
    }
  }, 60_000)

  it('o trilho é por conferência: seis vagas de playoff e quatro de play-in em cada lado', async () => {
    const html = await renderizarIndice()

    for (const conferencia of conferencias) {
      const secao = secaoDa(html, conferencia)
      const trilhos = linhasDaTabela(secao).map((linha) => {
        const visivel = texto(linha)
        return visivel.includes('playoff')
          ? 'playoff'
          : visivel.includes('play-in')
            ? 'play-in'
            : '—'
      })

      expect(trilhos.slice(0, 6).every((t) => t === 'playoff')).toBe(true)
      expect(trilhos.slice(6, 10).every((t) => t === 'play-in')).toBe(true)
      expect(trilhos.filter((t) => t === 'playoff')).toHaveLength(6)
      expect(trilhos.filter((t) => t === 'play-in')).toHaveLength(4)

      // O corte é DESENHADO entre a 10ª e a 11ª — uma régua só, no fim da
      // última vaga de play-in.
      const linhas = linhasDaTabela(secao)
      expect(linhas.filter((l) => l.includes(REGUA))).toHaveLength(1)
      expect(linhas[CORTE_DO_PLAY_IN - 1]).toContain(REGUA)
      expect(linhas[CORTE_DO_PLAY_IN]).not.toContain(REGUA)

      // E fica ESCRITO sob a tabela: forma nunca é canal único, e contar
      // linhas para descobrir onde o seu time caiu é o que a leitura por
      // varredura precisa evitar.
      expect(texto(secao)).toContain('corte do play-in entre a 10ª e a 11ª')
    }
  }, 60_000)

  it('todo time tem logo, e a sigla continua escrita ao lado — a logo nunca é canal único', async () => {
    const html = await renderizarIndice()

    for (const time of dados.linhas) {
      const linha = linhaDoTime(html, time.timeId)
      expect(linha).toContain(`src="/times/${time.sigla}.svg"`)
      // A logo NOMEIA o time para quem não a vê — e a sigla continua escrita
      // ao lado para quem vê. Nenhum dos dois canais sozinho.
      expect(linha).toContain(`aria-label="${identidadeDoTime(time.sigla).nome}"`)
      expect(texto(linha)).toContain(time.sigla)
    }
  }, 60_000)

  it('em 390 px ficam posição, time, V–D, aproveitamento, últimos 5 e trilho', async () => {
    const html = await renderizarIndice()

    for (const conferencia of conferencias) {
      const secao = secaoDa(html, conferencia)
      // As colunas que o celular não comporta, cabeçalho junto: esconder a
      // célula e deixar o cabeçalho desalinharia a tabela.
      const cabecalhos = secao.match(/<th\b[^>]*>[\s\S]*?<\/th>/g) ?? []
      const escondidos = cabecalhos
        .filter((th) => th.includes('so-desktop'))
        .map((th) => texto(th).trim())
      expect(escondidos).toEqual(['FRANQUIA', 'SEQ', 'JA'])
      // O TRILHO fica no celular mesmo não estando na lista da spec: é o
      // critério de aceite desta tela, o conserto factual da passada.
      const sobrevivem = cabecalhos
        .filter((th) => !th.includes('so-desktop'))
        .map((th) => texto(th).trim())
      expect(sobrevivem).toEqual(['POS', 'TIME', 'V–D', '%', 'ÚLT. 5', 'TRILHO'])

      const grupo = dados.linhas.filter((l) => l.conferencia === conferencia)
      const lider = grupo[0]!
      const celulas = celulasSoDesktop(linhaDoTime(secao, lider.timeId))
      expect(celulas).toHaveLength(escondidos.length)
      expect(texto(celulas[SO_DESKTOP.franquia]!)).toContain(identidadeDoTime(lider.sigla).nome)
      // Quem lidera não está atrás de ninguém.
      expect(texto(celulas[SO_DESKTOP.jogosAtras]!).trim()).toBe('—')

      // E a coluna carrega NÚMERO: um traço em toda linha seria uma coluna
      // que não informa nada.
      const atrasos = linhasDaTabela(secao).map((linha) =>
        texto(celulasSoDesktop(linha)[SO_DESKTOP.jogosAtras] ?? '').trim(),
      )
      expect(atrasos.filter((a) => a !== '—').length).toBeGreaterThan(0)
    }
  }, 60_000)

  it('temporada sem classificação nenhuma não anuncia um grupo que não existe', async () => {
    await banco.db.delete(classificacao).where(eq(classificacao.temporada, temporada))
    try {
      const html = await renderizarIndice()

      // A seção continua de pé para dizer que não há resposta ainda — mas sem
      // rotular um grupo de times sem conferência que não existe, e sem
      // explicar o corte de uma tabela que não foi desenhada.
      expect(html).toContain('Sem classificação registrada para esta temporada.')
      expect(html).toContain('Classificação')
      expect(html).not.toContain('sem conferência')
      expect(html).not.toContain('corte do play-in')
    } finally {
      await semearClassificacao(banco.db, await rulesetAtivo(), HOJE)
    }
  }, 60_000)

  it('time sem conferência no banco não vira "Leste" por padrão: cai num grupo rotulado', async () => {
    const [alvo] = await banco.db
      .select({ id: times.id, conferencia: times.conferencia })
      .from(times)
      .limit(1)
    const ruleset = await rulesetAtivo()

    await banco.db.update(times).set({ conferencia: null }).where(eq(times.id, alvo!.id))
    try {
      // A classificação guarda a conferência da vez; sem recomputar, a linha
      // antiga continuaria dizendo o que o cadastro já não diz.
      await semearClassificacao(banco.db, ruleset, HOJE)
      const html = await renderizarIndice()

      const secao = secaoDa(html, null)
      expect(secao).toContain(`href="${rotaDoTime(alvo!.id)}"`)
      // A falta de dado APARECE; ela não é preenchida com um palpite.
      for (const conferencia of conferencias) {
        expect(secaoDa(html, conferencia)).not.toContain(`href="${rotaDoTime(alvo!.id)}"`)
      }
    } finally {
      await banco.db
        .update(times)
        .set({ conferencia: alvo!.conferencia })
        .where(eq(times.id, alvo!.id))
      await semearClassificacao(banco.db, ruleset, HOJE)
    }
  }, 60_000)
})
