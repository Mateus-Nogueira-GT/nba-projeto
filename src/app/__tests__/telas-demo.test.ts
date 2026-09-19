import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { feedSnapshot, jogadores } from '../../modules/dominio/db/schema'
import { diaLongo } from '../../components/formato'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { ConteudoFeed } from '../../modules/entrega/lista-secreta'
import { componente } from '../../design-system/tokens/componente'
import { gravarConferencia } from './conferencia'

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
 *
 * O SEED É A TEMPORADA SIMULADA, não o dia roteirizado.
 *
 * `semearDemo` continua existindo — é a fixture dos exemplos literais do
 * documento do CJ (Luka fora abrindo OPD para Reaves, LeBron em oscilação,
 * Curry turbo) que outras suítes usam para ficarem legíveis. Mas esta suíte é
 * a fumaça das telas de PRODUÇÃO, e produção semeia com `simularAte`: o que o
 * cliente vê é uma temporada sorteada, com quem joga hoje decidido pelo
 * calendário e os apitos publicados pelo motor antes de o dia ser jogado.
 * Testar as telas contra o roteiro seria testá-las contra um mundo que
 * ninguém mais monta.
 *
 * Consequência para quem editar este arquivo: NENHUMA asserção pode nomear um
 * jogador, um time ou um horário. Quando a tela precisa de um sujeito
 * concreto, ele é LIDO do banco (ou do feed) e a asserção é sobre ele.
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
// `renderToStaticMarkup` não monta o App Router: só a tela de partida usa
// `useRouter` (AtualizarAoVivo), e sem este mock ela derruba o teste com
// "invariant expected app router to be mounted". Preserva o resto do módulo
// de verdade (`redirect`, `notFound`) — várias outras telas deste arquivo
// dependem deles.
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  // Cadastro público abre por padrão (spec de planos, §7); a config falha
  // alto sem APP_PUBLIC_URL, e /entrar e /assinar a leem no render.
  process.env.APP_PUBLIC_URL = 'https://app.example.com'
  banco = await bancoDeTeste()
  // Com a porta FAKE: é o que roda no ambiente de demonstração (sem
  // OPENROUTER_API_KEY) e é o que faz a lista nascer com narrativa nos cards e
  // resumo no cabeçalho — sem ela, a tela seria testada num estado que o
  // cliente não vê.
  //
  // 21 DIAS, e não os 49 da spec: é o menor histórico que sustenta ao mesmo
  // tempo as três coisas que estas telas mostram — variedade de nível do apito
  // (1/2/3), a janela de 7 dias da tela de Resultados com green E red, e média
  // amostral suficiente para o Fire Live acender. Com 5 dias a tela de
  // Resultados fica pobre e a variedade de níveis some; com 49 a suíte paga
  // minutos de PGlite por nada.
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
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

