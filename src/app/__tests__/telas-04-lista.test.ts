import { gravarConferencia, prepararFotosConferencia } from './conferencia'
import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { feedSnapshot } from '../../modules/dominio/db/schema'
import { horaCurta, horaEmTexto } from '../../components/formato'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { ItemFeed } from '../../modules/entrega/lista-secreta'
import { identidadeDoTime } from '../../design-system/times'
import { componente } from '../../design-system/tokens/componente'
import { decimalPtBr } from '../../design-system/formato'
import { GRADE_DE_CARDS_CSS, LARGURA_DA_MOLDURA } from '../../components/navegacao'

/**
 * A LISTA SECRETA DA IDENTIDADE 04 — varredura por jogo.
 *
 * Mesmo arnês de `telas-demo.test.ts`: renderiza o componente de servidor de
 * verdade sobre um PGlite semeado pela temporada simulada, com sessão e
 * direito de acesso simulados (a fronteira de autenticação não está sob
 * teste). E a mesma regra de ouro: NENHUMA asserção nomeia jogador, time ou
 * horário — quem apita hoje é consequência do sorteio, então o sujeito é lido
 * do banco e a afirmação é sobre ele.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@teste.com',
  }),
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
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()
  await prepararFotosConferencia(banco.db)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

type Busca = Record<string, string | string[] | undefined>

async function renderizar(busca: Busca = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Os nomes no cabeçalho de confronto, sem confundir com a identidade nos cards. */
const cabecalhosDeJogo = (html: string) =>
  [...html.matchAll(/<div class="jogo-times-frio"[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    texto(m[1]!),
  )

/** Os itens de hoje, um por jogador (o melhor atributo), em ordem de sinal. */
async function representantesDoDia(): Promise<ItemFeed[]> {
  const { lerFeed, agruparPorJogador } = await import('../../modules/entrega/lista-secreta')
  const { ordenarPorSinal } = await import('../../modules/entrega/lista-por-jogo')
  const feed = await lerFeed(banco.db, HOJE)
  const porJogador = new Map<string, ItemFeed>()
  for (const item of ordenarPorSinal(agruparPorJogador(feed!.conteudo.itens))) {
    if (!porJogador.has(item.jogadorId)) porJogador.set(item.jogadorId, item)
  }
  return [...porJogador.values()]
}

describe('Lista Secreta · 04 — a varredura por jogo', () => {
  it('tem um cabeçalho de jogo por jogo com apito, na ordem de horário do banco', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const feed = await lerFeed(banco.db, HOJE)
    const comApito = new Set(feed!.conteudo.itens.map((i) => i.jogoId))
    const esperados = (await jogosDoDiaResumo(banco.db, HOJE, FUSO))
      .filter((j) => comApito.has(j.id))
      .map(
        (j) => `${identidadeDoTime(j.visitanteSigla).nome} @ ${identidadeDoTime(j.casaSigla).nome}`,
      )
    expect(esperados.length).toBeGreaterThan(1)

    const html = await renderizar()
    await gravarConferencia('identidade-04-lista', html)
    expect(cabecalhosDeJogo(html)).toEqual(esperados)
    expect(html).not.toContain('quadra-ao-vivo')
  }, 60_000)

  it('o mesmo jogador com dois atributos é UM card, com as abas no rodapé', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const atributosPorJogador = new Map<string, Set<string>>()
    for (const i of feed!.conteudo.itens) {
      atributosPorJogador.set(
        i.jogadorId,
        (atributosPorJogador.get(i.jogadorId) ?? new Set()).add(i.atributo),
      )
    }
    const [jogadorId] = [...atributosPorJogador.entries()].find(([, a]) => a.size > 1) ?? []
    expect(jogadorId, 'lista de hoje sem jogador apitado em dois atributos').toBeDefined()
    const nome = feed!.conteudo.itens.find((i) => i.jogadorId === jogadorId)!.nome

    const html = await renderizar()
    // O nome aparece uma vez só — como link para as estatísticas, dentro do card.
    expect(html.split(`>${nome}</a>`).length - 1).toBe(1)
    // E as abas do rodapé trocam o atributo daquele card, só dele.
    expect(html).toMatch(new RegExp(`aba=${jogadorId}%3A(PONTOS|REBOTES|ASSISTENCIAS)`))
    // No TEXTO: a aba virou rótulo pequeno + número grande na identidade 06.
    expect(texto(html)).toMatch(/(PTS|REB|AST) \d+\+/)
  }, 60_000)

  it('a aba pedida na URL é a ativa daquele card, sem mexer nos outros', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const representantes = await representantesDoDia()
    // Dois jogadores com mais de um atributo: um recebe a aba, o outro é a
    // testemunha de que a URL de um card não mexe no card do vizinho.
    const comAbas = representantes.filter(
      (r) =>
        feed!.conteudo.itens.filter((i) => i.jogadorId === r.jogadorId && i.atributo !== r.atributo)
          .length > 0,
    )
    expect(comAbas.length, 'lista de hoje sem dois jogadores em vários atributos').toBeGreaterThan(
      1,
    )

    const alvo = comAbas[0]!
    const testemunha = comAbas[1]!
    const outro = feed!.conteudo.itens.find(
      (i) => i.jogadorId === alvo.jogadorId && i.atributo !== alvo.atributo,
    )!

    // Sem aba na URL, o card abre no atributo de maior sinal.
    const padrao = await renderizar()
    expect(padrao).toContain(`href="/apito/${alvo.jogadorId}?atributo=${alvo.atributo}"`)

    const html = await renderizar({ aba: `${outro.jogadorId}:${outro.atributo}` })
    expect(html).toContain(`href="/apito/${alvo.jogadorId}?atributo=${outro.atributo}"`)
    // O card do vizinho não se mexeu.
    expect(html).toContain(`href="/apito/${testemunha.jogadorId}?atributo=${testemunha.atributo}"`)
  }, 60_000)

  it('a parede de filtros sai da tela: fica o botão FILTRAR, os recortes ficam na folha', async () => {
    const html = await renderizar()
    expect(html).toContain('FILTRAR')
    expect(html).toContain('<fieldset')
    // Nada de fieldset ANTES da folha: a parede de seis fileiras não abre mais
    // a tela. Os recortes vivem todos dentro do <details>, fechado por padrão.
    const antesDaFolha = html.split('<details')[0]!
    expect(antesDaFolha).not.toContain('<fieldset')
    expect(antesDaFolha).not.toContain('<legend')
    // E o link "linhas e confiança →" entre os cards deixou de existir: o card
    // inteiro é o link.
    expect(html).not.toContain('linhas e confiança')
  }, 60_000)

  it('o recorte ativo vira um chip só, com × para limpar, ao lado do FILTRAR', async () => {
    const html = await renderizar({ atributo: 'REBOTES' })
    // O RÓTULO do chip, não o valor do parâmetro: "REBOTES" sozinho já aparece
    // vinte vezes nos href dos chips da folha, e passaria com o rótulo errado.
    expect(html).toContain('aria-label="Limpar filtro Rebotes"')
    expect(html).toContain('>Rebotes <')
    expect(html).toContain('>×<')
    // A tela sem recorte não mostra chip nenhum.
    expect(await renderizar()).not.toContain('Limpar filtro')
  }, 60_000)

  it('as abas de atributo saem na MESMA ordem em todo card: PTS · REB · AST', async () => {
    // Numa tela de varredura, rodapé que muda de ordem de card para card
    // obriga a ler em vez de varrer (artboard: `PTS 10+ · REB 3+ · AST 4+`).
    const html = await renderizar()
    // Por card, e pelo TEXTO de cada âncora: na identidade 06 a aba virou
    // rótulo pequeno + número grande, e casar o HTML cru deixaria de enxergar
    // as abas em vez de reprovar a ordem delas.
    const fileiras = [...html.matchAll(/<article[\s\S]*?<\/article>/g)]
      .map((card) =>
        [...card[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
          .map((m) => texto(m[1]!))
          .filter((t) => /^(PTS|REB|AST)( \d+\+)?$/.test(t))
          .map((t) => t.slice(0, 3)),
      )
      .filter((fileira) => fileira.length > 0)
    expect(fileiras.length, 'nenhum card com abas hoje').toBeGreaterThan(0)
    expect(
      fileiras.some((f) => f.length > 1),
      'nenhum card com duas abas hoje',
    ).toBe(true)
    const ORDEM = ['PTS', 'REB', 'AST']
    for (const fileira of fileiras) {
      expect(fileira).toEqual(ORDEM.filter((a) => fileira.includes(a)))
    }
  }, 60_000)

  it('o card diz de que lado o jogador está: "@ ADV" fora, "vs ADV" em casa', async () => {
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const porId = new Map((await jogosDoDiaResumo(banco.db, HOJE, FUSO)).map((j) => [j.id, j]))
    const representantes = await representantesDoDia()
    const emCasa = representantes.find((r) => porId.get(r.jogoId)?.casaSigla === r.timeSigla)
    const fora = representantes.find((r) => porId.get(r.jogoId)?.visitanteSigla === r.timeSigla)
    expect(emCasa, 'nenhum apitado mandante hoje').toBeDefined()
    expect(fora, 'nenhum apitado visitante hoje').toBeDefined()

    const html = await renderizar()
    const artigos = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((m) => m[0])
    for (const [item, mando, adversario] of [
      [emCasa!, 'vs', porId.get(emCasa!.jogoId)!.visitanteSigla],
      [fora!, '@', porId.get(fora!.jogoId)!.casaSigla],
    ] as const) {
      const card = artigos.find((a) => a.includes(`/estatisticas/jogador/${item.jogadorId}`))
      expect(card).toBeDefined()
      expect(texto(card!)).toContain(
        `${identidadeDoTime(item.timeSigla).nome} ${mando} ${identidadeDoTime(adversario).nome}`,
      )
    }
  }, 60_000)

  it('a lente HIERARQUIA mostra a posição na lista do CJ — não um travessão em todo card', async () => {
    const { niveis, niveisVersao } = await import('../../modules/dominio/db/schema')
    const alvo = (await representantesDoDia())[0]!
    const [versao] = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const linhas = await banco.db.select().from(niveis).where(eq(niveis.niveisVersaoId, versao!.id))
    const minha = linhas.find(
      (l) => l.jogadorId === alvo.jogadorId && l.atributo === alvo.atributo,
    )!
    const total = linhas.filter(
      (l) => l.timeId === minha.timeId && l.atributo === minha.atributo,
    ).length

    const html = await renderizar({ lente: 'HIERARQUIA' })
    expect(html).toContain('HIERARQUIA')
    expect(html).toContain(`Nº ${minha.posicaoHierarquia} DE ${total}`)
  }, 60_000)

  it('card de jogo que já começou carrega o status do ciclo; no pré-live não há badge', async () => {
    // Spec 04 §5.1: o MESMO card na Lista, no Fire Live e nos Resultados. Na
    // Lista o badge só aparece quando o card SAIU do pré-live — a tela inteira
    // é pré-live e um "PRÉ" em 100% dos cards não informa nada.
    const { jogos } = await import('../../modules/dominio/db/schema')
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const jogoId = feed!.conteudo.itens[0]!.jogoId
    const [antes] = await banco.db.select().from(jogos).where(eq(jogos.id, jogoId))

    expect(await renderizar()).not.toMatch(/>PRÉ</)
    try {
      await banco.db
        .update(jogos)
        .set({ status: 'AO_VIVO', quartoAtual: 1 })
        .where(eq(jogos.id, jogoId))
      const html = await renderizar()
      expect(html).toContain('>1º Q<')
      expect(html).not.toMatch(/>PRÉ</)
    } finally {
      await banco.db
        .update(jogos)
        .set({ status: antes!.status, quartoAtual: antes!.quartoAtual })
        .where(eq(jogos.id, jogoId))
    }
  }, 60_000)

  it('o seletor existe e POR NÍVEL joga fora os cabeçalhos, pondo o maior sinal em primeiro', async () => {
    const representantes = await representantesDoDia()
    const primeiro = representantes[0]!

    const html = await renderizar({ ordem: 'POR_NIVEL' })
    // O rótulo vai em caixa alta pelo CSS, como no artboard; no HTML ele é
    // texto normal.
    expect(html).toContain('Por jogo')
    expect(html).toContain('Por nível')
    expect(cabecalhosDeJogo(html)).toEqual([])

    const posicoes = representantes.map((i) => html.indexOf(`>${i.nome}</a>`)).filter((p) => p >= 0)
    expect(posicoes.length).toBeGreaterThan(1)
    expect(html.indexOf(`>${primeiro.nome}</a>`)).toBe(Math.min(...posicoes))
  }, 60_000)

  it('a lente troca a zona 2 de TODOS os cards de uma vez', async () => {
    const comBarrinhas = await renderizar({ lente: 'ULT5' })
    expect(comBarrinhas).toContain('ÚLT. 5 NA LINHA')

    const mediaLinha = await renderizar({ lente: 'MEDIA_LINHA' })
    expect(mediaLinha).not.toContain('ÚLT. 5 NA LINHA')
    expect(mediaLinha).toContain('MÉDIA × LINHA')

    const odds = await renderizar({ lente: 'ODDS' })
    expect(odds).not.toContain('ÚLT. 5 NA LINHA')
    expect(odds).toMatch(/\d,\d{2}–\d,\d{2}/)
  }, 60_000)

  it('sem ordem nem lente na URL, a tela obedece à preferência gravada na conta', async () => {
    const { gravarPreferencias, PREFERENCIAS_PADRAO } =
      await import('../../modules/plataforma/preferencias')
    try {
      await gravarPreferencias(banco.db, USUARIO_DEMO, {
        ordemLista: 'POR_NIVEL',
        lente: 'MEDIA_LINHA',
      })
      const html = await renderizar()
      expect(cabecalhosDeJogo(html)).toEqual([])
      expect(html).not.toContain('ÚLT. 5 NA LINHA')
      expect(html).toContain('MÉDIA × LINHA')
      // A URL continua mandando quando diz alguma coisa.
      expect(cabecalhosDeJogo(await renderizar({ ordem: 'POR_JOGO' })).length).toBeGreaterThan(0)
    } finally {
      await gravarPreferencias(banco.db, USUARIO_DEMO, PREFERENCIAS_PADRAO)
    }
  }, 60_000)

  it('antes da publicação a tela diz a que horas sai a próxima lista — nunca fica em branco', async () => {
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const ruleset = await rulesetAtivo()
    const primeiro = (await jogosDoDiaResumo(banco.db, HOJE, FUSO))[0]!
    const saida = new Date(
      primeiro.dataHoraUtc.getTime() -
        ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000,
    )

    const onde = and(
      eq(feedSnapshot.dataReferencia, HOJE),
      eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
    )
    const [linha] = await banco.db.select().from(feedSnapshot).where(onde)
    try {
      await banco.db.delete(feedSnapshot).where(onde)
      const html = await renderizar()
      expect(html).toContain(`Próxima lista às ${horaEmTexto(saida, FUSO)}`)
      expect(html).toContain('/resultados')
      expect(html).toContain('LISTA DO DIA')
    } finally {
      await banco.db.insert(feedSnapshot).values(linha!)
    }
  }, 60_000)

  it('o cabeçalho traz sobrancelha, selo de contexto e o resumo da rodada', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const html = await renderizar()
    expect(html).toContain('LISTA SECRETA')
    expect(html).toContain('LISTA DO DIA')
    expect(html).toContain('PRÉ-LIVE')
    expect(html).toContain('Rodada de')
    // Hora escrita como se fala numa frase ("18h30"), não relógio: o relógio
    // fica no cabeçalho do jogo, onde a hora é dado.
    expect(html).toContain(`publicada às ${horaEmTexto(feed!.geradoEm, FUSO)}`)
    expect(html).not.toContain(`publicada às ${horaCurta(feed!.geradoEm, FUSO)}`)
    // Identidade 05: a contagem saiu da frase e virou o CONTADOR do cabeçalho
    // — o número num <strong> e o que ele conta ao lado.
    expect(html).toMatch(/<strong[^>]*>\d+<\/strong>/)
    expect(html).toMatch(/entradas em \d+ jogos/)
  }, 60_000)

  it('o card inteiro leva ao apito; o nome, às estatísticas', async () => {
    const alvo = (await representantesDoDia())[0]!
    const html = await renderizar()
    expect(html).toContain(`href="/apito/${alvo.jogadorId}?atributo=${alvo.atributo}"`)
    expect(html).toContain(`href="/estatisticas/jogador/${alvo.jogadorId}"`)
  }, 60_000)

  it('recorte que zera a lista continua dizendo "Nada com esse filtro"', async () => {
    const html = await renderizar({ time: 'ZZZ' })
    expect(html).toContain('Nada com esse filtro')
  }, 60_000)
})

