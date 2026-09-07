import { createElement } from 'react'
import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { apitos, estatisticasJogo, jogadores, jogos, times } from '../../modules/dominio/db/schema'
import { calendarioDoRuleset, temporadaDe } from '../../modules/dominio/temporada'
import { apitosDoJogador, telaDoJogador } from '../../modules/entrega/estatisticas/jogador'
import type { ApitoDoJogador, TelaJogador } from '../../modules/entrega/estatisticas/jogador'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { NotaPartida } from '../../design-system/componentes'
import { semantico } from '../../design-system/tokens/semantico'
import { diaCurto, diaMes } from '../../components/formato'
import { LIMITE_DE_APITOS_DO_JOGADOR, resumoDosApitos } from '../(app)/estatisticas/moldura'

/**
 * AS TELAS DA IDENTIDADE 04 · ABA DE ESTATÍSTICAS.
 *
 * Mesmo arnês de `telas-demo.test.ts` — o componente de servidor de verdade
 * sobre um PGlite semeado pela temporada simulada; só sessão e direito de
 * acesso são simulados. E a mesma regra de ouro: NENHUMA asserção nomeia
 * jogador, time ou horário. O sujeito é LIDO do banco e a afirmação é sobre
 * ele.
 */

const AGORA = new Date('2026-01-15T18:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
/** O jogador sob teste: o mais apitado que já teve pelo menos um apito conferido. */
let alvo: string
let tela: TelaJogador
let historicoDeApitos: ApitoDoJogador[]
/** Um jogador SEM nenhum apito — o estado da maioria dos perfis da liga. */
let semApito: string
let fuso: string

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO_DEMO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => ({ permitido: true }),
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
  // 7 dias: o menor histórico que já entrega apito conferido (✓ e ✗), jogo do
  // dia ainda sem conferência e notas de partida suficientes para a tabela.
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7, llm: new LLMFake() })

  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  fuso = ruleset.rodada.fuso

  const linhas = await banco.db
    .select({ jogadorId: apitos.jogadorId })
    .from(apitos)
    .where(eq(apitos.estrategia, 'LISTA_SECRETA'))
  const contagem = new Map<string, number>()
  for (const l of linhas) contagem.set(l.jogadorId, (contagem.get(l.jogadorId) ?? 0) + 1)
  const candidatos = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)

  // Preferência por quem tem green E red: é o único sujeito que exercita os
  // dois vereditos (✓ e ✗) na mesma tela. Só conferido serve de reserva.
  for (const id of candidatos.slice(0, 25)) {
    const lista = await apitosDoJogador(banco.db, id, LIMITE_DE_APITOS_DO_JOGADOR)
    const conferidos = lista.filter((a) => a.bateu !== null)
    if (conferidos.length === 0) continue
    const misto =
      conferidos.some((a) => a.bateu === true) && conferidos.some((a) => a.bateu === false)
    if (misto || alvo === undefined) {
      alvo = id
      historicoDeApitos = lista
    }
    if (misto) break
  }
  expect(alvo, 'a temporada simulada precisa de um jogador com apito conferido').toBeDefined()

  const apitados = new Set(linhas.map((l) => l.jogadorId))
  const todos = await banco.db.select({ id: jogadores.id }).from(jogadores)
  semApito = todos.find((j) => !apitados.has(j.id))!.id
  expect(semApito, 'a liga tem mais jogadores do que a lista do CJ').toBeDefined()

  tela = (await telaDoJogador(banco.db, alvo, {
    temporada: temporadaDe(AGORA, calendarioDoRuleset(ruleset)),
  }))!

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarJogador(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogador/[id]/page')
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id }) }))
}