describe('Lista Secreta', () => {
  // O "card por jogador E atributo" virou UM card por jogador com abas de
  // atributo na identidade 04 — quem prova isso é `telas-04-lista.test.ts`.
  // Aqui fica o que continua valendo: o recorte por atributo existe e o link
  // do detalhe carrega o atributo.
  it('mostra a lista do dia, com o recorte por atributo', async () => {
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

  it('trocar a quantidade PRESERVA o recorte de atributo (regressão)', async () => {
    // O usuário filtrou "Rebotes" e depois pediu "2 vítimas". Os chips de
    // quantidade montavam `/?quantidade=N` seco e devolviam a lista inteira,
    // sem aviso — o filtro que ele acabou de escolher sumia no clique.
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ atributo: 'REBOTES' }) }),
    )

    const quantidades = [...html.matchAll(/href="(\/\?[^"]*quantidade=\d[^"]*)"/g)].map(
      (m) => m[1]!,
    )
    expect(quantidades.length).toBeGreaterThan(0)
    for (const href of quantidades) {
      expect(href).toContain('atributo=REBOTES')
    }

    // E "Lista inteira" (quantidade 0, que some da URL) idem.
    expect(html).toMatch(/href="\/\?atributo=REBOTES"/)
  }, 60_000)

  it('cabeçalho do mockup + grau na pílula', async () => {
    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    // Na identidade 04 a sobrancelha perdeu o "· PRÉ-LIVE" (virou o selo de
    // contexto no canto) e os chips HOJE/RESULTADOS deram lugar ao seletor
    // POR JOGO · POR NÍVEL — ver `telas-04-lista.test.ts`.
    expect(html).toContain('LISTA SECRETA')
    expect(html).toContain('LISTA DO DIA')
    // No TEXTO: na identidade 06 a meta virou rótulo pequeno + número grande,
    // dois elementos irmãos, e no HTML cru há tags entre eles.
    const semTags = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(semTags).toMatch(/PONTOS \d+\+/)
    // Nenhuma LINHA com meio ponto. Cegar em /\d,5/ seria errado: a tela de
    // Gestão exibe "0,5 unidade" legitimamente.
    expect(semTags).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
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

    // Identidade 04: o título da seção é o rótulo do atributo, em caixa alta.
    expect(html).toContain('LINHAS DE REBOTES')
    expect(html).toContain('REB')
    // O seed cotou três casas: a tela não pode cair na tabela de referência.
    expect(html).toContain('Faixa entre 3 casas')
    // P12: o percentual nunca é chamado de probabilidade sem negação na frente.
    expect(html).toContain('não uma')
  }, 60_000)

  it('detalhe redesenhado: faixa, três caixas, blocos e por quê', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    // Um apitado de PONTOS COM histórico na linha. Era o LeBron, porque o seed
    // roteirizado o punha em oscilação de propósito; na temporada simulada
    // quem apita é consequência do sorteio, então o sujeito é procurado pela
    // PROPRIEDADE que a tela exige (os cinco blocos só existem com `ultimos5`)
    // e nunca pelo nome.
    const alvo = feed!.conteudo.itens.find(
      (i) => i.atributo === 'PONTOS' && i.linha !== null && i.ultimos5.length > 0,
    )
    expect(alvo, 'lista de hoje sem apito de PONTOS com histórico na linha').toBeDefined()
    const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ jogadorId: alvo!.jogadorId }),
        searchParams: Promise.resolve({ atributo: 'PONTOS' }),
      }),
    )
    // Identidade 04: sob a pílula sai só o GRAU, em uma linha de 10 px como no
    // artboard; o rótulo inteiro do ruleset não cabe na coluna do hero — e o
    // que sobra dele não se esconde num `title`, que em toque não existe.
    //
    // As formas curtas vêm do RULESET, não de uma lista aqui: trocar um rótulo
    // no YAML não pode quebrar teste (regra 1).
    const { rulesetAtivo: rulesetDoDetalhe } = await import('../../modules/entrega/ruleset-ativo')
    const curtos = (await rulesetDoDetalhe()).confianca_exibicao.faixas.map(
      (f) => f.rotulo_curto ?? f.rotulo,
    )
    expect(
      curtos.some((c) => html.includes(`>${c}<`)),
      'grau sob a pílula',
    ).toBe(true)
    expect(html).not.toMatch(/title="[^"]*CONFIANÇA/)
    expect(html).toContain('MÉDIA')
    // Identidade 04: os últimos CINCO em quadrados viraram a forma no atributo
    // — dez barras com a linha marcada, e o "bateu x de y" saiu da caixa para
    // o auxiliar da seção. As asserções finas estão em telas-04-detalhe.test.ts.
    expect(html).toMatch(/bateu \d+ de \d+/)
    // O número do título é o que o DADO tem, não um 10 fixo (auditoria de UX
    // para web, §4.3): quem tem menos de dez jogos conferidos lia um título
    // que mentia, enquanto a legenda ao lado já dizia "bateu 7 de 9".
    expect(html).toMatch(/FORMA NO ATRIBUTO · ÚLTIMOS? \d+/)
    expect(html).toContain('POR QUE ENTROU')
    expect(html).toContain('VER ESTATÍSTICAS')
    expect(html).not.toContain('ALTÍSSIMO VALOR')
    expect(html).not.toContain('MÉDIA 5J')
    // Redundância obrigatória: bateu/não-bateu não pode depender só da cor. No
    // gráfico dos últimos 10 cada barra leva ✓ ou · junto do valor, e a régua
    // nomeia a linha — inteira e com "+" — contra a qual tudo é comparado.
    expect(html).toMatch(/LINHA \d+\+/)
    expect(html).toMatch(/[✓·] \d+/)
  }, 60_000)
})

describe('Fire Live', () => {
  it('se atualiza sozinho a cada 30 s enquanto há jogo no 1º quarto — e só então (identidade 04)', async () => {
    // Até a 03, o único refresh do app era o da tela de partida; o Fire Live
    // dependia do push ou de o assinante navegar. O componente é o mesmo
    // (`AtualizarAoVivo`), montado só quando o servidor vê jogo ao vivo — e
    // ele deixa um marcador no HTML para a fumaça provar que foi montado.
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const comJogo = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(comJogo).toContain('data-atualiza-ao-vivo="30000"')

    const { jogos } = await import('../../modules/dominio/db/schema')
    const vivos = await banco.db.select().from(jogos).where(eq(jogos.status, 'AO_VIVO'))
    try {
      for (const j of vivos) {
        await banco.db
          .update(jogos)
          .set({ status: 'AGENDADO', quartoAtual: null })
          .where(eq(jogos.id, j.id))
      }
      const semJogo = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(semJogo).not.toContain('data-atualiza-ao-vivo')
    } finally {
      for (const j of vivos) {
        await banco.db
          .update(jogos)
          .set({ status: j.status, quartoAtual: j.quartoAtual })
          .where(eq(jogos.id, j.id))
      }
    }
  }, 60_000)

  it('Ao vivo: cabeçalho vermelho, placar 1Q, selo VIVO e barra de progresso', async () => {
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(/>FIRE LIVE</)
    expect(html).toContain('AO VIVO</span>')
    expect(html).toContain('ACONTECENDO')
    expect(html).toContain('1º Q')

    // O PLACAR DO JOGO AO VIVO APARECE — pela sigla da CASA, lida do banco.
    // Quem joga hoje é decisão do calendário simulado, então nomear um time
    // aqui ('OKC', como era) só voltaria a testar o roteiro.
    const { jogos, times } = await import('../../modules/dominio/db/schema')
    const [aoVivo] = await banco.db.select().from(jogos).where(eq(jogos.status, 'AO_VIVO')).limit(1)
    expect(aoVivo).toBeDefined()
    const [casa] = await banco.db
      .select()
      .from(times)
      .where(eq(times.id, aoVivo!.timeCasaId))
      .limit(1)
    expect(html).toContain(casa!.sigla)
    // A sobrancelha da tela já contém "AO VIVO" — `toContain('VIVO')` passaria
    // mesmo sem o selo do card. O selo é a Pilula `texto="VIVO"` de
    // CardEntrada, que renderiza como `>VIVO<` (span sem filhos além do
    // texto); a sobrancelha nunca produz esse padrão.
    expect(html).toMatch(/>VIVO</)
    expect(html).toMatch(/ALVO BATIDO|FALTA \d/)
  }, 60_000)
})