describe('Lista Secreta · 04 — regras de escrita', () => {
  it('o número grande do card é a ODD, com o rótulo em cima — a nota de confiança saiu', async () => {
    // Identidade 06: a confiança deixou o card (segue no dado, no push e na
    // ordenação; quem a desenha é a análise do apito) e a odd ocupou o canto,
    // porque é ela que faz o assinante montar a múltipla.
    //
    // A FORMA da odd é do ruleset (`odds.exibicao`), não desta tela: uma casa
    // escreve o número sozinho no tamanho grande, várias escrevem a faixa no
    // tamanho menor. O que a identidade 06 afirma — e o que este teste
    // protege — é que a odd é o elemento de maior destaque, seja qual for a
    // forma. Fixar um dos dois tamanhos aqui faria trocar a chave no YAML
    // quebrar um teste de tela, que é o oposto da regra 1.
    const alvo = (await representantesDoDia()).find((r) => r.oddFaixa != null)!
    const html = await renderizar()
    const odd = alvo.oddFaixa!
    const emDestaque =
      html.includes(`font-size:${componente.odd.valorMedia}`) ||
      html.includes(`font-size:${componente.odd.valorFaixa}`)
    expect(emDestaque, 'a odd é o número grande do card').toBe(true)
    expect(texto(html)).toContain(
      odd.unica != null
        ? `ODD ${decimalPtBr(odd.unica, 2)}`
        : odd.media != null
          ? `ODD MÉDIA ${decimalPtBr(odd.media, 2)}`
          : `ODD ${decimalPtBr(odd.min, 2)}–${decimalPtBr(odd.max, 2)}`,
    )
    // E o número da nota não sobrou em lugar nenhum do card.
    expect(html).not.toContain('font-size:34px')
  }, 60_000)

  it('nunca "probabilidade", linha inteira com "+", odd em faixa, % sem decimal', async () => {
    const telas = await Promise.all([
      renderizar(),
      renderizar({ ordem: 'POR_NIVEL' }),
      renderizar({ lente: 'ODDS' }),
      renderizar({ lente: 'MEDIA_LINHA' }),
      renderizar({ lente: 'HIERARQUIA' }),
    ])

    for (const bruto of telas) {
      // O replay de formulário que o React injeta é script, não texto de tela.
      // E a LATERAL fica de fora: ela mostra a taxa da noite e da temporada, que
      // são percentuais legítimos de resultado observado (docs/04, vocabulário
      // numérico). O que esta suíte cobra é a escrita da LISTA — onde um "%"
      // seria lido como probabilidade do apito, que é o erro que a regra 
      // existe para impedir.
      const html = bruto
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<aside[\s\S]*?<\/aside>/g, '')

      expect(html.toLowerCase()).not.toContain('probabilidade')
      // A nota da partida é "nota" e não aparece aqui; "nível" é do jogador e
      // do apito, nunca da partida.
      expect(html.toLowerCase()).not.toMatch(/nível da partida|nota do jogo/)
      // Linha SEMPRE inteira, com "+". Nem no rótulo longo, nem na aba. No
      // TEXTO, porque a identidade 06 partiu a meta em rótulo + número.
      const semTags = texto(html)
      expect(semTags).toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST) \d+\+/)
      expect(semTags).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS|PTS|REB|AST)\s+\d+,\d/)
      expect(html.toLowerCase()).not.toContain('meio ponto')
      // ODD NUNCA SOLTA. A FORMA (média entre casas ou faixa) é decisão do
      // parceiro e mora em `odds.exibicao` no ruleset — a tela não escolhe. O
      // que a tela nunca pode fazer é escrever um número de odd sem dizer o
      // que ele é, porque "ODD 1,45" se lê como a odd de uma casa específica,
      // e é isso que docs/04 proíbe.
      // No TEXTO: rótulo e valor da odd são dois elementos irmãos desde a 06.
      for (const achado of semTags.matchAll(/\bODD\b\s*([^·]{0,24})/g)) {
        expect(achado[1]!.trim(), 'odd sem faixa nem rótulo de média').toMatch(
          /^(MÉDIA \d,\d{2}|\d,\d{2}–\d,\d{2})/,
        )
      }
      // Nenhum percentual na tela: a nota de confiança saiu do card na 06, e
      // nenhum outro número dele é porcentagem. A antiga proibição de decimal
      // solto morreu com ela — a odd é decimal por natureza, e quem garante
      // que ela nunca sai sem rótulo é a varredura logo acima.
      expect(html).not.toMatch(/>\d{1,3}%</)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('…')
      expect(html).not.toMatch(/\.\.\./)
    }
  }, 60_000)
})