/** Texto visível, sem marcação — para afirmar sobre rótulo e valor vizinhos. */
function texto(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

/**
 * CONFERÊNCIA VISUAL (gate delegado, como em `telas-demo.test.ts`): com
 * CONFERENCIA=1 o HTML real da tela é gravado para conferir ao lado do
 * artboard. `.superpowers/` está no .gitignore.
 */
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

/**
 * O HTML de UMA seção, do título dela até o título da seguinte.
 *
 * Sem isso a asserção casa em qualquer lugar da página — e a página repete
 * componentes (o badge da nota aparece nos quatro números e em cada linha da
 * tabela). Afirmar sobre a página inteira é afirmar sobre nada.
 */
function trecho(html: string, de: string, ate: string): string {
  const inicio = html.indexOf(de)
  expect(inicio, `o trecho "${de}" existe na tela`).toBeGreaterThan(-1)
  const fim = html.indexOf(ate, inicio)
  return html.slice(inicio, fim === -1 ? undefined : fim)
}

function decimal(v: number | null): string {
  return v === null ? '—' : v.toFixed(1).replace('.', ',')
}

/** O HTML da seção "Apitos da estratégia" — o resto da tela não interessa. */
function secaoDeApitos(html: string): string {
  return trecho(html, 'Apitos da estratégia', 'Jogo a jogo')
}

/** O box score do jogador naquele jogo — o dado que os estados do apito leem. */
function ondeBox(jogoId: string, jogadorId: string) {
  return and(eq(estatisticasJogo.jogoId, jogoId), eq(estatisticasJogo.jogadorId, jogadorId))
}

describe('tela do jogador · quatro números e a nota recente', () => {
  it('mostra PTS, REB, AST e a NOTA · ÚLT. 5 renderizada pelo NotaPartida', async () => {
    const html = await renderizarJogador(alvo)
    await gravarConferencia('estatisticas-jogador', html)
    const visivel = texto(html)

    for (const [rotulo, valor] of [
      ['PTS', decimal(tela.perfilNumeros.ataque.pontos)],
      ['REB', decimal(tela.perfilNumeros.defesa.rebotesTotal)],
      ['AST', decimal(tela.perfilNumeros.ataque.assistencias)],
    ] as const) {
      expect(visivel).toContain(`${rotulo} ${valor}`)
    }

    expect(visivel).toContain('NOTA · ÚLT. 5')
    // A nota é o badge de sempre, com a paleta própria — não um número solto.
    // A afirmação é sobre a CAIXA da nota, não sobre a página: a tabela abaixo
    // renderiza o mesmo componente e faria a asserção passar por coincidência.
    expect(tela.notaMediaRecente).not.toBeNull()
    const caixaDaNota = trecho(html, 'NOTA · ÚLT. 5', 'Apitos da estratégia')
    expect(caixaDaNota).toContain(
      renderToStaticMarkup(
        createElement(NotaPartida, { nota: tela.notaMediaRecente, destaque: true }),
      ),
    )
  }, 60_000)
})

describe('tela do jogador · apitos da estratégia', () => {
  it('lista um apito por item de lista, com o veredito nomeado e a contagem "X de Y bateu"', async () => {
    const html = await renderizarJogador(alvo)
    const visivel = texto(html)

    const conferidos = historicoDeApitos.filter((a) => a.estado === 'CONFERIDO')
    const bateram = conferidos.filter((a) => a.bateu === true)
    expect(conferidos.length).toBeGreaterThan(0)

    expect(visivel.toLowerCase()).toContain('apitos da estratégia')
    expect(visivel).toContain(`${bateram.length} de ${conferidos.length} bateu`)
    // Uma linha "fez N" por apito conferido — nem mais, nem menos.
    expect(visivel.match(/fez \d+/g)?.length ?? 0).toBe(conferidos.length)
    for (const apito of conferidos) expect(visivel).toContain(`fez ${apito.fez}`)

    const secao = trecho(html, 'Apitos da estratégia', 'Jogo a jogo')
    // Lista SEMÂNTICA, como em todas as outras telas da aba: sem <ul>/<li> o
    // leitor de tela perde a contagem de itens justamente na seção que a spec
    // chama de mecanismo de confiança verificável.
    expect(secao).toContain('<ul')
    expect(secao.match(/<li/g)?.length ?? 0).toBe(historicoDeApitos.length)

    // O ✓/✗ é NOMEADO, como no CardEntrada: a cor nunca é o único sinal, e um
    // glifo solto não é verbalizado por boa parte dos leitores de tela.
    expect(secao.match(/aria-label="Bateu a linha"/g)?.length ?? 0).toBe(bateram.length)
    expect(secao.match(/aria-label="Não bateu a linha"/g)?.length ?? 0).toBe(
      conferidos.length - bateram.length,
    )

    const primeiro = historicoDeApitos[0]!
    expect(visivel).toContain(`${primeiro.emCasa ? 'vs' : '@'} ${primeiro.adversarioSigla}`)
  }, 60_000)

  it('sem NENHUM apito, o cabeçalho não anuncia um dado pendente que não existe', async () => {
    // A lista do CJ tem ~229 jogadores e a tabela `jogadores` tem a liga
    // inteira: perfil sem apito é a MAIORIA, não um canto raro.
    expect(await apitosDoJogador(banco.db, semApito, LIMITE_DE_APITOS_DO_JOGADOR)).toEqual([])
    const visivel = texto(await renderizarJogador(semApito))

    expect(visivel).toContain('A Lista Secreta ainda não apitou este jogador.')
    expect(visivel).not.toContain('aguardando dado oficial')
  }, 60_000)

  it('apito de jogo ainda não encerrado fica "aguardando dado oficial", nunca "não jogou"', async () => {
    const conferido = historicoDeApitos.find((a) => a.estado === 'CONFERIDO')!
    const [jogo] = await banco.db
      .select()
      .from(jogos)
      .where(eq(jogos.id, conferido.jogoId))
      .limit(1)

    try {
      await banco.db.update(jogos).set({ status: 'AGENDADO' }).where(eq(jogos.id, conferido.jogoId))
      const visivel = texto(await renderizarJogador(alvo))
      const conferidos = historicoDeApitos.filter((a) => a.estado === 'CONFERIDO')

      expect(visivel).toContain('aguardando dado oficial')
      expect(visivel).not.toContain('não jogou')
      // Um veredito a menos: o do jogo que voltou a não estar encerrado.
      expect(visivel.match(/fez \d+/g)?.length ?? 0).toBe(conferidos.length - 1)
    } finally {
      await banco.db
        .update(jogos)
        .set({ status: jogo!.status })
        .where(eq(jogos.id, conferido.jogoId))
    }
  }, 60_000)

  it('a data do apito e a data da tabela são a MESMA forma curta', async () => {
    const visivel = texto(await renderizarJogador(alvo))

    const apito = historicoDeApitos[0]!
    expect(visivel).toMatch(new RegExp(`${diaMes(apito.data, fuso)} (PONTOS|REBOTES|ASSISTÊNCIAS)`))

    const linha = tela.historico[0]!
    const curta = diaMes(linha.data, fuso)
    expect(visivel).toContain(`${curta} ${linha.emCasa ? 'vs' : '@'} ${linha.adversarioSigla}`)
    // A forma de dois dígitos ("08/01") saía na tabela e "8/1" nos apitos, a
    // uma seção de distância e sobre os MESMOS jogos.
    const padrao = diaCurto(linha.data, fuso)
    if (padrao !== curta) {
      expect(visivel).not.toContain(
        `${padrao} ${linha.emCasa ? 'vs' : '@'} ${linha.adversarioSigla}`,
      )
    }
  }, 60_000)
})

describe('tela do jogador · os três estados da linha de apito', () => {
  it('box score com MINUTO ZERO sai como "não jogou", sem ✓ nem ✗ naquela linha', async () => {
    // O DNP de verdade: o provedor mandou a linha do reserva que não entrou.
    // Sem este teste, inverter o ternário da tela (ou apagar o ramo) deixava a
    // suíte inteira verde — a temporada simulada não produz minuto zero.
    const conferido = historicoDeApitos.find((a) => a.estado === 'CONFERIDO')!
    const conferidos = historicoDeApitos.filter((a) => a.estado === 'CONFERIDO')
    // Um jogo pode ter mais de um apito (um por atributo): todos viram DNP.
    const noMesmoJogo = conferidos.filter((a) => a.jogoId === conferido.jogoId).length
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(ondeBox(conferido.jogoId, alvo))
      .limit(1)

    try {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: '0.00', pontos: 0, rebotesTotal: 0, assistencias: 0 })
        .where(ondeBox(conferido.jogoId, alvo))
      const secao = secaoDeApitos(await renderizarJogador(alvo))

      expect((texto(secao).match(/não jogou/g) ?? []).length).toBe(noMesmoJogo)
      // Neutro: quem não entrou em quadra não ganha ✓ nem ✗.
      expect((secao.match(/aria-label="(Bateu|Não bateu) a linha"/g) ?? []).length).toBe(
        conferidos.length - noMesmoJogo,
      )
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({
          minutos: box!.minutos,
          pontos: box!.pontos,
          rebotesTotal: box!.rebotesTotal,
          assistencias: box!.assistencias,
        })
        .where(ondeBox(conferido.jogoId, alvo))
    }
  }, 60_000)

  it('jogo ENCERRADO cujo box ainda não chegou fica "aguardando dado oficial", nunca DNP', async () => {
    // O jogo acabou às 23h e o job de box score ainda não rodou. Dizer "não
    // jogou" aqui é inferir veredito de AUSÊNCIA DE DADO — o que a spec §5.1
    // proíbe, e o que `estadoDoCiclo` já resolve do outro lado do app.
    const conferido = historicoDeApitos.find((a) => a.estado === 'CONFERIDO')!
    const dnpAntes = (texto(secaoDeApitos(await renderizarJogador(alvo))).match(/não jogou/g) ?? [])
      .length
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(ondeBox(conferido.jogoId, alvo))
      .limit(1)

    try {
      await banco.db.delete(estatisticasJogo).where(ondeBox(conferido.jogoId, alvo))
      const [jogo] = await banco.db
        .select()
        .from(jogos)
        .where(eq(jogos.id, conferido.jogoId))
        .limit(1)
      expect(jogo!.status).toBe('ENCERRADO')

      const secao = texto(secaoDeApitos(await renderizarJogador(alvo)))
      expect(secao).toContain('aguardando dado oficial')
      // Nenhum DNP a mais: o box que sumiu não virou "não jogou".
      expect((secao.match(/não jogou/g) ?? []).length).toBe(dnpAntes)
    } finally {
      await banco.db.insert(estatisticasJogo).values(box!)
    }
  }, 60_000)

  it('a MESMA partida não sai com duas datas quando o calendário e o instante divergem', async () => {
    // 22h30 ET vira 03h30 UTC do dia seguinte — o jogo de costa oeste em
    // horário nobre. A linha de apito lia `data_referencia` (rótulo de
    // calendário, em UTC) e a tabela, `data_hora_utc` no fuso do ruleset: "8/1"
    // e "9/1" para o MESMO jogo, a três linhas de distância.
    const apito = historicoDeApitos.find((a) => tela.historico.some((l) => l.jogoId === a.jogoId))!
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)

    try {
      await banco.db
        .update(jogos)
        .set({ dataReferencia: '2025-12-03', dataHoraUtc: new Date('2025-12-04T03:30:00.000Z') })
        .where(eq(jogos.id, apito.jogoId))
      const visivel = texto(await renderizarJogador(alvo))

      // O instante no fuso do ruleset, nas DUAS seções (apito e tabela) — e
      // NUNCA o rótulo de calendário, que aqui está um dia atrás.
      expect((visivel.match(/4\/12/g) ?? []).length).toBeGreaterThanOrEqual(2)
      expect(visivel).not.toContain('3/12')

      // Uma hora antes, o mesmo jogo cai no dia anterior em Brasília: agora é
      // o FUSO que decide. Ler o instante em UTC daria 4/12 nas duas seções.
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: new Date('2025-12-04T02:30:00.000Z') })
        .where(eq(jogos.id, apito.jogoId))
      const noFuso = texto(await renderizarJogador(alvo))
      expect((noFuso.match(/3\/12/g) ?? []).length).toBeGreaterThanOrEqual(2)
      expect(noFuso).not.toContain('4/12')
    } finally {
      await banco.db
        .update(jogos)
        .set({ dataReferencia: jogo!.dataReferencia, dataHoraUtc: jogo!.dataHoraUtc })
        .where(eq(jogos.id, apito.jogoId))
    }
  }, 60_000)
})