describe('tela de Resultados', () => {
  // A tela mora em `/resultados/[data]` desde a identidade 04 (§4.4) e é
  // testada em `telas-04-resultados.test.ts`. Aqui fica só o atalho: quem
  // chega em `/resultados` vai para a ÚLTIMA rodada com conferência — a noite
  // que terminou —, não para a rodada em curso.
  it('o atalho leva à última rodada com conferência', async () => {
    const { ultimaRodadaConferida } = await import('../../modules/entrega/resultados')
    const { default: Pagina } = await import('../(app)/resultados/page')
    const destino = await ultimaRodadaConferida(banco.db, HOJE)
    expect(destino).not.toBeNull()
    expect(destino).not.toBe(HOJE)
    await expect(Pagina({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining(`/resultados/${destino}`),
    })
  }, 60_000)
})

describe('a rodada segue o fuso do cliente', () => {
  it('o resumo do dia aparece no topo — e sem ele a tela não abre buraco', async () => {
    // Gerado, validado e gravado desde a spec §4.4, e nunca renderizado: o
    // `grep resumoDoDia` só encontrava o tipo, o escritor e os testes.
    const onde = and(
      eq(feedSnapshot.dataReferencia, HOJE),
      eq(feedSnapshot.estrategia, 'LISTA_SECRETA'),
    )
    const [linha] = await banco.db.select().from(feedSnapshot).where(onde).limit(1)
    const original = linha!.conteudoJson as ConteudoFeed
    expect(typeof original.resumoDoDia).toBe('string')

    const { default: Pagina } = await import('../(app)/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain(original.resumoDoDia!)

    // Ausente é caso NORMAL (sem chave, provedor fora, texto reprovado) e não
    // pode virar um bloco vazio anunciando defeito — mesma regra da narrativa
    // dentro do card.
    try {
      const semResumo: ConteudoFeed = { ...original, resumoDoDia: null }
      await banco.db.update(feedSnapshot).set({ conteudoJson: semResumo }).where(onde)
      const semHtml = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(semHtml).not.toContain(original.resumoDoDia!)
      expect(semHtml).not.toContain('border-left:2px solid')
      expect(semHtml).toContain('LISTA DO DIA')
    } finally {
      await banco.db.update(feedSnapshot).set({ conteudoJson: original }).where(onde)
    }
  }, 60_000)

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

      // O estado "sem lista" da 04 é "Próxima lista às HH:MM"; publicada, o
      // o CONTADOR do cabeçalho conta a rodada (identidade 05): o número num
      // <strong> e o que ele conta ao lado.
      expect(html).not.toContain('Próxima lista às')
      expect(html).toMatch(/entradas em \d+ jogos/)
    } finally {
      vi.setSystemTime(AGORA)
    }
  }, 60_000)

  it('os horários dos jogos saem no fuso, não no do servidor', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    // Flake registrado em 13/09 e nunca reproduzido: na próxima ocorrência, o
    // HTML fica em disco para alguém ver ONDE o "00:00" apareceu. Não depende
    // de CONFERENCIA=1 — é justamente no CI, sem ela, que o flake vive.
    onTestFailed(async () => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const dir = process.env.CONFERENCIA_DIR ?? '.superpowers/conferencia'
      await mkdir(dir, { recursive: true })
      await writeFile(`${dir}/flake-00-00.html`, html)
    })

    // O calendário simulado sorteia os horários entre 19:00 e 22:30 LOCAIS, em
    // meia-horas — não há mais horário fixo para nomear aqui. Então o teste lê
    // um jogo AGENDADO de hoje, formata no fuso do ruleset e exige ESSE
    // horário na tela. (O primeiro jogo do dia está AO VIVO e mostra o placar
    // no lugar do horário; por isso a busca é pelos AGENDADOS.)
    const { jogos } = await import('../../modules/dominio/db/schema')
    const [agendado] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, HOJE), eq(jogos.status, 'AGENDADO')))
      .limit(1)
    expect(agendado).toBeDefined()
    const local = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: FUSO,
      hourCycle: 'h23',
    }).format(agendado!.dataHoraUtc)
    expect(html).toContain(local)
    // A âncora que pega o bug de verdade: num servidor em UTC, sem o fuso
    // explícito, um jogo das 21:00 de Brasília sairia como 00:00 — e no dia
    // seguinte. Nenhum horário sorteado entre 19:00 e 22:30 vira 00:00 local.
    expect(html).not.toContain('00:00')
  }, 60_000)
})

