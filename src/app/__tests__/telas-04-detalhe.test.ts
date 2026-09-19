import { gravarConferencia, prepararFotosConferencia } from './conferencia'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { and, eq, ne } from 'drizzle-orm'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { detalheDoApito } from '../../modules/entrega/detalhe-apito'
import { lerFeed, linhasDoJogador } from '../../modules/entrega/lista-secreta'
import { lerFeedFireLive } from '../../modules/entrega/fire-live/leitura'
import { cotacoesPorCasa } from '../../modules/entrega/odds/leitura'
import { rotaDoJogador } from '../../modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import {
  criarCampanhaComLink,
  criarCasaComercial,
  criarOferta,
  criarParceiro,
  definirSaidaDoApito,
  type AtorAfiliados,
} from '../../modules/plataforma/afiliados/servico'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { ItemFeed } from '../../modules/entrega/lista-secreta'
import type { ConteudoFeedFireLive, ItemFireLive } from '../../modules/entrega/fire-live/feed'

/**
 * DETALHE DO APITO — a página de ANÁLISE da identidade 04 (spec §4.3).
 *
 * O esqueleto é FIXO: a ordem das seções não muda durante a temporada, e é
 * isso que permite ao assinante aprender a página uma vez. Por isso a ordem é
 * testada, e não só a presença de cada bloco.
 *
 * Mesmo arnês de `telas-demo.test.ts`: o componente de servidor de verdade,
 * sobre o banco de verdade semeado por `simularAte`. Só sessão e direito de
 * acesso são simulados. NENHUMA asserção nomeia jogador, time ou horário — o
 * sujeito é lido do feed e a asserção é sobre ele.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

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
    .values({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'demo@teste.com',
      senhaHash: 'x',
    })
    .onConflictDoNothing()
  await prepararFotosConferencia(banco.db)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

function semEntidades(texto: string): string {
  return texto
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** O texto que o assinante lê, sem marcação e sem entidade — nunca o CSS. */
function textoDaTela(html: string): string {
  return semEntidades(html.replace(/<[^>]+>/g, ''))
}

/**
 * Idem, com um espaço no lugar de cada tag. É o que permite casar um RÓTULO
 * isolado: sem o espaço, "MÉDIA 8,1" e "LINHA" viram `8,1LINHA` e um `\bLINHA`
 * deixa de casar — foi assim que "LINHA 3" para um alvo de 1º quarto passou.
 */
function textoSeparado(html: string): string {
  return semEntidades(html.replace(/<[^>]+>/g, ' '))
}

/** O botão de voltar da sobrancelha — a âncora com o nome acessível. */
function botaoVoltar(html: string): string {
  const achado = html.match(/<a [^>]*aria-label="Voltar"[^>]*>/)
  expect(achado, 'a tela não tem botão de voltar com nome acessível').not.toBeNull()
  return achado![0]
}

/** O pedaço da tela entre dois títulos de seção. */
function trecho(html: string, de: string, ate: string): string {
  const inicio = html.indexOf(de)
  const fim = html.indexOf(ate)
  expect(inicio, `seção "${de}" ausente`).toBeGreaterThan(-1)
  expect(fim, `seção "${ate}" ausente`).toBeGreaterThan(inicio)
  return html.slice(inicio, fim)
}

const ATRIBUTO_ROTULO: Record<string, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}

/** Número no padrão pt-BR, como a tela escreve. */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** O apitado da vez: PONTOS, com linha e com histórico para as barras. */
async function sujeito(): Promise<ItemFeed> {
  const feed = await lerFeed(banco.db, HOJE)
  const alvo = feed!.conteudo.itens.find(
    (i) => i.atributo === 'PONTOS' && i.linha !== null && i.ultimos5.length > 0,
  )
  expect(alvo, 'lista de hoje sem apito de PONTOS com histórico na linha').toBeDefined()
  return alvo!
}

/**
 * O apitado SÓ do Fire Live: ele não está na lista pré-live, então a página
 * inteira nasce do item ao vivo — o caminho em que o alvo do 1º quarto já foi
 * usado como se fosse linha.
 */