describe('o auxiliar da seção de apitos', () => {
  const dnp = { estado: 'NAO_JOGOU', bateu: null } as const
  const pendente = { estado: 'AGUARDANDO_OFICIAL', bateu: null } as const
  const bateu = { estado: 'CONFERIDO', bateu: true } as const
  const falhou = { estado: 'CONFERIDO', bateu: false } as const

  it('conta só os apitos com veredito', () => {
    expect(resumoDosApitos([bateu, falhou, pendente], false)).toBe('1 de 2 bateu')
  })

  it('não anuncia dado pendente quando TODO apito já tem veredito de "não jogou"', () => {
    // Lesão de última hora em toda partida apitada: o cabeçalho dizia
    // "aguardando dado oficial" por cima de linhas que diziam "não jogou".
    expect(resumoDosApitos([dnp, dnp], false)).toBe('sem apito conferido')
  })

  it('aguarda o dado oficial só quando existe apito pendente', () => {
    expect(resumoDosApitos([pendente, dnp], false)).toBe('aguardando dado oficial')
  })

  it('diz que a lista foi cortada no limite, para "X de Y" não virar o retrospecto inteiro', () => {
    expect(resumoDosApitos([bateu, falhou], true)).toBe(
      `1 de 2 bateu · últimos ${LIMITE_DE_APITOS_DO_JOGADOR}`,
    )
  })

  it('sem apito nenhum não há auxiliar', () => {
    expect(resumoDosApitos([], false)).toBeUndefined()
  })
})

