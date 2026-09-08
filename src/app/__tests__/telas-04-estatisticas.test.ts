import { createElement } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasJogo,
  jogadores,
  jogos,
  mediasJogador,
  times,
} from '../../modules/dominio/db/schema'
import { calendarioDoRuleset, temporadaDe } from '../../modules/dominio/temporada'
import {
  apitosDoJogador,
  LIMITE_DE_PARTIDAS_DO_HISTORICO,
  telaDoJogador,
} from '../../modules/entrega/estatisticas/jogador'
import type { ApitoDoJogador, TelaJogador } from '../../modules/entrega/estatisticas/jogador'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { NotaPartida } from '../../design-system/componentes'
import { semantico } from '../../design-system/tokens/semantico'
import { diaCurto, diaMes } from '../../components/formato'
import {
  LIMITE_DE_APITOS_DO_JOGADOR,
  recorteDoHistorico,
  resumoDosApitos,
  SOBRANCELHA_STATS,
} from '../(app)/estatisticas/moldura'

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
let temporada: string

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
  temporada = temporadaDe(AGORA, calendarioDoRuleset(ruleset))

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

  tela = (await telaDoJogador(banco.db, alvo, { temporada }))!

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
 *
 * OS DOIS marcadores são afirmados. Enquanto só o de início era, um `ate` que
 * não existia na página (era o caso de "Atualizado", que o rodapé escreve como
 * "Última atualização") devolvia em silêncio o resto do documento: a variável
 * dizia ser uma seção e era a página até o fim. As asserções continuavam
 * passando por acidente de ordem, e o dia em que alguma coisa fosse acrescentada
 * abaixo da última seção elas passariam a afirmar sobre o trecho errado — sem
 * avisar, que é justamente o que este helper existe para evitar.
 */
function trecho(html: string, de: string, ate: string): string {
  const inicio = html.indexOf(de)
  expect(inicio, `o trecho "${de}" existe na tela`).toBeGreaterThan(-1)
  const fim = html.indexOf(ate, inicio + de.length)
  expect(fim, `o trecho "${de}" termina em "${ate}"`).toBeGreaterThan(-1)
  return html.slice(inicio, fim)
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

describe('o recorte de seção que todas as asserções desta suíte usam', () => {
  it('falha quando o marcador de FIM não existe, em vez de devolver o resto da página', () => {
    // Sem esta asserção, um `ate` errado transformava "a seção X" em "de X até o
    // fim do documento" — rodapé incluído — e as asserções passavam por
    // acidente de ordem enquanto X fosse a última seção da tela.
    const pagina =
      '<h2>Números completos</h2><p>médias</p><footer>Última atualização: há 5 min</footer>'
    expect(() => trecho(pagina, 'Números completos', 'Atualizado')).toThrow()
    // Com o marcador que a página REALMENTE escreve, o recorte para no rodapé.
    expect(trecho(pagina, 'Números completos', 'Última atualização')).not.toContain('há 5 min')
  })
})

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

  it('minuto que não chegou não apaga o veredito de uma linha que TRAZ produção', async () => {
    // O mesmo defeito com o sinal trocado: mandar toda linha de minuto nulo
    // para AGUARDANDO_OFICIAL fazia a seção de apitos dizer "aguardando dado
    // oficial" enquanto a tabela jogo a jogo, TRÊS LINHAS ABAIXO NA MESMA TELA,
    // imprimia o box daquela partida. O dado oficial chegou — e a tela o exibe.
    const conferido = historicoDeApitos.find(
      (a) =>
        a.estado === 'CONFERIDO' &&
        a.fez !== null &&
        a.fez > 0 &&
        tela.historico.some((l) => l.jogoId === a.jogoId && l.emCasa !== null),
    )!
    expect(
      conferido,
      'a temporada simulada precisa de um apito conferido com produção',
    ).toBeDefined()
    const conferidos = historicoDeApitos.filter((a) => a.estado === 'CONFERIDO')
    const linha = tela.historico.find((l) => l.jogoId === conferido.jogoId)!
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(ondeBox(conferido.jogoId, alvo))
      .limit(1)

    try {
      // SÓ o minuto sai. Pontos, rebotes e assistências continuam na linha.
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: null })
        .where(ondeBox(conferido.jogoId, alvo))
      const html = await renderizarJogador(alvo)
      const secao = texto(secaoDeApitos(html))

      expect(secao).toContain(`fez ${conferido.fez}`)
      expect(secao).not.toContain('aguardando dado oficial')
      // Nenhum veredito a menos: sumiu o minuto, não a produção.
      expect((secao.match(/fez \d+/g) ?? []).length).toBe(conferidos.length)

      // E o que a tabela imprime para a MESMA partida: o minuto vira "—" (é
      // ele que falta) e o box continua lá, inteiro. É a contradição que o
      // estado não pode criar — duas respostas para o mesmo fato, na mesma tela.
      const tabela = texto(trecho(html, 'Jogo a jogo', 'Números completos'))
      expect(tabela).toContain(
        [
          diaMes(linha.data, fuso),
          `${linha.emCasa ? 'vs' : '@'} ${linha.adversarioSigla}`,
          '—',
          linha.pontos,
          linha.rebotes,
          linha.assistencias,
        ].join(' '),
      )
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: box!.minutos })
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

