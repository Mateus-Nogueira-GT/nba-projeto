import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { jogadores } from '../../modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
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
// Instante fixo: 15:00 em Brasília. Um horário fixo é o que permite afirmar
// alguma coisa sobre fuso — com `new Date()` o teste passaria ou falharia
// conforme a hora em que a suíte roda.
const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: '00000000-0000-4000-8000-000000000001', email: 'demo@teste.com' }),
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
  // O usuário da sessão simulada existe de verdade: telas passaram a consultar
  // preferências por usuarioId (jogadores_ocultos), e uuid inválido quebraria.
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  // As telas leem o relógio para saber que dia é hoje. Sem congelá-lo, elas
  // pediriam a rodada do dia real e encontrariam um banco semeado para outro.
  // Só `Date` é falsificado: falsificar os timers travaria o PGlite.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

// ---------------------------------------------------------------------------
// CONFERÊNCIA VISUAL (gate delegado da identidade 03): com CONFERENCIA=1, o
// HTML real de cada tela é gravado para auditoria humana — o mesmo render
// deste harness, sem simulação paralela. `.superpowers/` está no .gitignore.
// ---------------------------------------------------------------------------
async function gravarConferencia(nome: string, html: string) {
  if (process.env.CONFERENCIA !== '1') return
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const dir = '.superpowers/conferencia'
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    `${dir}/${nome}.html`,
    `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;600&family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet"><style>:root{--fonte-anton:'Anton';--fonte-barlow:'Barlow';--fonte-barlow-condensed:'Barlow Condensed'}body{margin:0;background:#0B1220}</style><body>${html}`,
  )
}