describe('tela do jogador · o hero', () => {
  it('o nome é o h1, no hero ao lado do rosto — Anton 26, e uma só vez na tela', async () => {
    const html = await renderizarJogador(alvo)
    const titulos = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) ?? []

    // Um h1 só: com o nome no CabecalhoTela (30 px) E no hero seria o mesmo
    // nome duas vezes; com ele só no cabeçalho o hero ficava com um rosto de
    // 72 px ao lado de duas linhas de 12 e um vazio à direita.
    expect(titulos.length).toBe(1)
    expect(texto(titulos[0]!).trim()).toBe(tela.perfil.nome)
    expect(titulos[0]).toContain('font-size:26px')
    // Anton, o mesmo token de título do resto da identidade (a pilha de
    // fallback vem escapada no HTML; a variável é o que interessa).
    expect(titulos[0]).toContain('var(--fonte-anton)')
    // Dentro do hero: depois do rosto de 72, antes dos quatro números.
    expect(html.indexOf('<h1')).toBeGreaterThan(html.indexOf('width:72px'))
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('NOTA · ÚLT. 5'))
  }, 60_000)
})

describe('tela do jogador · as duas visões de time', () => {
  it('rotula TIME ATUAL e NA LISTA DO CJ, distintos quando os times divergem', async () => {
    const naLista = tela.timeNaListaDoCj
    expect(naLista, 'o jogador apitado está, por definição, na lista do CJ').not.toBeNull()

    const [original] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.id, alvo))
      .limit(1)
    const outro = (await banco.db.select().from(times)).find((t) => t.id !== naLista!.id)!

    try {
      // A divergência é INTENCIONAL no produto (elenco projetado do CJ × time
      // real do provedor) e rara na temporada simulada — então é semeada aqui.
      await banco.db.update(jogadores).set({ timeId: outro.id }).where(eq(jogadores.id, alvo))
      const html = await renderizarJogador(alvo)
      const visivel = texto(html)

      expect(outro.sigla).not.toBe(naLista!.sigla)
      expect(visivel).toMatch(new RegExp(`TIME ATUAL\\s+${outro.sigla}`))
      expect(visivel).toMatch(new RegExp(`NA LISTA DO CJ\\s+${naLista!.sigla}`))
      // As siglas são os ÚNICOS links do hero e precisam se ANUNCIAR como
      // link: na cor do parágrafo e sem sublinhado eram indistinguíveis do
      // texto ao redor (WCAG 1.4.1), e mais fracas que os rótulos vizinhos,
      // que não são links. Acento + sublinhado são dois canais; o
      // inline-block com padding tira o alvo de toque dos ~30x18 px de uma
      // sigla de três letras em 12 px.
      const hero = trecho(html, 'TIME ATUAL', 'NOTA · ÚLT. 5')
      const ancoras = hero.match(/<a [^>]*estatisticas\/time[^>]*>/g) ?? []
      expect(ancoras.length).toBe(2)
      for (const marcacao of ancoras) {
        expect(marcacao).toContain('text-decoration:underline')
        expect(marcacao).toContain(`color:${semantico.acento}`)
        expect(marcacao).toContain('display:inline-block')
      }
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: original!.timeId })
        .where(eq(jogadores.id, alvo))
    }
  }, 60_000)
})