describe('Lista Secreta · desktop — a tela ocupa a largura que tem', () => {
  it('a moldura é a larga: em 640 sobravam ~400px de cada lado num monitor comum', async () => {
    const html = await renderizar()
    // A largura viaja por variável CSS desde a identidade 05: o `max-width`
    // mora no CSS da Moldura, porque a partir de 1280 ele muda junto com a
    // lateral e uma media query não alcança um estilo embutido.
    expect(html).toContain(`--largura-coluna:${LARGURA_DA_MOLDURA.dados}px`)
    expect(html).not.toContain(`--largura-coluna:${LARGURA_DA_MOLDURA.leitura}px`)
  })

  it('os cards entram em grade de múltiplas colunas, não numa coluna esticada', async () => {
    // A grade é por `minmax`, não por media query: o card mantém a largura de
    // leitura que sempre teve e passam a caber dois; no celular a mesma regra
    // devolve uma coluna sozinha.
    const html = await renderizar()
    expect(html).toContain(GRADE_DE_CARDS_CSS)
  })

  it('a grade também vale no agrupamento por jogo, onde os cards de um mesmo confronto se emparelham', async () => {
    const html = await renderizar({ por: 'jogo' })
    const grades = html.split(GRADE_DE_CARDS_CSS).length - 1
    expect(grades).toBeGreaterThan(0)
  })
})