describe('o auxiliar das seções que leem o histórico', () => {
  it('nomeia a temporada só quando a tela mostra tudo o que há', () => {
    expect(recorteDoHistorico(9, false, 'temporada 2025-26')).toBe('temporada 2025-26')
    expect(recorteDoHistorico(9, false, 'médias de 2025-26')).toBe('médias de 2025-26')
  })

  it('cortado, diz o recorte — o rótulo da temporada seria uma afirmação falsa', () => {
    expect(recorteDoHistorico(25, true, 'temporada 2025-26')).toBe('últimas 25 partidas')
    expect(recorteDoHistorico(25, true, 'médias de 2025-26')).toBe('últimas 25 partidas')
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
      // que não são links. Acento + sublinhado são dois canais — e é só isso
      // que eles fazem.
      const hero = trecho(html, 'TIME ATUAL', 'NOTA · ÚLT. 5')
      const ancoras = hero.match(/<a [^>]*estatisticas\/time[^>]*>/g) ?? []
      expect(ancoras.length).toBe(2)
      for (const marcacao of ancoras) {
        expect(marcacao).toContain('text-decoration:underline')
        expect(marcacao).toContain(`color:${semantico.acento}`)
        // NADA de `inline-block` com padding: o alvo ampliado parava em ~22 px
        // (12 de texto + 8 de padding), abaixo do mínimo de 24 que ele dizia
        // atingir, e o critério 2.5.8 do WCAG 2.2 nem se aplica a link dentro
        // de frase (exceção *Inline*). O que ele cobrava era real: estourava a
        // caixa de linha de 18 px e deixava a segunda linha do apoio mais alta
        // que a primeira.
        expect(marcacao).not.toContain('display:inline-block')
        expect(marcacao).not.toContain('padding')
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

describe('tela do jogador · uma partida, um adversário', () => {
  it('a mesma partida sai com o MESMO mando nas duas seções quando a lista do CJ diverge', async () => {
    // As duas seções ficam a três linhas de distância. Enquanto os apitos
    // liam o time da LISTA e a tabela lia `jogadores.time_id`, a mesma
    // partida saía "vs A" em cima e "@ B" embaixo — e o "@" podia apontar
    // para o PRÓPRIO time do jogador.
    const daTabela = tela.historico.find((l) =>
      historicoDeApitos.some((a) => a.jogoId === l.jogoId),
    )!
    expect(daTabela, 'há partida com apito E box score na mesma tela').toBeDefined()
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, daTabela.jogoId)).limit(1)
    const [original] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.id, alvo))
      .limit(1)
    const naLista = tela.timeNaListaDoCj!.id
    const real = naLista === jogo!.timeCasaId ? jogo!.timeVisitanteId : jogo!.timeCasaId
    const siglaDe = new Map((await banco.db.select().from(times)).map((t) => [t.id, t.sigla]))

    try {
      await banco.db.update(jogadores).set({ timeId: real }).where(eq(jogadores.id, alvo))
      const html = await renderizarJogador(alvo)
      const certo = `${real === jogo!.timeCasaId ? 'vs' : '@'} ${siglaDe.get(
        real === jogo!.timeCasaId ? jogo!.timeVisitanteId : jogo!.timeCasaId,
      )}`

      expect(texto(secaoDeApitos(html))).toContain(certo)
      expect(texto(trecho(html, 'Jogo a jogo', 'Números completos'))).toContain(certo)
      // O mando invertido apontaria para o time DO PRÓPRIO jogador — que não
      // pode aparecer como adversário em lugar nenhum da tela.
      expect(texto(html)).not.toContain(`vs ${siglaDe.get(real)}`)
      expect(texto(html)).not.toContain(`@ ${siglaDe.get(real)}`)
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: original!.timeId })
        .where(eq(jogadores.id, alvo))
    }
  }, 60_000)
})