describe('Estatísticas — identidade 03 (conferência em lote)', () => {
  it('o box score do time tem NÚMEROS, não uma parede de travessões', async () => {
    // A demo semeava box score de JOGADOR e nunca o do TIME. A tela de time
    // lê `estatisticas_time_jogo`, então cada partida encerrada aparecia com
    // quartos, REB, AST, TO, FG% e 3P% todos em "—". Para o cliente é a tela
    // mais quebrada do app; para o código, tudo funcionava — só faltava dado.
    const { times, jogos } = await import('../../modules/dominio/db/schema')
    const { eq: igual } = await import('drizzle-orm')

    // Um time com jogo ENCERRADO — é sobre esses que a tela promete números.
    const [encerrado] = await banco.db
      .select()
      .from(jogos)
      .where(igual(jogos.status, 'ENCERRADO'))
      .limit(1)
    const [time] = await banco.db
      .select()
      .from(times)
      .where(igual(times.id, encerrado!.timeCasaId))
      .limit(1)

    const { telaDoTime } = await import('../../modules/entrega/estatisticas/time')
    const { temporadaDe, calendarioDoRuleset } = await import('../../modules/dominio/temporada')
    const ruleset = await rulesetAtivo()
    const tela = await telaDoTime(banco.db, time!.id, {
      temporada: temporadaDe(AGORA, calendarioDoRuleset(ruleset)),
    })

    // Jogo AO VIVO tem placar parcial e NÃO tem box score fechado — a
    // asserção é sobre os encerrados, que a tela promete completos.
    const idsEncerrados = new Set(
      (await banco.db.select().from(jogos).where(igual(jogos.status, 'ENCERRADO'))).map(
        (j) => j.id,
      ),
    )
    const encerrados = tela!.jogosDoTime.filter((j) => idsEncerrados.has(j.jogoId))
    expect(encerrados.length).toBeGreaterThan(0)
    for (const jogo of encerrados) {
      expect(jogo.nosso).not.toBeNull()
      expect(jogo.deles).not.toBeNull()
      // Os quartos FECHAM com o total: um box score que não soma é pior que
      // um ausente, porque parece dado.
      const q = jogo.nosso!
      expect(q.q1 + q.q2 + q.q3 + q.q4 + q.prorrogacao).toBe(q.total)
      expect(q.total).toBeGreaterThan(0)
      expect(jogo.rebotesTotal).not.toBeNull()
      expect(jogo.assistencias).not.toBeNull()
      expect(jogo.fgPercentual).not.toBeNull()
    }

    // E o jogo AO VIVO não recebe veredito: a coluna "Res" derivava V/D de
    // qualquer placar não-nulo, então uma partida no 1º quarto aparecia como
    // "V 51–32" — a tela declarava vencedor de um jogo em andamento.
    const aoVivo = tela!.jogosDoTime.filter((j) => !idsEncerrados.has(j.jogoId))
    for (const jogo of aoVivo) {
      expect(jogo.resultado).toBeNull()
    }
  }, 60_000)

  it('as três telas vestem a identidade e o time mostra o boxscore por partida', async () => {
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const htmlIndice = renderToStaticMarkup(await Indice({ searchParams: Promise.resolve({}) }))

    const { jogadores } = await import('../../modules/dominio/db/schema')
    const [umJogador] = await banco.db.select().from(jogadores).limit(1)
    const { default: Jogador } = await import('../(app)/estatisticas/jogador/[id]/page')
    const htmlJogador = renderToStaticMarkup(
      await Jogador({ params: Promise.resolve({ id: umJogador!.id }) }),
    )

    const { times } = await import('../../modules/dominio/db/schema')
    const [umTime] = await banco.db.select().from(times).limit(1)
    const { default: Time } = await import('../(app)/estatisticas/time/[id]/page')
    const htmlTime = renderToStaticMarkup(
      await Time({
        params: Promise.resolve({ id: umTime!.id }),
        searchParams: Promise.resolve({}),
      }),
    )

    await gravarConferencia(
      'estatisticas',
      `${htmlIndice}<hr style="margin:40px 0">${htmlJogador}<hr style="margin:40px 0">${htmlTime}`,
    )

    // A identidade chega pela Moldura (gradiente) e pela tipografia
    for (const html of [htmlIndice, htmlJogador, htmlTime]) {
      expect(html).toContain('linear-gradient(175deg')
      expect(html).toContain('var(--fonte-bebas)')
      expect(html).not.toContain('PROBABILIDADE')
    }
    // 2P% no perfil (proposta comercial) e o boxscore por partida no time
    // (colunas 1º..4º + total — o rótulo da tela é ordinal, não 'Q1')
    expect(htmlJogador).toContain('2P%')
    expect(htmlTime).toContain('Pontos no 1º quarto')
    expect(htmlTime).toContain('TOT')
  }, 60_000)
})

describe('tela de Gestão de banca', () => {
  it('cada linha do plano leva ao detalhe do apito (beco sem saída)', async () => {
    // A tela dizia "entre R$ 25,00 no Curry PTS 20" e não oferecia nenhum
    // caminho para descobrir POR QUE aquele apito existe: nenhuma linha era
    // clicável, e o único jeito de chegar ao detalhe era voltar à lista e
    // procurar o jogador de novo.
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ banca: '1000' }) }),
    )

    const detalhes = [
      ...html.matchAll(/href="\/apito\/[0-9a-f-]+\?atributo=(PONTOS|REBOTES|ASSISTENCIAS)"/g),
    ]
    expect(detalhes.length).toBeGreaterThan(0)
  }, 60_000)

  it('renderiza o plano do dia com o aviso de modelo de demonstração', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ banca: '1000' }) }),
    )

    expect(html).toContain('GESTÃO DE BANCA')
    expect(html).toContain('PLANO DO DIA')
    // O aviso não é decoração: é o que separa um exemplo de uma recomendação.
    expect(html).toContain('Modelo de demonstração')
    expect(html).toContain('1 unidade')
    expect(html).not.toContain('Modelo de gestão ainda não definido')
  }, 60_000)

  it('banca inválida cai no padrão em vez de espalhar NaN pela tela', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ banca: 'abc' }) }),
    )

    expect(html).not.toContain('NaN')
  }, 60_000)
})