describe('Lista Secreta', () => {
  it('mostra um card por jogador e atributo, com o filtro de atributo', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('LISTA DO DIA')
    // Com rebotes e assistências no ar, o recorte por atributo precisa existir.
    expect(html).toContain('Atributo')
    expect(html).toContain('Rebotes')
    expect(html).toContain('Assistências')
    // O link do detalhe leva o atributo: sem ele a tela de linhas escolheria
    // sozinha qual dos três apitos do jogador mostrar.
    expect(html).toMatch(/\/apito\/[0-9a-f-]+\?atributo=(PONTOS|REBOTES|ASSISTENCIAS)/)
    expect(html).not.toContain('Nenhuma entrada para hoje')
  }, 60_000)

  it('identidade 03: barrinhas, média no rodapé e nunca a palavra probabilidade', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    await gravarConferencia('lista-secreta', html)

    expect(html).toContain('ÚLT. 5 NA LINHA')
    expect(html).toContain('MÉDIA')
    expect(html.toLowerCase()).not.toContain('probabilidade')
    // a tela veste o universo FRIO — o gradiente quente é só do Fire Live
    expect(html).not.toContain('#241A2E')
    expect(html).not.toContain('#241a2e')
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

  it('cabeçalho do mockup + seletor Hoje/Resultados + grau na pílula', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('LISTA SECRETA · PRÉ-LIVE')
    expect(html).toContain('LISTA DO DIA')
    expect(html).toContain('HOJE')
    expect(html).toContain('RESULTADOS')
    expect(html).toMatch(/PONTOS \d+\+/)
    // Nenhuma LINHA com meio ponto. Cegar em /\d,5/ seria errado: a tela de
    // Gestão exibe "0,5 unidade" legitimamente.
    expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
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

  it('detalhe redesenhado: faixa, três caixas, blocos e por quê', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const lebron = feed!.conteudo.itens.find((i) => i.nome === 'LeBron James')!
    const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(await Pagina({
      params: Promise.resolve({ jogadorId: lebron.jogadorId }),
      searchParams: Promise.resolve({ atributo: 'PONTOS' }),
    }))
    expect(html).toMatch(/CONFIANÇA (BOA|SÓLIDA|FORTE|MUITO FORTE|MÁXIMA)/)
    expect(html).toContain('MÉDIA')
    expect(html).toContain('BATEU')
    expect(html).toContain('ÚLTIMOS 5 JOGOS NA LINHA')
    expect(html).toContain('POR QUE ENTROU')
    expect(html).toContain('VER ESTATÍSTICAS')
    expect(html).not.toContain('ALTÍSSIMO VALOR')
    expect(html).not.toContain('MÉDIA 5J')
    // Redundância obrigatória (mesmo padrão de resultados/page.tsx): bateu/não-bateu
    // não pode depender só da cor de fundo do bloco — precisa do sinal textual.
    expect(html).toMatch(/width:44px;height:44px;[^"]*"\s*>\s*(✓|·)\s?\d/)
  }, 60_000)
})

describe('Fire Live', () => {
  it('Ao vivo: cabeçalho vermelho, placar 1Q, selo VIVO e barra de progresso', async () => {
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('FIRE LIVE · AO VIVO')
    expect(html).toContain('ACONTECENDO')
    expect(html).toContain('1º Q')
    expect(html).toContain('OKC') // placar do jogo ao vivo da demo
    // A sobrancelha da tela já contém "AO VIVO" — `toContain('VIVO')` passaria
    // mesmo sem o selo do card. O selo é a Pilula `texto="VIVO"` de
    // CardEntrada, que renderiza como `>VIVO<` (span sem filhos além do
    // texto); a sobrancelha nunca produz esse padrão.
    expect(html).toMatch(/>VIVO</)
    expect(html).toMatch(/LINHA BATIDA|FALTA \d/)
  }, 60_000)
})

describe('tela de Resultados', () => {
  it('renderiza a conferência das rodadas encerradas', async () => {
    const { default: Pagina } = await import('../(app)/resultados/page')
    const html = renderToStaticMarkup(await Pagina())

    expect(html).toContain('RESULTADOS')
    expect(html).toContain('bateram a linha')
    // Se a conferência viesse vazia, a tela cairia no estado vazio — e a demo
    // abriria numa tela em branco.
    expect(html).not.toContain('Nenhuma rodada encerrada ainda')
    expect(html).toMatch(/bateu \d+/)
  }, 60_000)

  it('divide o cabeçalho com Entradas', async () => {
    const { default: Pagina } = await import('../(app)/resultados/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html).toContain('LISTA SECRETA')
    expect(html).toContain('HOJE') // o seletor aparece nos dois lados
  }, 60_000)
})

describe('a rodada segue o fuso do cliente', () => {
  it('às 21h30 de Brasília a lista ainda é a de hoje', async () => {
    // 00:30Z é 21:30 do dia ANTERIOR em Brasília. O cálculo antigo, por UTC,
    // já pedia a lista de amanhã — e o assinante via a tela vazia justamente
    // na hora em que os jogos estavam começando.
    const vinte_e_uma_e_meia = new Date(`${somarDias(HOJE, 1)}T00:30:00.000Z`)
    vi.setSystemTime(vinte_e_uma_e_meia)

    try {
      expect(dataDeReferencia(new Date(), FUSO)).toBe(HOJE)
      expect(new Date().toISOString().slice(0, 10)).not.toBe(HOJE)

      const { default: Pagina } = await import('../(app)/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

      expect(html).not.toContain('ainda não foi publicada')
      expect(html).toContain('sugerida')
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('os horários dos jogos saem no fuso, não no do servidor', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    // O seed marca os jogos às 20h, 21h, 22h e 23h LOCAIS — o das 20h está ao
    // vivo e mostra o placar no lugar do horário. Num servidor em UTC, sem o
    // fuso explícito, o das 21h sairia como 00:00 (e no dia seguinte).
    expect(html).toContain('21:00')
    expect(html).not.toContain('00:00')
  }, 60_000)
})

describe('tela de Gestão de banca', () => {
  it('renderiza o plano do dia com o aviso de modelo de demonstração', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ banca: '1000' }) }))

    expect(html).toContain('GESTÃO DE BANCA')
    expect(html).toContain('PLANO DO DIA')
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

describe('a aba teórica', () => {
  it('mostra a régua de 5 faixas turquesa com rótulos, não a escala antiga', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    for (const r of ['CONFIANÇA BOA', 'CONFIANÇA SÓLIDA', 'CONFIANÇA FORTE', 'CONFIANÇA MUITO FORTE', 'CONFIANÇA MÁXIMA'])
      expect(html).toContain(r)
  }, 60_000)

  it('avisa que a régua é de demonstração quando o ruleset diz isso', async () => {
    const { rulesetAtivo } = await import('../../modules/entrega/ruleset-ativo')
    const ruleset = await rulesetAtivo()
    // A homologação de 18/08/2026 marcou a régua como demonstração — se isso
    // mudar no ruleset, o teste falha e lembra de rever o texto do aviso.
    expect(ruleset.confianca_exibicao.origem).toBe('demonstracao')

    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    // Âncora no texto exclusivo do aviso da RÉGUA — não em "demonstração"
    // sozinho, que também aparece na seção (não relacionada) de rebotes e
    // assistências. Se só o aviso da régua for apagado, esta asserção tem
    // que cair.
    expect(html).toContain('Régua de demonstração')
    expect(html).toContain('ainda não')
    expect(html).toContain('vieram do Mestre da NBA')
  }, 60_000)

  it('não fala mais em círculo para o indicador do apito — o Avatar é um quadrado arredondado', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html).not.toContain('círculo')
  }, 60_000)
})

describe('regras transversais da identidade', () => {
  it('nenhuma tela contém meio ponto, ALTÍSSIMO VALOR ou três pontos', async () => {
    const comSearchParams = ['../(app)/page', '../(app)/fire-live/page', '../(app)/gestao/page']
    for (const rota of comSearchParams) {
      const { default: Pagina } = await import(rota)
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('3 PONTOS')
    }

    // /resultados não recebe searchParams.
    const { default: Resultados } = await import('../(app)/resultados/page')
    const htmlResultados = renderToStaticMarkup(await Resultados())
    expect(htmlResultados).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
    expect(htmlResultados).not.toContain('ALTÍSSIMO VALOR')
    expect(htmlResultados).not.toContain('3 PONTOS')
  }, 60_000)
})