describe('tela do jogador · a tabela diz o recorte', () => {
  it('acima do limite, "Jogo a jogo" anuncia as últimas N em vez de nomear a temporada', async () => {
    // O hero escreve "N jogos · temporada 2025-26" lendo `medias_jogador` (a
    // temporada inteira) e a tabela para no limite. Numa temporada de 82 jogos
    // o auxiliar afirmava "temporada 2025-26" sobre 25 linhas.
    const doAlvo = await banco.db
      .select({ jogoId: estatisticasJogo.jogoId })
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogadorId, alvo))
    const jaTem = new Set(doAlvo.map((b) => b.jogoId))
    const faltam = LIMITE_DE_PARTIDAS_DO_HISTORICO + 1 - jaTem.size
    const extras = (await banco.db.select().from(jogos))
      .filter((j) => !jaTem.has(j.id))
      .slice(0, faltam)
    expect(extras.length, 'a temporada simulada tem jogos de sobra para semear').toBe(faltam)

    try {
      await banco.db.insert(estatisticasJogo).values(
        extras.map((j) => ({
          jogoId: j.id,
          jogadorId: alvo,
          minutos: '20.00',
          pontos: 8,
          rebotesTotal: 3,
          assistencias: 2,
        })),
      )
      const html = await renderizarJogador(alvo)
      const secao = trecho(html, 'Jogo a jogo', 'Números completos')
      const visivel = texto(secao)

      expect(visivel).toContain(`últimas ${LIMITE_DE_PARTIDAS_DO_HISTORICO}`)
      // Uma linha de corpo por partida do recorte — o <tr> a mais é o cabeçalho.
      expect((secao.match(/<tr/g) ?? []).length - 1).toBe(LIMITE_DE_PARTIDAS_DO_HISTORICO)
      expect(visivel).not.toContain(`temporada ${temporada}`)
      // As médias de "Números completos" nascem da MESMA janela cortada: elas
      // também deixam de ser anunciadas como as da temporada.
      // O marcador de fim é o texto que o rodapé REALMENTE escreve
      // (`UltimaAtualizacao`): "Atualizado" não existe na página, e com ele o
      // recorte devolvia da seção até o fim do documento.
      const medias = texto(trecho(html, 'Números completos', 'Última atualização'))
      expect(medias).toContain(`últimas ${LIMITE_DE_PARTIDAS_DO_HISTORICO}`)
      expect(medias).not.toContain(`médias de ${temporada}`)
    } finally {
      await banco.db.delete(estatisticasJogo).where(
        and(
          eq(estatisticasJogo.jogadorId, alvo),
          inArray(
            estatisticasJogo.jogoId,
            extras.map((j) => j.id),
          ),
        ),
      )
    }
  }, 60_000)

  it('dentro do limite, a seção continua dizendo a temporada — o rótulo do artboard', async () => {
    expect(tela.historicoCortado).toBe(false)
    const visivel = texto(trecho(await renderizarJogador(alvo), 'Jogo a jogo', 'Números completos'))
    expect(visivel).toContain(`temporada ${temporada}`)
    expect(visivel).not.toContain('últimas')
  }, 60_000)

  it('sem linha de médias, o HERO também deixa de nomear a temporada sobre o recorte', async () => {
    // O vizinho da pendência: o recorte foi anunciado nas duas seções que leem
    // o histórico, e o hero — DUAS LINHAS ACIMA — continuava escrevendo
    // "25 jogos · 2025-26". `jogosDisputados` vem de `medias_jogador`; sem essa
    // linha ele cai no tamanho da janela JÁ CORTADA, e aí o apoio do hero
    // afirma a temporada sobre 25 partidas, que é exatamente a afirmação que a
    // tabela deixou de fazer.
    const onde = and(
      eq(mediasJogador.jogadorId, alvo),
      eq(mediasJogador.temporada, temporada),
      eq(mediasJogador.janela, 'TEMPORADA'),
    )
    const [media] = await banco.db.select().from(mediasJogador).where(onde).limit(1)
    expect(media, 'a temporada simulada grava as médias do jogador').toBeDefined()

    const doAlvo = await banco.db
      .select({ jogoId: estatisticasJogo.jogoId })
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogadorId, alvo))
    const jaTem = new Set(doAlvo.map((b) => b.jogoId))
    const faltam = LIMITE_DE_PARTIDAS_DO_HISTORICO + 1 - jaTem.size
    expect(faltam, 'o alvo ainda não passa do limite sozinho').toBeGreaterThan(0)
    const extras = (await banco.db.select().from(jogos))
      .filter((j) => !jaTem.has(j.id))
      .slice(0, faltam)
    expect(extras.length, 'a temporada simulada tem jogos de sobra para semear').toBe(faltam)

    /** Do topo da tela até o rótulo "TIME ATUAL": é onde o apoio do hero mora. */
    const apoioDoHero = (html: string) => texto(trecho(html, SOBRANCELHA_STATS, 'TIME ATUAL'))

    try {
      await banco.db.insert(estatisticasJogo).values(
        extras.map((j) => ({
          jogoId: j.id,
          jogadorId: alvo,
          minutos: '20.00',
          pontos: 8,
          rebotesTotal: 3,
          assistencias: 2,
        })),
      )

      // Com a linha de médias, o número do hero é o da TEMPORADA mesmo com a
      // tabela cortada — e ele continua podendo nomeá-la.
      const comMedias = apoioDoHero(await renderizarJogador(alvo))
      const plural = media!.jogos === 1 ? 'jogo' : 'jogos'
      expect(comMedias).toContain(`${media!.jogos} ${plural} · ${temporada}`)

      await banco.db.delete(mediasJogador).where(onde)
      const semMedias = apoioDoHero(await renderizarJogador(alvo))

      expect(semMedias).toContain(`últimas ${LIMITE_DE_PARTIDAS_DO_HISTORICO} partidas`)
      expect(semMedias).not.toContain(`${LIMITE_DE_PARTIDAS_DO_HISTORICO} jogos`)
      expect(semMedias).not.toContain(temporada)
    } finally {
      await banco.db.insert(mediasJogador).values(media!).onConflictDoNothing()
      await banco.db.delete(estatisticasJogo).where(
        and(
          eq(estatisticasJogo.jogadorId, alvo),
          inArray(
            estatisticasJogo.jogoId,
            extras.map((j) => j.id),
          ),
        ),
      )
    }
  }, 60_000)
})