// ===========================================================================
// IDENTIDADE 05 — A LISTA NA ANATOMIA DO STATSHUB
// ===========================================================================

describe('Lista Secreta · 05 — a moldura do StatsHub', () => {
  it('cada jogo com apito é um <details open> cujo summary é o cabeçalho do jogo', async () => {
    const html = await renderizar()
    const secoes = (html.match(/<summary class="jogo-frio"/g) ?? []).length
    expect(secoes).toBeGreaterThan(0)
    expect((html.match(/<details open/g) ?? []).length).toBe(secoes)
  }, 60_000)

  it('o contador escreve o total de entradas, e a descrição não repete o número', async () => {
    const html = await renderizar()
    const { lerFeed, agruparPorJogador } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    // O contador conta ENTRADAS — uma por (jogador, atributo), que é o que a
    // palavra diz. Um CARD é um jogador e pode carregar três delas nas abas,
    // então card e entrada não são a mesma unidade.
    const entradas = agruparPorJogador(feed!.conteudo.itens).length
    const jogos = new Set(feed!.conteudo.itens.map((i) => i.jogoId)).size
    expect(html).toContain(`>${entradas}</strong>`)
    expect(html).toContain(`entradas em ${jogos} jogos`)
    // sem filtro, visível e publicado coincidem: nada de "de N"
    expect(html).not.toContain(`de ${entradas} entradas`)
    // e a frase de cima não repete o número
    expect(html).not.toContain(`${entradas} entrada`)
  }, 60_000)

  it('com filtro na URL, o contador diz "N de M" — o cabeçalho não pode dizer 37 sobre uma tela recortada', async () => {
    const html = await renderizar({ metodo: 'OPD' })
    const { lerFeed, agruparPorJogador, filtrarItens } = await import(
      '../../modules/entrega/lista-secreta'
    )
    const feed = await lerFeed(banco.db, HOJE)
    const total = agruparPorJogador(feed!.conteudo.itens).length
    const visiveis = agruparPorJogador(
      filtrarItens(feed!.conteudo.itens, { metodo: 'OPD' }),
    ).length
    expect(visiveis).toBeLessThan(total)
    expect(html).toContain(`>${visiveis}</strong>`)
    expect(html).toContain(`de ${total} entrada`)
  }, 60_000)

  it('acompanhar é a estrela no canto do card; o botão solto sob o card sumiu', async () => {
    const html = await renderizar()
    expect(html).toContain('aria-label="Acompanhar jogador"')
    expect(html).not.toContain('+ Acompanhar jogador')
  }, 60_000)

  it('nenhum texto do card fica abaixo do piso de 12 px do manual', async () => {
    const html = await renderizar()
    expect(html).not.toMatch(/font-size:(9|10|11)px/)
  }, 60_000)

  it('os filtros saem nas duas formas: folha no celular, chips com menu no desktop', async () => {
    const html = await renderizar()
    // a folha continua lá (fieldset por grupo) e a fileira de chips também
    expect(html).toContain('<legend')
    expect(html).toContain('role="group"')
    expect(html).toContain('FILTRAR')
  }, 60_000)
})