async function sujeitoFireLive(): Promise<ItemFireLive> {
  const ruleset = await rulesetAtivo()
  const vivo = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
  const feed = await lerFeed(banco.db, HOJE)
  const naLista = new Set((feed?.conteudo.itens ?? []).map((i) => i.jogadorId))
  const alvo = vivo.itens.find((i) => !naLista.has(i.jogadorId))
  expect(alvo, 'dia simulado sem apito de Fire Live fora da lista pré-live').toBeDefined()
  return alvo!
}

async function renderizar(item: ItemFeed): Promise<string> {
  const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
  return renderToStaticMarkup(
    await Pagina({
      params: Promise.resolve({ jogadorId: item.jogadorId }),
      searchParams: Promise.resolve({ atributo: item.atributo }),
    }),
  )
}

/** Sem `?atributo` — como o assinante chega pelo push ou por um link colado. */
async function renderizarSemAtributo(jogadorId: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
  return renderToStaticMarkup(
    await Pagina({
      params: Promise.resolve({ jogadorId }),
      searchParams: Promise.resolve({}),
    }),
  )
}

/**
 * As regras de escrita que valem em QUALQUER caminho da tela — pré-live ou
 * nascido ao vivo. Ficam numa função porque rodar isto só sobre o sujeito
 * pré-live foi exatamente o buraco que deixou o caminho do Fire Live escrever
 * "LINHA 3" para um alvo de 1º quarto.
 */
function regrasDeEscrita(html: string): void {
  const texto = textoDaTela(html)
  // Nenhuma linha com meio ponto.
  expect(texto).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
  expect(texto.toLowerCase()).not.toContain('meio ponto')
  // Nota de confiança sem casas decimais.
  expect(texto).not.toMatch(/\d+,\d+\s?%/)
  // A nota da partida se chama nota; "nível" é do jogador e do apito.
  expect(texto.toLowerCase()).not.toContain('nível da partida')
  expect(texto).not.toContain('ALTÍSSIMO VALOR')
  expect(texto).not.toContain('...')
  expect(texto).not.toContain('…')
  // A confiança é uma NOTA — a palavra proibida só existe negada.
  expect([...texto.matchAll(/probabilidade/gi)]).toHaveLength(1)
  expect(texto).toContain('não uma probabilidade')
}