/**
 * A `Tabela` foi revestida na tela do jogador (condensada, cabeçalho de 10 px,
 * legenda fora da tela) e ela é COMPARTILHADA: o mesmo componente desenha as
 * tabelas das telas de time e de jogo, cujas tasks ainda não rodaram. O que a
 * legenda dizia e nenhuma outra parte da tela dizia — a ORDEM das linhas —
 * precisa continuar visível.
 */
describe('a Tabela condensada nas outras telas da aba', () => {
  /** O HTML sem os `<caption>`, que existem só para o leitor de tela. */
  function semLegendaOculta(html: string): string {
    return html.replace(/<caption[\s\S]*?<\/caption>/g, '')
  }

  it('a ordem das linhas continua visível na tela do time, não só no caption clipado', async () => {
    const [umTime] = await banco.db.select().from(times).limit(1)
    const { default: Time } = await import('../(app)/estatisticas/time/[id]/page')
    const html = renderToStaticMarkup(await Time({ params: Promise.resolve({ id: umTime!.id }) }))

    // A legenda continua NOMEANDO a tabela para quem não vê...
    expect(html).toMatch(/<caption[^>]*clip:rect\(0 0 0 0\)[^>]*>[^<]+<\/caption>/)
    // ...e a ordem, que só ela dizia, está no texto que se lê na tela.
    expect(texto(semLegendaOculta(html))).toContain('da mais recente para a mais antiga')
  }, 60_000)

  it('na tela de jogo, cada tabela continua nomeada por um título de seção visível', async () => {
    const [encerrado] = await banco.db
      .select()
      .from(jogos)
      .where(eq(jogos.status, 'ENCERRADO'))
      .limit(1)
    const { default: Jogo } = await import('../(app)/estatisticas/jogo/[id]/page')
    const html = renderToStaticMarkup(
      await Jogo({
        params: Promise.resolve({ id: encerrado!.id }),
        searchParams: Promise.resolve({}),
      }),
    )

    const tabelas = (html.match(/<table/g) ?? []).length
    expect(tabelas).toBeGreaterThan(0)
    // Toda tabela tem legenda no DOM — nenhuma ficou sem nome acessível.
    expect((html.match(/<caption/g) ?? []).length).toBe(tabelas)
    const visivel = texto(semLegendaOculta(html))
    expect(visivel).toContain('Pontos por quarto')
    expect(visivel).toContain('Box score')
  }, 60_000)
})