describe('tela do jogador · jogo a jogo', () => {
  it('é uma tabela com a coluna NOTA, uma nota por partida', async () => {
    const html = await renderizarJogador(alvo)

    expect(html).toContain('<table')
    expect(html).toContain('<abbr title="nota da partida">NOTA</abbr>')

    const comNota = tela.historico.find((l) => l.nota !== null)
    expect(comNota, 'a temporada simulada dá minutos suficientes para haver nota').toBeDefined()
    expect(html).toContain(
      renderToStaticMarkup(createElement(NotaPartida, { nota: comNota!.nota })),
    )
  }, 60_000)
})

describe('tela do jogador · regras de escrita', () => {
  it('nada de probabilidade, de "nível" para a nota, de meia linha ou de reticências', async () => {
    const html = await renderizarJogador(alvo)
    const visivel = texto(html)
    const minusculo = visivel.toLowerCase()

    // O % é nota de confiança, nunca probabilidade — e esta aba nem exibe %.
    expect(minusculo).not.toContain('probabilidade')
    expect(minusculo).not.toContain('confiança')

    // "nível" é do JOGADOR ou do APITO. A nota da partida nunca é nível.
    for (const ocorrencia of visivel.match(/nível.{0,16}/gi) ?? []) {
      expect(ocorrencia.toLowerCase()).toMatch(/^nível (do jogador|do apito)/)
    }

    // Linha sempre inteira, com "+". Nunca meio ponto.
    expect(visivel).toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS) \d+\+/)
    expect(visivel).not.toMatch(/\d+,\d+\+/)
    expect(minusculo).not.toContain('meio ponto')

    // Odd, quando aparecer, é sempre FAIXA (1,30–1,70).
    for (const trecho of visivel.match(/ODD[^·]{0,24}/g) ?? []) {
      expect(trecho).toMatch(/\d,\d{2}\s*–\s*\d,\d{2}/)
    }

    expect(minusculo).not.toContain('altíssimo valor')
    expect(visivel).not.toContain('...')
    expect(visivel).not.toContain('…')
  }, 60_000)
})