describe('Detalhe do apito — o esqueleto fixo da análise (identidade 04)', () => {
  it('as seções saem sempre na mesma ordem, do fato gerador ao jogo', async () => {
    const html = await renderizar(await sujeito())
    await gravarConferencia('identidade-04-detalhe', html)

    const ordem = ['FORMA NO ATRIBUTO', 'COMPARAÇÃO', 'POR QUE ENTROU', 'LINHAS DE', 'O JOGO']
    const posicoes = ordem.map((titulo) => {
      const i = html.indexOf(titulo)
      expect(i, `seção "${titulo}" ausente da tela`).toBeGreaterThan(-1)
      return i
    })
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b))

    // O fato gerador vem ANTES de tudo: é a frase que explica a entrada.
    // O número do título é o que o DADO tem, não um 10 fixo — quem tem menos
    // de dez jogos conferidos lia um título que mentia (auditoria de UX para
    // web, §4.3), enquanto a legenda ao lado já dizia "bateu 7 de 9".
    expect(html).toMatch(/FORMA NO ATRIBUTO · ÚLTIMOS? \d+/)
    // E o CTA fecha a página, depois da última seção.
    expect(html.indexOf('VER ESTATÍSTICAS')).toBeGreaterThan(posicoes.at(-1)!)
  }, 60_000)

  it('a forma no atributo marca a linha e conta quantas vezes bateu', async () => {
    const item = await sujeito()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizar(item)

    expect(html).toContain(`LINHA ${item.linha}`)
    expect(html).toContain(
      `aria-label="bateu ${detalhe.bateu.acertos} de ${detalhe.bateu.total}. Do mais antigo ao mais recente:`,
    )
    expect(html).toContain(`bateu ${detalhe.bateu.acertos} de ${detalhe.bateu.total}`)
  }, 60_000)

  it('cada fator entra com título e texto, e nenhum mostra a fórmula do CJ', async () => {
    const item = await sujeito()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizar(item)
    const bloco = textoDaTela(trecho(html, 'POR QUE ENTROU', 'LINHAS DE'))

    expect(detalhe.fatores.length).toBeGreaterThan(1)
    // A ordem da entrega é a ordem da tela: nível primeiro, nível do apito por último.
    expect(detalhe.fatores[0]!.chave).toBe('NIVEL')
    expect(detalhe.fatores.at(-1)!.chave).toBe('NIVEL_APITO')
    let anterior = -1
    for (const fator of detalhe.fatores) {
      expect(bloco).toContain(fator.titulo)
      expect(bloco).toContain(fator.texto)
      const posicao = bloco.indexOf(fator.titulo)
      expect(posicao).toBeGreaterThan(anterior)
      anterior = posicao
    }

    // Sem pesos: nem percentual, nem bônus, nem "+4 do turbo". Mostrar a
    // fórmula expõe o CJ e faz a nota parecer soma de probabilidades.
    expect(bloco).not.toContain('%')
    expect(bloco.toLowerCase()).not.toContain('bônus')
    expect(bloco.toLowerCase()).not.toContain('peso')
    expect(bloco).not.toMatch(/\+\s?\d/)
  }, 60_000)

  it('as casas saem em TEXTO — sem logo, sem link, com o aviso do ADR-0004', async () => {
    const item = await sujeito()
    const grade = await cotacoesPorCasa(banco.db, [item.jogoId], item.jogadorId, item.atributo)
    const html = await renderizar(item)
    const bloco = trecho(html, 'LINHAS DE', 'O JOGO')

    expect(grade.length).toBeGreaterThan(0)
    expect(bloco).toContain('CASA')
    for (const casa of grade) expect(bloco).toContain(casa.casa)
    // Sem logo e sem link: ADR-0004 é leitura, não vitrine de casa.
    expect(bloco).not.toContain('<img')
    expect(bloco).not.toMatch(/href="https?:/)
    expect(bloco).not.toContain('<a ')
    // O disclaimer inteiro, na letra do ADR.
    expect(html).toContain('Referência de mercado: a odd da sua casa pode ser outra.')
    expect(html).toContain('Nenhuma aposta é feita por aqui.')
  }, 60_000)

  it('sem link marcado, o detalhe não oferece saída; com link, oferece a saída rastreada com o aviso do ADR-0004 — e nunca um formulário de aposta', async () => {
    const item = await sujeito()
    let html = await renderizar(item)
    expect(html).not.toContain('href="/ir/')

    // Parceiro → oferta ATIVA → campanha → link, como no teste da entrega
    // (`saida-para-casa.test.ts`) — a mesma porta, exercitada pela tela.
    const { usuarios, ofertasAfiliados } = await import('../../modules/dominio/db/schema')
    const sufixo = Math.random().toString(36).slice(2)
    const [admin] = await banco.db
      .insert(usuarios)
      .values({ email: `admin-cta-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' })
      .returning()
    const ator: AtorAfiliados = { usuarioId: admin!.id, papel: 'ADMIN' }
    const agora = new Date('2026-09-12T00:00:00.000Z')
    const casa = await criarCasaComercial(banco.db, ator, `Casa CTA ${sufixo}`, agora)
    const oferta = await criarOferta(
      banco.db,
      ator,
      {
        casaId: casa.id,
        nome: `Oferta CTA ${sufixo}`,
        modalidade: 'HIBRIDO',
        moeda: 'BRL',
        urlDestino: 'https://casa-cta.test/nba',
        hostDestino: 'casa-cta.test',
      },
      agora,
    )
    await banco.db
      .update(ofertasAfiliados)
      .set({ status: 'ATIVA' })
      .where(eq(ofertasAfiliados.id, oferta.id))
    const parceiro = await criarParceiro(
      banco.db,
      ator,
      { codigo: `parceiro-cta-${sufixo}`, nomePublico: 'Parceiro CTA' },
      agora,
    )
    const link = await criarCampanhaComLink(
      banco.db,
      ator,
      {
        parceiroId: parceiro.id,
        ofertaId: oferta.id,
        nome: `Campanha CTA ${sufixo}`,
        canal: 'SOCIAL',
        codigo: `cta-link-${sufixo}`,
        tipoDestino: 'CASA',
      },
      agora,
    )

    try {
      await definirSaidaDoApito(banco.db, ator, link.id, agora)
      html = await renderizar(item)
      // A saída carrega de qual apito nasceu. `encodeURIComponent` porque a
      // chave contém `|`, que truncaria a query string se fosse crua.
      expect(html).toContain(
        `href="/ir/${link.codigo}?apito=${encodeURIComponent(item.chave)}"`,
      )
      expect(html).toContain('rel="nofollow sponsored"')
      expect(html.toLowerCase()).toContain('a odd da sua casa pode ser outra')
      expect(html).not.toMatch(/<form[^>]*aposta/i)
      expect(html).not.toContain('name="valor"')
    } finally {
      await definirSaidaDoApito(banco.db, ator, null, agora)
    }
  }, 60_000)

  it('o jogo fecha a análise com as siglas e os desfalques que a entrega leu', async () => {
    const item = await sujeito()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizar(item)
    const bloco = textoDaTela(trecho(html, 'O JOGO', 'VER ESTATÍSTICAS'))

    expect(bloco).toContain(detalhe.jogo.casaSigla)
    expect(bloco).toContain(detalhe.jogo.visitanteSigla)
    if (detalhe.jogo.desfalques.length === 0) {
      expect(bloco).toContain('Sem desfalques')
    } else {
      // Com teto: os dois primeiros por extenso, o resto contado.
      for (const nome of detalhe.jogo.desfalques.slice(0, 2)) expect(bloco).toContain(nome)
    }
  }, 60_000)

  it('o rodapé explica a nota sem percentual — a única vez que a palavra proibida aparece é negada', async () => {
    const html = await renderizar(await sujeito())
    const texto = textoDaTela(html)

    expect(texto).toContain('nota de confiança')
    expect(texto).not.toContain('O percentual')
    expect(texto).toContain('Última atualização:')

    // A palavra só pode existir NEGADA, nesta frase e em nenhuma outra.
    const ocorrencias = [...texto.matchAll(/probabilidade/gi)]
    expect(ocorrencias).toHaveLength(1)
    expect(texto).toContain('não uma probabilidade')
  }, 60_000)

  it('respeita as regras de escrita da identidade', async () => {
    const item = await sujeito()
    const html = await renderizar(item)
    const texto = textoDaTela(html)

    regrasDeEscrita(html)
    // Linha SEMPRE inteira, com "+" — nunca meio ponto.
    expect(texto).toContain(`${item.linha}+`)
    // Onde a tela escreve a palavra LINHA e um número, o número é a linha do
    // apito — a régua do gráfico nomeia contra o que tudo foi conferido.
    const marcadas = [...textoSeparado(html).matchAll(/\bLINHA\s+(\d+)/g)]
    expect(marcadas.length).toBeGreaterThan(0)
    for (const [, n] of marcadas) expect(Number(n)).toBe(item.linha)
    // Odd sempre em FAIXA, nunca um número solto passando por certeza.
    expect(texto).toMatch(/\d,\d{2}\s*–\s*\d,\d{2}/)
  }, 60_000)

  it('respeita as MESMAS regras de escrita no caminho Fire Live', async () => {
    const item = await sujeitoFireLive()
    const html = await renderizarSemAtributo(item.jogadorId)
    const texto = textoSeparado(html)

    regrasDeEscrita(html)
    // Este apito não tem linha: tem ALVO do 1º quarto. Nenhum rótulo LINHA
    // pode aparecer com o número do alvo — alvo e linha não são a mesma coisa
    // (a régua do gráfico e a caixa da comparação já erraram isso uma vez).
    expect(texto).not.toMatch(/\bLINHA\b/)
    expect(texto).toContain('ALVO 1Q')
    expect(texto).toContain(`ALVO 1Q ${item.alvo1Q}`)
  }, 60_000)

  it('sem linha pré-live a forma sai sem régua e sem "bateu X de Y"', async () => {
    const item = await sujeitoFireLive()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizarSemAtributo(item.jogadorId)

    // Os valores do histórico são de jogo INTEIRO; o alvo é de doze minutos.
    // Conferir um contra o outro afirmaria um fato que ninguém mediu.
    expect(detalhe.linhaConferida).toBeNull()
    expect(detalhe.bateu).toEqual({ acertos: 0, total: 0 })
    expect(html).toContain('FORMA NO ATRIBUTO')
    expect(textoDaTela(html)).not.toMatch(/bateu \d+ de \d+/)
    expect(html).not.toContain('aria-label="bateu')
    // A média da temporada continua sendo fato — e continua rotulada MÉDIA.
    if (detalhe.mediaTemporada !== null) expect(html).toContain('MÉDIA')
  }, 60_000)

  it('o grau sai em UMA linha sob a pílula — e o resto do rótulo não se esconde num title', async () => {
    const item = await sujeito()
    const ruleset = await rulesetAtivo()
    const faixa = ruleset.confianca_exibicao.faixas.find((f) => f.grau === item.grauConfianca)
    expect(faixa, 'apito sem faixa de confiança no ruleset').toBeDefined()
    const html = await renderizar(item)

    // A pílula já significa confiança; o que falta embaixo é o GRAU. O rótulo
    // inteiro do ruleset não cabe na coluna do hero — quebraria em três linhas
    // e o hero deixaria de alinhar com o nome.
    //
    // A forma curta vem do RULESET (`rotulo_curto`). Este teste já cortou o
    // prefixo "CONFIANÇA " com regex, como a tela fazia — e os dois quebraram
    // juntos em 12/09, quando o grau 5 deixou de começar com essa palavra.
    const grau = faixa!.rotulo_curto ?? faixa!.rotulo
    expect(html).toContain(`>${grau}<`)
    expect(html).not.toContain(`>${faixa!.rotulo}<`)
    // E o resto do rótulo NÃO se esconde num `title`: em toque não há gesto
    // que o revele, e a palavra que sobra ("CONFIANÇA") é o que a pílula já
    // significa — o rodapé a escreve por extenso.
    expect(html).not.toMatch(/title="[^"]*CONFIANÇA/)
  }, 60_000)

  it('o apito do Fire Live abre a MESMA página, com o 1º quarto no topo', async () => {
    const item = await sujeitoFireLive()
    const html = await renderizarSemAtributo(item.jogadorId)

    expect(html).toContain('FIRE LIVE · AO VIVO')
    // A seção do 1º quarto vem antes de tudo que a análise pré-live mostra.
    expect(html.indexOf('1º QUARTO')).toBeGreaterThan(-1)
    expect(html.indexOf('1º QUARTO')).toBeLessThan(html.indexOf('FORMA NO ATRIBUTO'))
    // A barra rumo ao alvo é a mesma do card ao vivo. A conferência é sobre o
    // TEXTO da seção, não sobre o HTML inteiro: procurar o número do alvo no
    // documento cru dava verde de graça — `padding:12px`, `height:7px` e o
    // `55%` do gradiente já contêm qualquer alvo de um ou dois dígitos.
    const secao = textoDaTela(trecho(html, '1º QUARTO', 'FORMA NO ATRIBUTO'))
    expect(secao).toContain('Rumo ao alvo')
    expect(secao).toContain(`${item.valorNoQuarto} / ${item.alvo1Q}`)
  }, 60_000)

  it('a seção do 1º quarto só entra quando o apito ao vivo é do MESMO atributo', async () => {
    // Um apitado pré-live de um atributo que também apita AO VIVO em outro
    // abriria a página com hero de um mercado e BarraAlvo de outro — o
    // ruleset habilita Fire Live nos três atributos, então não é hipótese.
    const item = await sujeito() // PONTOS, com linha
    const ruleset = await rulesetAtivo()
    const { feedSnapshot, jogos } = await import('../../modules/dominio/db/schema')
    const vivo = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    const modelo = vivo.itens[0]
    expect(modelo, 'dia simulado sem apito de Fire Live').toBeDefined()

    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .innerJoin(jogos, eq(jogos.id, feedSnapshot.jogoId))
      .where(
        and(
          eq(feedSnapshot.dataReferencia, HOJE),
          eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
          // Snapshot de jogo encerrado sai do feed ao vivo: cravar o item nele
          // faria o teste passar sem provar nada.
          ne(jogos.status, 'ENCERRADO'),
        ),
      )
      .limit(1)
    expect(linha, 'dia simulado sem snapshot de Fire Live').toBeDefined()

    const original = linha!.feed_snapshot.conteudoJson as ConteudoFeedFireLive
    // Sem `?atributo`, quem manda é o atributo do PRIMEIRO apito pré-live do
    // jogador — é dele que o cravado tem de diferir para o caso existir.
    const { itens } = await linhasDoJogador(banco.db, HOJE, item.jogadorId)
    const doSujeito = itens[0]!.atributo
    const outroAtributo = doSujeito === 'REBOTES' ? 'ASSISTENCIAS' : 'REBOTES'
    const cravado: ItemFireLive = {
      ...modelo!,
      chave: `${modelo!.chave}|teste`,
      jogadorId: item.jogadorId,
      atributo: outroAtributo,
      alvo1Q: 7,
      valorNoQuarto: 5,
    }

    try {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: { ...original, itens: [cravado, ...original.itens] } })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))

      // O item cravado tem de estar VISÍVEL no feed ao vivo — senão a tela
      // ficaria pré-live por falta de dado, não pelo recorte de atributo.
      const conferencia = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
      expect(conferencia.itens.map((i) => i.chave)).toContain(cravado.chave)

      const html = await renderizarSemAtributo(item.jogadorId)
      expect(html).toContain('LISTA SECRETA · PRÉ-LIVE')
      expect(html).not.toContain('FIRE LIVE · AO VIVO')
      expect(html).not.toContain('1º QUARTO')
      expect(html).not.toContain('Rumo ao alvo')
      // E a análise pré-live continua inteira, no atributo do sujeito.
      expect(html).toContain('LINHAS DE')
      expect(html).toContain('FORMA NO ATRIBUTO')
    } finally {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: original })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))
    }
  }, 60_000)

  it('a grade de casas é uma TABELA de verdade — cabeçalho com escopo e legenda', async () => {
    const item = await sujeito()
    const grade = await cotacoesPorCasa(banco.db, [item.jogoId], item.jogadorId, item.atributo)
    const html = await renderizar(item)
    const bloco = trecho(html, 'LINHAS DE', 'O JOGO')

    expect(grade.length).toBeGreaterThan(0)
    // Dado tabular é `<table>`: sem `scope`, o leitor de tela lê as odds em
    // fila e o "—" de uma casa sem cotação perde a coluna a que pertence.
    expect(bloco).toContain('<table')
    expect(bloco).toContain('<caption')
    expect(bloco).toContain('scope="col"')
    // E continua sendo ADR-0004: texto, sem logo e sem link.
    expect(bloco).not.toContain('<img')
    expect(bloco).not.toMatch(/href="https?:/)
    expect(bloco).not.toContain('<a ')
  }, 60_000)

  it('os desfalques saem TODOS, sob o rótulo FORA — nenhum nome depende de um title', async () => {
    // Numa rodada real são 4-8 nomes somando os dois lados. Antes eles saíam
    // como NOME PELADO no meio da caixa (nada dizia que a pessoa está fora) e
    // o resto vivia só no `title` — que em celular não existe, e este é um
    // PWA de uso noturno no celular.
    const item = await sujeito()
    const { jogadores, lesoesEscalacao } = await import('../../modules/dominio/db/schema')
    const elenco = await banco.db.select({ id: jogadores.id }).from(jogadores).limit(6)
    for (const j of elenco) {
      await banco.db
        .insert(lesoesEscalacao)
        .values({ jogoId: item.jogoId, jogadorId: j.id, status: 'FORA' })
        .onConflictDoNothing()
    }

    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    expect(detalhe.jogo.desfalques.length).toBeGreaterThan(3)

    const html = await renderizarSemAtributo(item.jogadorId)
    const caixa = trecho(html, 'O JOGO', 'VER ESTATÍSTICAS')
    const bloco = textoDaTela(caixa)
    // O rótulo diz o que a lista é — o artboard só desenhou o caso vazio
    // ("Sem desfalques"), e um nome sozinho entre duas siglas não se explica.
    expect(bloco).toContain('FORA')
    for (const nome of detalhe.jogo.desfalques) expect(bloco).toContain(nome)
    expect(bloco).not.toContain('e mais ')
    expect(caixa).not.toContain('title=')
  }, 60_000)

  it('o botão de voltar tem nome acessível e leva à lista de onde o assinante veio', async () => {
    const html = await renderizar(await sujeito())

    expect(botaoVoltar(html)).toContain('href="/"')
    expect(html).toContain('LISTA SECRETA · PRÉ-LIVE')
    // O chevron do artboard, não o glifo "←" — e é o mesmo botão do
    // CabecalhoTela, então nenhuma tela fica com o traço da fonte de corpo.
    expect(html).not.toContain('←')
  }, 60_000)

  it('o hero linka o nome, escreve o mercado com "+" e imprime a nota sem %', async () => {
    const item = await sujeito()
    const html = await renderizar(item)
    const hero = html.slice(0, html.indexOf('FORMA NO ATRIBUTO'))

    // O nome é a porta das estatísticas (spec §4.3) — a MESMA rota do card.
    expect(hero).toContain(`href="${rotaDoJogador(item.jogadorId)}"`)
    expect(hero).toContain(item.nome)
    // O mercado, com a linha sempre inteira e com "+".
    expect(hero).toContain(`>${ATRIBUTO_ROTULO[item.atributo]} ${item.linha}+<`)
    // A pílula do grau, em Bebas 34, segue a decisão da identidade 04: nota pura.
    expect(item.confianca).not.toBeNull()
    expect(hero).toMatch(/font-size:34px/)
    expect(hero).toContain(`>${Math.round(item.confianca!)}<`)
    expect(hero).not.toContain(`${Math.round(item.confianca!)}%`)
    // E nada do hero vive só no `title`: em toque não há como revelá-lo.
    expect(hero).not.toContain('title=')
  }, 60_000)

  it('a tabela de linhas também imprime a confiança sem %', async () => {
    const item = await sujeito()
    const html = await renderizar(item)
    const linhas = trecho(html, `LINHAS DE ${ATRIBUTO_ROTULO[item.atributo]}`, 'O JOGO')
    const { itens } = await linhasDoJogador(banco.db, HOJE, item.jogadorId, item.atributo)
    expect(itens.some((linha) => linha.confianca !== null)).toBe(true)
    for (const linha of itens) {
      if (linha.confianca === null) continue
      expect(linhas).toContain(`>${Math.round(linha.confianca)}<`)
    }
    expect(textoDaTela(linhas)).not.toContain('%')
  }, 60_000)

  it('a comparação traz MÉDIA, a LINHA e MIN · MÉDIA com os números da entrega', async () => {
    const item = await sujeito()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizar(item)
    const bloco = textoDaTela(trecho(html, 'COMPARAÇÃO', 'POR QUE ENTROU'))

    expect(bloco).toContain('MÉDIA')
    expect(bloco).toContain('MIN · MÉDIA')
    expect(bloco).toContain(`${item.linha}+`)
    expect(detalhe.mediaTemporada).not.toBeNull()
    expect(bloco).toContain(fmt(detalhe.mediaTemporada!))
    expect(detalhe.minutosMedia).not.toBeNull()
    expect(bloco).toContain(String(Math.round(detalhe.minutosMedia!)))
  }, 60_000)

  it('nenhum fato sai duas vezes na mesma tela', async () => {
    // Sem narrativa, o "fato gerador" repetia LITERALMENTE a primeira linha do
    // POR QUE ENTROU — e o validador reprovou 219 de 276 narrativas em 07/09
    // (spec §5.5): o caminho sem narrativa é o COMUM, não a exceção.
    const preLive = await sujeito()
    const vivo = await sujeitoFireLive()
    const casos: [ItemFeed, string][] = [
      [preLive, await renderizar(preLive)],
      [vivo, await renderizarSemAtributo(vivo.jogadorId)],
    ]
    for (const [item, html] of casos) {
      const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
      const texto = textoDaTela(html)
      for (const fator of detalhe.fatores) {
        expect(texto.split(fator.texto).length - 1, `"${fator.texto}" saiu mais de uma vez`).toBe(1)
      }
    }
  }, 60_000)

  it('sem confiança a pílula não vira uma caixa invisível — o mesmo vazio do card', async () => {
    // O Fire Live não tem nota (o feed grava `confianca: null`). O "—" em
    // Bebas 34 na cor do divisor dá ~1,4:1 sobre o fundo: o elemento mais alto
    // do hero virava uma caixa vazia. A 1.1 já resolveu o MESMO vazio no
    // CardEntrada tirando o "—" — duas telas do mesmo produto, uma decisão só.
    const item = await sujeitoFireLive()
    expect(item.confianca).toBeNull()
    const html = await renderizarSemAtributo(item.jogadorId)
    const hero = html.slice(0, html.indexOf('1º QUARTO'))

    expect(hero).not.toContain('font-size:34px')
    expect(textoSeparado(hero)).not.toContain('—')
  }, 60_000)

  it('sem odd em tela não há aviso de faixa — o disclaimer acompanha a odd exibida', async () => {
    // No caminho nascido ao vivo não há linha pré-live, logo não há grade de
    // casas nem faixa. O aviso do ADR-0004 falando de "faixa entre N casas"
    // sem nenhuma odd por perto é ruído, e ruído enfraquece o disclaimer.
    const item = await sujeitoFireLive()
    const html = await renderizarSemAtributo(item.jogadorId)
    const bloco = trecho(html, 'LINHAS DE', 'O JOGO')
    const texto = textoDaTela(bloco)

    expect(bloco).not.toContain('<table')
    expect(texto).not.toMatch(/\d,\d{2}/)
    expect(texto).not.toContain('Faixa entre')
    expect(texto).not.toContain('Faixa da tabela de referência')
    expect(texto).not.toContain('quanto mais alta')
    expect(texto).not.toContain('Nenhuma aposta é feita por aqui')
  }, 60_000)

  it('apito pré-live que TAMBÉM cruzou o alvo do 1º quarto continua sendo da Lista Secreta', async () => {
    // O caso normal: o apito da Lista Secreta cruza o alvo do 1º quarto e
    // passa a existir nos DOIS feeds, no MESMO atributo. O sujeito da tela
    // continua sendo o pré-live (é dele a linha, a forma na linha e a grade de
    // casas) — rotular a tela de "FIRE LIVE" e mandar o voltar para /fire-live
    // devolveria o assinante a uma lista de onde ele não veio.
    const item = await sujeito()
    const ruleset = await rulesetAtivo()
    const { feedSnapshot, jogos } = await import('../../modules/dominio/db/schema')
    const vivo = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    const modelo = vivo.itens[0]
    expect(modelo, 'dia simulado sem apito de Fire Live').toBeDefined()

    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .innerJoin(jogos, eq(jogos.id, feedSnapshot.jogoId))
      .where(
        and(
          eq(feedSnapshot.dataReferencia, HOJE),
          eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
          ne(jogos.status, 'ENCERRADO'),
        ),
      )
      .limit(1)
    expect(linha, 'dia simulado sem snapshot de Fire Live').toBeDefined()

    const original = linha!.feed_snapshot.conteudoJson as ConteudoFeedFireLive
    const cravado: ItemFireLive = {
      ...modelo!,
      chave: `${modelo!.chave}|mesmo-atributo`,
      jogadorId: item.jogadorId,
      atributo: item.atributo,
      alvo1Q: 7,
      valorNoQuarto: 5,
    }

    try {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: { ...original, itens: [cravado, ...original.itens] } })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))

      const conferencia = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
      expect(conferencia.itens.map((i) => i.chave)).toContain(cravado.chave)

      const html = await renderizar(item)
      expect(html).toContain('LISTA SECRETA · PRÉ-LIVE')
      expect(html).not.toContain('FIRE LIVE · AO VIVO')
      expect(botaoVoltar(html)).toContain('href="/"')
      // A análise pré-live continua inteira — e o 1º quarto entra como seção,
      // porque é o MESMO mercado sendo observado ao vivo.
      expect(html).toContain('1º QUARTO')
      expect(html).toContain(`${item.linha}+`)
      expect(html).toContain('LINHAS DE')
    } finally {
      await banco.db
        .update(feedSnapshot)
        .set({ conteudoJson: original })
        .where(eq(feedSnapshot.id, linha!.feed_snapshot.id))
    }
  }, 60_000)

  it('o título da forma diz quantos jogos o gráfico tem, e a análise usa a coluna de DADO', async () => {
    // 640 num monitor de 1440 é 37% da largura, e o que está espremido ali é
    // tabela: dez jogos em barras, três linhas com odd, três casas.
    const item = await sujeito()
    const detalhe = await detalheDoApito(banco.db, await rulesetAtivo(), item, { blocos: 10 })
    const html = await renderizar(item)
    const esperado = Math.min(detalhe.blocos.length, 10)
    expect(html).toContain(`ÚLTIMOS ${esperado}`)
    if (esperado < 10) expect(html).not.toContain('ÚLTIMOS 10')
    expect(html).toContain('--largura-coluna:1120px')
  }, 60_000)
})