describe('Fire Live — identidade 03', () => {
  it('universo quente, barra rumo ao alvo e jogador oculto some da tela', async () => {
    const { lerFeedFireLive } = await import('../../modules/entrega/fire-live/leitura')
    const ruleset = await rulesetAtivo()
    const semRecorte = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    expect(semRecorte.itens.length).toBeGreaterThan(0)
    const alvo = semRecorte.itens[0]!

    const { default: Pagina } = await import('../(app)/fire-live/page')
    const antes = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    await gravarConferencia('fire-live', antes)
    // temperatura quente no card do fire live, mesmo sem modo fire
    expect(antes).toContain('linear-gradient(135deg, #241A2E, #161226 55%)')
    expect(antes).toContain('/ ') // contagem da BarraAlvo
    // no card, o nome é LINK para as estatísticas do jogador
    expect(antes).toContain(`${alvo.nome}</a>`)

    const { jogadoresOcultos } = await import('../../modules/dominio/db/schema')
    await banco.db
      .insert(jogadoresOcultos)
      .values({ usuarioId: USUARIO_DEMO, jogadorId: alvo.jogadorId })
      .onConflictDoNothing()
    try {
      const depois = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      // o CARD do oculto sai (nome-link some); a seção de gestão entra, com o
      // nome em texto plano e o desfazer
      expect(depois).toContain('Jogadores ocultos')
      expect(depois).not.toContain(`${alvo.nome}</a>`)
      expect(depois).toContain(`${alvo.nome}</span>`)
      expect(depois).toContain('mostrar de novo')
    } finally {
      const { eq: igual } = await import('drizzle-orm')
      await banco.db.delete(jogadoresOcultos).where(igual(jogadoresOcultos.jogadorId, alvo.jogadorId))
    }
  }, 60_000)
})

// ===========================================================================
// A FOTO ATRAVESSA AS DUAS TELAS (I3)
// ===========================================================================

describe('Detalhe do apito — identidade 03', () => {
  it('hero frio, blocos no par das barrinhas e nunca a palavra probabilidade', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const item = (await lerFeed(banco.db, HOJE))!.conteudo.itens.find((i) => i.linha !== null)!

    const { default: Detalhe } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(
      await Detalhe({
        params: Promise.resolve({ jogadorId: item.jogadorId }),
        searchParams: Promise.resolve({ atributo: item.atributo }),
      }),
    )
    await gravarConferencia('detalhe-apito', html)

    // hero no universo frio da identidade 03
    expect(html).toContain('linear-gradient(135deg, #16213A, #111A2E 55%)')
    // blocos dos últimos 5 usam o PAR das barrinhas — nunca o verde categórico
    // do apito nível 3, que significa outra coisa no mesmo produto
    expect(html).toContain('#2FBF71')
    // O anel/badge do Avatar PODE ser #3DD37E — é o canal do apito nível 3.
    // O que não pode é o BLOCO de histórico (place-items… seguido do verde
    // categórico), que era o defeito.
    expect(html).not.toMatch(/place-items:center;background:#3DD37E/)
    // A palavra só pode aparecer NEGADA (rodapé obrigatório: "não uma
    // probabilidade de acerto"). Como RÓTULO, nunca.
    expect(html).toContain('nota de confiança')
    expect(html).not.toContain('PROBABILIDADE')
  }, 60_000)
})

describe('a foto do jogador', () => {
  const FOTO = 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png'

  it('aparece no card da lista E no hero do detalhe — não some no caminho', async () => {
    // O detalhe passava `fotoUrl={null}` literal, embora o item do feed já
    // trouxesse a URL. O assinante via a headshot no card, tocava em "linhas e
    // confiança →" e encontrava o monograma "LJ" — o mesmo jogador, dois
    // rostos. /gestao, /resultados e /estatisticas já passavam a foto.
    const { publicarListaSecreta } = await import('../../modules/entrega/lista-secreta')
    const ruleset = await rulesetAtivo()

    await banco.db
      .update(jogadores)
      .set({ fotoUrl: FOTO })
      .where(eq(jogadores.nomeCompleto, 'LeBron James'))
    // Republicar basta: o hash cobre o item inteiro, então a foto nova conta
    // como mudança. Antes era preciso apagar o snapshot à mão aqui.
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
    })

    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const lebron = (await lerFeed(banco.db, HOJE))!.conteudo.itens.find(
      (i) => i.nome === 'LeBron James',
    )!
    expect(lebron.fotoUrl).toBe(FOTO)

    const { default: Lista } = await import('../(app)/page')
    const htmlLista = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({}) }))
    expect(htmlLista).toContain('<img')

    const { default: Detalhe } = await import('../(app)/apito/[jogadorId]/page')
    const htmlDetalhe = renderToStaticMarkup(
      await Detalhe({
        params: Promise.resolve({ jogadorId: lebron.jogadorId }),
        searchParams: Promise.resolve({ atributo: lebron.atributo }),
      }),
    )
    expect(htmlDetalhe).toContain('<img')
    expect(htmlDetalhe).not.toContain('>LJ<')
  }, 60_000)
})