describe('a aba teórica', () => {
  it('mostra a régua de 5 faixas turquesa com rótulos, não a escala antiga', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    // Os rótulos vêm do RULESET, não de uma lista aqui: a régua é exibição e o
    // texto dela muda por YAML (em 12/09 o grau 5 deixou de ser "CONFIANÇA
    // MÁXIMA"). O que o teste trava é que as CINCO faixas aparecem, com o
    // texto que o ruleset ativo declara.
    const { rulesetAtivo } = await import('../../modules/entrega/ruleset-ativo')
    const faixas = (await rulesetAtivo()).confianca_exibicao.faixas
    expect(faixas).toHaveLength(5)
    for (const f of faixas) expect(html, `faixa grau ${f.grau}`).toContain(f.rotulo)
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
    expect(html).toContain('vieram da curadoria NIP')
  }, 60_000)

  it('não fala mais em círculo para o indicador do apito — o Avatar é um quadrado arredondado', async () => {
    const { default: Pagina } = await import('../(app)/como-funciona/page')
    const html = renderToStaticMarkup(await Pagina())
    expect(html).not.toContain('círculo')
  }, 60_000)
})

describe('telas restantes — identidade 03 (conferência em lote)', () => {
  it('resultados, gestão, como-funciona e entrar vestem o gradiente — e nada de universo quente', async () => {
    const { default: Resultados } = await import('../(app)/resultados/[data]/page')
    const { default: Gestao } = await import('../(app)/gestao/page')
    const { default: ComoFunciona } = await import('../(app)/como-funciona/page')
    const { default: Entrar } = await import('../(app)/entrar/page')

    const htmls = [
      renderToStaticMarkup(await Resultados({ params: Promise.resolve({ data: HOJE }) })),
      renderToStaticMarkup(await Gestao({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(await ComoFunciona()),
      renderToStaticMarkup(await Entrar({ searchParams: Promise.resolve({}) })),
    ]
    await gravarConferencia('restante', htmls.join('<hr style="margin:40px 0">'))

    for (const html of htmls) {
      expect(html).toContain('linear-gradient(175deg')
      expect(html).not.toContain('#241A2E')
      expect(html).not.toContain('PROBABILIDADE')
    }
  }, 60_000)
})

describe('regras transversais da identidade', () => {
  it('nenhuma tela contém meio ponto, ALTÍSSIMO VALOR, três pontos, "Carlos" ou a lista do CJ', async () => {
    const comSearchParams = ['../(app)/page', '../(app)/fire-live/page', '../(app)/gestao/page']
    for (const rota of comSearchParams) {
      const { default: Pagina } = await import(rota)
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('3 PONTOS')
      expect(html).not.toContain('Carlos')
      expect(html).not.toContain('lista do CJ')
      expect(html).not.toContain('LISTA DO CJ')
    }

    // A rodada de /resultados vem da ROTA, não de searchParams.
    const { default: Resultados } = await import('../(app)/resultados/[data]/page')
    const htmlResultados = renderToStaticMarkup(
      await Resultados({ params: Promise.resolve({ data: HOJE }) }),
    )
    expect(htmlResultados).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
    expect(htmlResultados).not.toContain('ALTÍSSIMO VALOR')
    expect(htmlResultados).not.toContain('3 PONTOS')
    expect(htmlResultados).not.toContain('Carlos')
    expect(htmlResultados).not.toContain('lista do CJ')
    expect(htmlResultados).not.toContain('LISTA DO CJ')
  }, 60_000)

  // A rede acima cobre só 4 rotas — e nenhuma delas é onde "NA LISTA DO CJ" e
  // o vazio da hierarquia de fato moravam. É exatamente a família de
  // estatísticas (a aba que lê as duas visões de time) e as telas de texto
  // fixo (como-funciona) que precisam da mesma rede. `/assinar` e
  // `/preferencias` ficam de fora — ver a nota abaixo do teste.
  it('nem em estatísticas, como-funciona, entrar, no detalhe do apito, na conta ou no cadastro aparece "Carlos" ou a lista do CJ', async () => {
    const { jogadores: tabelaJogadores, times: tabelaTimes, jogos: tabelaJogos } = await import(
      '../../modules/dominio/db/schema'
    )
    const [umJogador] = await banco.db.select().from(tabelaJogadores).limit(1)
    const [umTime] = await banco.db.select().from(tabelaTimes).limit(1)
    const [umJogo] = await banco.db.select().from(tabelaJogos).limit(1)

    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const apitado = feed!.conteudo.itens[0]
    expect(apitado, 'lista de hoje sem nenhum apito para render o detalhe').toBeDefined()

    const { default: IndiceEstatisticas } = await import('../(app)/estatisticas/page')
    const { default: PaginaJogador } = await import('../(app)/estatisticas/jogador/[id]/page')
    const { default: PaginaTime } = await import('../(app)/estatisticas/time/[id]/page')
    const { default: PaginaJogo } = await import('../(app)/estatisticas/jogo/[id]/page')
    const { default: ComoFunciona } = await import('../(app)/como-funciona/page')
    const { default: Entrar } = await import('../(app)/entrar/page')
    const { default: Apito } = await import('../(app)/apito/[jogadorId]/page')
    const { default: Conta } = await import('../(app)/conta/page')
    const { default: Cadastrar } = await import('../(app)/cadastrar/page')

    const htmls = [
      renderToStaticMarkup(await IndiceEstatisticas({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(
        await PaginaJogador({ params: Promise.resolve({ id: umJogador!.id }) }),
      ),
      renderToStaticMarkup(
        await PaginaTime({
          params: Promise.resolve({ id: umTime!.id }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(
        await PaginaJogo({
          params: Promise.resolve({ id: umJogo!.id }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(await ComoFunciona()),
      renderToStaticMarkup(await Entrar({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(
        await Apito({
          params: Promise.resolve({ jogadorId: apitado!.jogadorId }),
          searchParams: Promise.resolve({ atributo: apitado!.atributo }),
        }),
      ),
      renderToStaticMarkup(await Conta({ searchParams: Promise.resolve({}) })),
      renderToStaticMarkup(await Cadastrar()),
    ]

    for (const html of htmls) {
      expect(html).not.toContain('Carlos')
      expect(html).not.toContain('lista do CJ')
      expect(html).not.toContain('LISTA DO CJ')
    }
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
    expect(antes).toContain(componente.contextoQuente.cardGradiente)
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
      await banco.db
        .delete(jogadoresOcultos)
        .where(igual(jogadoresOcultos.jogadorId, alvo.jogadorId))
    }
  }, 60_000)

  it('filtro da URL que zera a lista mostra "Nada com esse filtro" — não uma tela em branco', async () => {
    // Errata 25/08: a cláusula de tudo-oculto tinha engolido este estado.
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ time: 'ZZZ' }) }),
    )
    expect(html).toContain('Nada com esse filtro')
    expect(html).toContain('Ver todos')
  }, 60_000)

  it('todos os apitados ocultos ganham a explicação própria, não a cópia do filtro', async () => {
    const { lerFeedFireLive } = await import('../../modules/entrega/fire-live/leitura')
    const ruleset = await rulesetAtivo()
    const { itens } = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    const { jogadoresOcultos } = await import('../../modules/dominio/db/schema')
    const ids = [...new Set(itens.map((i) => i.jogadorId))]
    await banco.db
      .insert(jogadoresOcultos)
      .values(ids.map((jogadorId) => ({ usuarioId: USUARIO_DEMO, jogadorId })))
      .onConflictDoNothing()
    try {
      const { default: Pagina } = await import('../(app)/fire-live/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).toContain('Todos os apitados estão ocultos')
      expect(html).not.toContain('Nada com esse filtro')
      expect(html).toContain('Jogadores ocultos') // a seção de reativar está logo ali
    } finally {
      const { inArray: dentro } = await import('drizzle-orm')
      await banco.db.delete(jogadoresOcultos).where(dentro(jogadoresOcultos.jogadorId, ids))
    }
  }, 60_000)
})

// ===========================================================================
// A FOTO ATRAVESSA AS DUAS TELAS (I3)
// ===========================================================================

describe('Detalhe do apito — identidade 03', () => {
  it('hero frio, blocos no par das barrinhas e nunca a palavra probabilidade', async () => {
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    // Um apitado que BATEU a linha em pelo menos um dos últimos 5 — é o que a
    // asserção do verde `#2FBF71` (bloco "bateu") exige para ter o que
    // comparar. Sob o seed roteirizado qualquer item servia, porque o roteiro
    // desenhava histórico misto; a temporada simulada sorteia, e há apitado
    // com os cinco blocos vermelhos. Escolher pela propriedade em vez de
    // afrouxar o `toContain` mantém a asserção provando o que provava: o par
    // das barrinhas, e nunca o verde categórico do apito nível 3.
    const item = (await lerFeed(banco.db, HOJE))!.conteudo.itens.find(
      (i) => i.linha !== null && i.ultimos5.some((u) => u.bateu),
    )
    expect(item, 'lista de hoje sem apitado que tenha batido a linha nos últimos 5').toBeDefined()

    const { default: Detalhe } = await import('../(app)/apito/[jogadorId]/page')
    const html = renderToStaticMarkup(
      await Detalhe({
        params: Promise.resolve({ jogadorId: item!.jogadorId }),
        searchParams: Promise.resolve({ atributo: item!.atributo }),
      }),
    )
    await gravarConferencia('detalhe-apito', html)

    // hero no universo frio da identidade 03
    expect(html).toContain(componente.contextoFrio.cardGradiente)
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

describe('tela de partida', () => {
  async function renderizarJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
    const { jogos } = await import('../../modules/dominio/db/schema')
    const { eq: igual } = await import('drizzle-orm')
    const [j] = await banco.db.select().from(jogos).where(igual(jogos.status, status)).limit(1)
    const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
    return renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ id: j!.id }), searchParams: Promise.resolve({}) }),
    )
  }

  it('jogo encerrado mostra os dois box scores e a nota', async () => {
    const html = await renderizarJogo('ENCERRADO')
    await gravarConferencia('tela-de-partida', html)
    expect(html).toContain('NOTA')
    // A nota é impressa com vírgula, como todo decimal do produto. Ancorado
    // no `background` de uma das 5 faixas do PRÓPRIO badge da nota
    // (componente.notaFaixa*) — sem isso, qualquer célula de FG%/3P%/LL%
    // (que `pct()` também imprime como "45,5%") satisfaria o regex sozinha,
    // mesmo que a nota regredisse para um formato sem vírgula.
    expect(html).toMatch(/background:#(1F6F4A|2E7D62|3D5A80|4A4E69|5C3A3A)[^>]*>[3-9],\d/)
    expect(html).toContain('Líderes da partida')
  })

  it('jogo AO VIVO não declara vencedor nem esconde o parcial', async () => {
    const html = await renderizarJogo('AO_VIVO')
    expect(html).toContain('AO VIVO')
    // Ausência do veredito: "Líderes da partida" só renderiza quando
    // `encerrado` (page.tsx) — é a peça mais próxima de um resultado final
    // que a tela produz, e um jogo no 1º quarto não pode mostrá-la.
    expect(html).not.toContain('Líderes da partida')

    // ...E O PARCIAL, que o nome do teste prometia e ele não conferia: o
    // jogo em destaque da demo abria em "Box score em atualização" porque o
    // seed só escrevia `estatisticas_jogo` no laço dos ENCERRADOS (achado da
    // revisão). Sem estas linhas o teste passava com a tela vazia.
    expect(html).toContain('Pontos por quarto')
    expect(html).not.toContain('Box score em atualização')
    expect(html).not.toContain('Sem dados para exibir')
    // A nota da partida na linha de alguém — prova que o box individual
    // chegou à tela, não só o cabeçalho da seção.
    expect(html).toMatch(/background:#(1F6F4A|2E7D62|3D5A80|4A4E69|5C3A3A)[^>]*>[3-9],\d/)
  })

  it('pré-jogo mostra H2H e forma, sem tabela de travessões', async () => {
    // A lição da "parede de travessões": pré-jogo mostra o que EXISTE, não a
    // ausência do que ainda não aconteceu.
    const html = await renderizarJogo('AGENDADO')
    expect(html).toContain('Confrontos anteriores')
    expect(html).not.toContain('Líderes da partida')
  })

  it('nenhuma tela de partida escreve "probabilidade" ou "nível"', async () => {
    for (const status of ['AGENDADO', 'AO_VIVO', 'ENCERRADO'] as const) {
      const html = (await renderizarJogo(status)).toLowerCase()
      expect(html, status).not.toContain('probabilidade')
      expect(html, status).not.toContain('nível')
    }
  })

  it('cada linha do box score leva ao perfil do jogador', async () => {
    const html = await renderizarJogo('ENCERRADO')
    // Ancorado na legenda da TABELA de box score (Tabela.tsx renderiza
    // `legenda` como <caption>) — sem isso, o mesmo padrão de href também
    // aparece nos links de "Líderes da partida", e o teste passaria mesmo
    // com zero links dentro da tabela em si.
    expect(html).toMatch(
      /<caption[^>]*>Box score de [^<]*<\/caption>[\s\S]*?href="\/estatisticas\/jogador\/[0-9a-f-]+"/,
    )
  })

  it('a aba de stats navega por data e linka para a partida', async () => {
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Indice({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('dia anterior')
    expect(html).toContain('dia seguinte')
    // O link agora carrega a data navegada (fix da revisão: o "voltar" da
    // tela de partida precisa saber para qual dia retornar) — o href não
    // termina mais logo depois do uuid.
    expect(html).toMatch(/href="\/estatisticas\/jogo\/[0-9a-f-]+\?data=\d{4}-\d{2}-\d{2}"/)

    // As duas asserções acima não amarram CADA link ao seu PRÓPRIO rótulo:
    // `nav.anterior`/`nav.seguinte` são dois `string` iguais para o
    // TypeScript, então trocar os dois no JSX (ou fixar um href velho à mão,
    // mantendo o rótulo) deixaria as três asserções acima verdes mesmo com
    // "dia anterior" apontando para amanhã. `ontem`/`amanha` usam a mesma
    // `somarDias` que `navegacaoDeDatas` usa por baixo, a partir do mesmo
    // relógio congelado (AGORA/HOJE) que a página lê — não é um valor fixo
    // que também precisaria ser mantido em dia manualmente.
    const ontem = somarDias(HOJE, -1)
    const amanha = somarDias(HOJE, 1)
    // `[^>]*href=` e não `<a href=`: o `className` da navegação por texto
    // (auditoria de UX para web) entra antes do href no markup do React.
    expect(html).toMatch(
      new RegExp(`<a [^>]*href="/estatisticas\\?data=${ontem}"[^>]*>\\s*← dia anterior\\s*</a>`),
    )
    expect(html).toMatch(
      new RegExp(`<a [^>]*href="/estatisticas\\?data=${amanha}"[^>]*>\\s*dia seguinte →\\s*</a>`),
    )
  })

  it('data inválida na URL não quebra a tela', async () => {
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(
      await Indice({ searchParams: Promise.resolve({ data: 'ontem' }) }),
    )
    expect(html).toContain('Jogos do dia')
  })

  it('o cabeçalho mostra a data navegada, e o vazio não mente "hoje" de um dia que não é hoje', async () => {
    // Antes desta correção o título ficava "Jogos do dia" para qualquer
    // data, e o vazio dizia "Nenhum jogo hoje." — uma afirmação falsa para
    // um dia que não é hoje (achado da revisão).
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const ontem = somarDias(HOJE, -1)
    const amanha = somarDias(HOJE, 1)

    // Ontem: a rodada histórica da demo garante jogos, então o cabeçalho é
    // o que prova a data navegada.
    const htmlOntem = renderToStaticMarkup(
      await Indice({ searchParams: Promise.resolve({ data: ontem }) }),
    )
    expect(htmlOntem).toContain(diaLongo(ontem))

    // Amanhã: a demo não semeia jogo nenhum, então o vazio é genuíno — e
    // precisa dizer a data, nunca "hoje".
    const htmlAmanha = renderToStaticMarkup(
      await Indice({ searchParams: Promise.resolve({ data: amanha }) }),
    )
    expect(htmlAmanha).not.toContain('Nenhum jogo hoje')
    expect(htmlAmanha).toContain(diaLongo(amanha))
  })

  it('H2H vazio mostra a linha prometida pela spec (§6), não esconde a seção', async () => {
    // Um par que NUNCA se enfrentou no histórico — H2H genuinamente vazio,
    // sem precisar mexer no `limiteH2H` (a página sempre usa o padrão).
    //
    // Antes bastava sair do rodízio de 8 times do seed roteirizado; agora os
    // 30 times jogam, e cada um encara só uma parte da liga na janela. Então o
    // par é DERIVADO do banco: o primeiro confronto que o calendário simulado
    // não marcou, em nenhuma das duas ordens de mando.
    const { jogos, times } = await import('../../modules/dominio/db/schema')
    const todosOsTimes = await banco.db.select().from(times)
    const marcados = await banco.db
      .select({ casaId: jogos.timeCasaId, visitanteId: jogos.timeVisitanteId })
      .from(jogos)
    const jaSeEnfrentaram = new Set(
      marcados.flatMap((j) => [`${j.casaId}|${j.visitanteId}`, `${j.visitanteId}|${j.casaId}`]),
    )
    const inedito = todosOsTimes.flatMap((a) =>
      todosOsTimes
        .filter((b) => b.id !== a.id && !jaSeEnfrentaram.has(`${a.id}|${b.id}`))
        .map((b) => [a, b] as const),
    )[0]
    expect(inedito, 'todos os pares de times já se enfrentaram na janela simulada').toBeDefined()
    const [casa, visitante] = inedito!

    const amanha = somarDias(HOJE, 1)
    const [novoJogo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date(`${amanha}T20:00:00.000Z`),
        dataReferencia: amanha,
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'AGENDADO',
      })
      .returning()

    const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
    const html = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ id: novoJogo!.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Confrontos anteriores')
    expect(html).toContain('Primeiro confronto da temporada')
  })
})

describe('a foto do jogador', () => {
  const FOTO = 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png'

  it('aparece no card da lista E no hero do detalhe — não some no caminho', async () => {
    // O detalhe passava `fotoUrl={null}` literal, embora o item do feed já
    // trouxesse a URL. O assinante via a headshot no card, tocava em "linhas e
    // confiança →" e encontrava o monograma "LJ" — o mesmo jogador, dois
    // rostos. /gestao, /resultados e /estatisticas já passavam a foto.
    const { lerFeed, publicarListaSecreta } = await import('../../modules/entrega/lista-secreta')
    const ruleset = await rulesetAtivo()

    // O apitado que ganha a foto é LIDO da lista de hoje — o roteiro (que
    // punha o LeBron ali de propósito) não decide mais quem apita. Só ele
    // recebe `fotoUrl`, e é por isso que `<img>` na tela prova o caminho.
    const escolhido = (await lerFeed(banco.db, HOJE))!.conteudo.itens[0]
    expect(escolhido, 'lista de hoje vazia').toBeDefined()

    await banco.db
      .update(jogadores)
      .set({ fotoUrl: FOTO })
      .where(eq(jogadores.id, escolhido!.jogadorId))
    // Republicar basta: o hash cobre o item inteiro, então a foto nova conta
    // como mudança. Antes era preciso apagar o snapshot à mão aqui.
    await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
    })

    const comFoto = (await lerFeed(banco.db, HOJE))!.conteudo.itens.find(
      (i) => i.jogadorId === escolhido!.jogadorId,
    )!
    expect(comFoto.fotoUrl).toBe(FOTO)

    const { default: Lista } = await import('../(app)/page')
    const htmlLista = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({}) }))
    expect(htmlLista).toContain('<img')

    const { default: Detalhe } = await import('../(app)/apito/[jogadorId]/page')
    const htmlDetalhe = renderToStaticMarkup(
      await Detalhe({
        params: Promise.resolve({ jogadorId: comFoto.jogadorId }),
        searchParams: Promise.resolve({ atributo: comFoto.atributo }),
      }),
    )
    expect(htmlDetalhe).toContain('<img')
    // O monograma DELE — "LJ" era o do LeBron. Pela mesma função que o Avatar
    // usa, para o teste não se afastar do componente se a regra mudar.
    const { iniciaisDe } = await import('../../design-system/componentes')
    expect(htmlDetalhe).not.toContain(`>${iniciaisDe(comFoto.nome)}<`)
  }, 60_000)
})
