import { createElement } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  classificacao,
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  times,
} from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../modules/dominio/temporada'
import {
  apitosDoJogador,
  LIMITE_DE_PARTIDAS_DO_HISTORICO,
  telaDoJogador,
} from '../../modules/entrega/estatisticas/jogador'
import type { ApitoDoJogador, TelaJogador } from '../../modules/entrega/estatisticas/jogador'
import { telaDoJogo } from '../../modules/entrega/estatisticas/jogo'
import { telaJogosDoDia } from '../../modules/entrega/estatisticas/jogos-do-dia'
import { rotaDoTime } from '../../modules/entrega/estatisticas/rotas'
import { hierarquiaDoTime, telaDaClassificacao } from '../../modules/entrega/estatisticas/time'
import type { LinhaHierarquia } from '../../modules/entrega/estatisticas/time'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { Avatar, NotaPartida } from '../../design-system/componentes'
import { componente } from '../../design-system/tokens/componente'
import { semantico } from '../../design-system/tokens/semantico'
import { diaCurto, diaMes, horaCurta } from '../../components/formato'
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
let calendario: ReturnType<typeof calendarioDoRuleset>
/** O time sob teste, o jogo dele hoje e a hierarquia do CJ em pontos. */
type SujeitoDoTime = { timeId: string; jogoId: string; hierarquia: LinhaHierarquia[] }
let sujeito: SujeitoDoTime

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
  calendario = calendarioDoRuleset(ruleset)
  temporada = temporadaDe(AGORA, calendario)

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

  // O calendário vai junto: a tabela jogo a jogo NOMEIA a temporada, e `jogos`
  // guarda a data, não o rótulo — é o calendário que faz uma virar a outra.
  tela = (await telaDoJogador(banco.db, alvo, { temporada, calendario }))!

  const escolhido = await escolherTime()
  expect(
    escolhido,
    'a temporada simulada precisa de um time jogando hoje com a hierarquia inteira em quadra',
  ).toBeDefined()
  sujeito = escolhido!

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 300_000)

/**
 * O TIME SOB TESTE: um que jogue HOJE — é o jogo do dia que marca desfalque —
 * e cuja hierarquia esteja INTEIRA em quadra. O desfalque é semeado pelo
 * teste; um FORA vindo da simulação faria a asserção do prefixo passar (ou
 * falhar) por acidente, sobre um jogador que o teste não escolheu.
 */
async function escolherTime(): Promise<SujeitoDoTime | undefined> {
  const doDia = await telaJogosDoDia(banco.db, dataDeReferencia(AGORA, fuso), fuso)
  for (const jogo of doDia.jogos) {
    for (const lado of [jogo.casa, jogo.visitante]) {
      const linhas = await hierarquiaDoTime(banco.db, lado.id, 'PONTOS', jogo.id)
      if (linhas.length >= 3 && !linhas.some((l) => l.fora)) {
        return { timeId: lado.id, jogoId: jogo.id, hierarquia: linhas }
      }
    }
  }
  return undefined
}

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizarJogador(id: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogador/[id]/page')
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id }) }))
}

async function renderizarTime(id: string, busca: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/time/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve(busca) }),
  )
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

  it('coincidindo, a sigla repetida não vira um segundo link para o mesmo lugar', async () => {
    // O caso comum: o time do provedor e o da lista do CJ são o mesmo. O apoio
    // do hero escrevia a sigla duas vezes, as duas como link laranja
    // sublinhado para o MESMO href — ruído a poucos pixels de distância, e
    // dois destinos iguais na lista de links do leitor de tela. O artboard
    // escreve as duas em texto comum; aqui a primeira leva ao time.
    expect(tela.perfil.timeId).toBe(tela.timeNaListaDoCj!.id)
    const hero = trecho(await renderizarJogador(alvo), 'TIME ATUAL', 'NOTA · ÚLT. 5')

    expect((hero.match(/<a [^>]*estatisticas\/time[^>]*>/g) ?? []).length).toBe(1)
    // E as DUAS visões continuam escritas — é o rótulo que separa uma da outra.
    const visivel = texto(hero)
    expect(visivel).toMatch(new RegExp(`TIME ATUAL\\s+${tela.perfil.timeSigla}`))
    expect(visivel).toMatch(new RegExp(`NA LISTA DO CJ\\s+${tela.timeNaListaDoCj!.sigla}`))
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

      // E o time DO PRÓPRIO jogador não sai como adversário NAQUELA partida —
      // que é o que o mando invertido faria. O recorte é pela data porque,
      // fora dela, esse mesmo time pode ser adversário de verdade: com o
      // vínculo real fora do jogo o mando cai no time da LISTA, e a lista
      // enfrenta os outros 29 ao longo da temporada.
      const naquelaPartida = [
        ...texto(html).matchAll(
          new RegExp(`(?:^| )${diaMes(daTabela.data, fuso)} ([^]{0,40})`, 'g'),
        ),
      ].map((m) => m[1]!)
      // Duas, no mínimo: a linha do apito e a linha da tabela.
      expect(naquelaPartida.length).toBeGreaterThanOrEqual(2)
      for (const pedaco of naquelaPartida) {
        expect(pedaco).toContain(certo)
        expect(pedaco).not.toContain(siglaDe.get(real)!)
      }
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: original!.timeId })
        .where(eq(jogadores.id, alvo))
    }
  }, 60_000)

  it('com o elenco projetado do CJ, a seção de apitos continua nomeando o adversário', async () => {
    // A NORMA que o CLAUDE.md descreve, não o canto raro: o time real do
    // provedor não é nenhum dos dois lados do jogo do apito, porque o apito
    // nasce de um jogo do time da LISTA. Lendo só `jogadores.time_id`, esta
    // seção inteira virava uma coluna de "—".
    const apito = historicoDeApitos[0]!
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)
    const [original] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.id, alvo))
      .limit(1)
    const naLista = tela.timeNaListaDoCj!
    const todosOsTimes = await banco.db.select().from(times)
    const siglaDe = new Map(todosOsTimes.map((t) => [t.id, t.sigla]))
    const forasteiro = todosOsTimes.find(
      (t) => t.id !== jogo!.timeCasaId && t.id !== jogo!.timeVisitanteId,
    )!
    const emCasa = jogo!.timeCasaId === naLista.id
    const esperado = `${emCasa ? 'vs' : '@'} ${siglaDe.get(
      emCasa ? jogo!.timeVisitanteId : jogo!.timeCasaId,
    )}`

    try {
      await banco.db.update(jogadores).set({ timeId: forasteiro.id }).where(eq(jogadores.id, alvo))
      const secao = texto(secaoDeApitos(await renderizarJogador(alvo)))

      expect(secao).toContain(esperado)
      // E nenhuma linha da seção fica sem confronto.
      expect(secao).not.toContain('—')
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

describe('tela do jogador · a tabela é da temporada que ela nomeia', () => {
  it('não mistura partida de outra temporada por baixo do rótulo da seção', async () => {
    // A consulta do histórico filtrava só por jogador: a tabela atravessava
    // temporadas com o auxiliar dizendo "temporada 2025-26" por cima — e o
    // hero, duas linhas acima, contando `medias_jogador`, que É filtrado por
    // temporada. Dois números para a mesma coisa, com o mesmo rótulo.
    const [casa, visitante] = await banco.db.select().from(times).limit(2)
    // Março de 2025: com `mes_inicio: 10`, é a temporada ANTERIOR à da tela.
    const instante = new Date('2025-03-15T23:00:00.000Z')
    const [antiga] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: instante,
        dataReferencia: '2025-03-15',
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'ENCERRADO',
        placarCasa: 101,
        placarVisitante: 99,
      })
      .returning()

    try {
      await banco.db.insert(estatisticasJogo).values({
        jogoId: antiga!.id,
        jogadorId: alvo,
        minutos: '44.00',
        pontos: 51,
        rebotesTotal: 14,
        assistencias: 11,
      })
      const secao = trecho(await renderizarJogador(alvo), 'Jogo a jogo', 'Números completos')
      const visivel = texto(secao)

      // O rótulo do artboard continua ali — e agora é verdade.
      expect(visivel).toContain(`temporada ${temporada}`)
      expect(visivel).not.toContain(diaMes(instante, fuso))
      // Uma linha de corpo por partida DA TEMPORADA; o <tr> a mais é o cabeçalho.
      expect((secao.match(/<tr/g) ?? []).length - 1).toBe(tela.historico.length)
    } finally {
      await banco.db.delete(estatisticasJogo).where(ondeBox(antiga!.id, alvo))
      await banco.db.delete(jogos).where(eq(jogos.id, antiga!.id))
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
    const html = await renderizarTime(umTime!.id)

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

/**
 * O nível do JOGADOR por extenso, escrito à mão de propósito: se o teste
 * importasse o dicionário da tela, uma troca de rótulo passaria despercebida
 * nos dois lugares ao mesmo tempo.
 */
const NIVEL_ESCRITO: Record<LinhaHierarquia['nivel'], string> = {
  MVP: 'MVP',
  ALL_STAR: 'All Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}

/** O texto de cada `<li>` de um trecho, na ordem em que sai. */
function itensDaLista(html: string): string[] {
  return html
    .split('<li')
    .slice(1)
    .map((pedaco) => texto(pedaco.slice(0, pedaco.indexOf('</li>'))).trim())
}

/** O HTML de cada `<li>` de um trecho — para afirmar sobre cor e borda. */
function marcacaoDaLista(html: string): string[] {
  return html
    .split('<li')
    .slice(1)
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</li>')))
}

/** A seção da hierarquia, do título dela até o da seguinte. */
function secaoDaHierarquia(html: string): string {
  return trecho(html, 'Hierarquia do CJ', 'Box score por jogo')
}

describe('tela do time · a hierarquia do CJ', () => {
  it('lista as posições do CJ em ordem, cada uma com o nível do jogador no atributo', async () => {
    const html = await renderizarTime(sujeito.timeId)
    await gravarConferencia('estatisticas-time', html)
    const linhas = itensDaLista(secaoDaHierarquia(html))
    const esperadas = [...sujeito.hierarquia].sort((a, b) => a.posicao - b.posicao)

    expect(esperadas.length).toBeGreaterThan(2)
    expect(linhas.length).toBe(esperadas.length)
    esperadas.forEach((linha, indice) => {
      expect(linhas[indice]).toContain(String(linha.posicao))
      expect(linhas[indice]).toContain(linha.nome)
      expect(linhas[indice]).toContain(NIVEL_ESCRITO[linha.nivel])
    })
  }, 60_000)

  it('o desfalque do nº 1 vira PREFIXO em destaque, e o rótulo FORA sai só nele', async () => {
    const primeiro = [...sujeito.hierarquia].sort((a, b) => a.posicao - b.posicao)[0]!

    try {
      await banco.db
        .insert(lesoesEscalacao)
        .values({ jogoId: sujeito.jogoId, jogadorId: primeiro.jogadorId, status: 'FORA' })
      const secao = secaoDaHierarquia(await renderizarTime(sujeito.timeId))

      // Um "FORA" só, e ele é o do nº 1: o prefixo é a corrida inicial de
      // ausências, e aqui ela tem tamanho 1.
      expect((texto(secao).match(/FORA/g) ?? []).length).toBe(1)

      const [linhaDoPrimeiro, ...demais] = marcacaoDaLista(secao)
      expect(texto(linhaDoPrimeiro!)).toContain(primeiro.nome)
      expect(linhaDoPrimeiro).toContain(semantico.aoVivoTinta)
      expect(linhaDoPrimeiro).toContain(semantico.aoVivoBorda)
      // Quem está em quadra não recebe moldura de oportunidade.
      for (const linha of demais) expect(linha).not.toContain(semantico.aoVivoTinta)
    } finally {
      await banco.db
        .delete(lesoesEscalacao)
        .where(
          and(
            eq(lesoesEscalacao.jogoId, sujeito.jogoId),
            eq(lesoesEscalacao.jogadorId, primeiro.jogadorId),
          ),
        )
    }
  }, 60_000)

  it('sem desfalque no jogo do dia, nenhuma linha vira oportunidade', async () => {
    const secao = secaoDaHierarquia(await renderizarTime(sujeito.timeId))

    expect(texto(secao)).not.toContain('FORA')
    expect(secao).not.toContain(semantico.aoVivoTinta)
  }, 60_000)

  it('o seletor PTS · REB · AST troca o atributo LIDO, não só o título', async () => {
    const pontos = sujeito.hierarquia
    const rebotes = await hierarquiaDoTime(banco.db, sujeito.timeId, 'REBOTES', sujeito.jogoId)
    // A hierarquia de rebotes tem os mesmos jogadores e níveis DIFERENTES: é o
    // nível que prova qual atributo a tela leu.
    const divergente = pontos.find(
      (p) => rebotes.find((r) => r.jogadorId === p.jogadorId)?.nivel !== p.nivel,
    )
    expect(divergente, 'a lista do CJ classifica o mesmo jogador por atributo').toBeDefined()
    const emRebotes = rebotes.find((r) => r.jogadorId === divergente!.jogadorId)!

    const padrao = await renderizarTime(sujeito.timeId)
    expect(texto(padrao)).toContain('Hierarquia do CJ · PONTOS')
    const linhaEmPontos = itensDaLista(secaoDaHierarquia(padrao)).find((l) =>
      l.includes(divergente!.nome),
    )!
    expect(linhaEmPontos).toContain(NIVEL_ESCRITO[divergente!.nivel])

    const html = await renderizarTime(sujeito.timeId, { atributo: 'REBOTES' })
    expect(texto(html)).toContain('Hierarquia do CJ · REBOTES')
    const linhaEmRebotes = itensDaLista(secaoDaHierarquia(html)).find((l) =>
      l.includes(divergente!.nome),
    )!
    expect(linhaEmRebotes).toContain(NIVEL_ESCRITO[emRebotes.nivel])
    expect(linhaEmRebotes).not.toContain(NIVEL_ESCRITO[divergente!.nivel])

    // Os três atributos ficam a um clique, e o ativo se anuncia — a cor nunca
    // é o único canal.
    const seletor = trecho(html, 'Hierarquia do CJ', '</nav>')
    for (const [curto, valor] of [
      ['PTS', 'PONTOS'],
      ['REB', 'REBOTES'],
      ['AST', 'ASSISTENCIAS'],
    ] as const) {
      expect(seletor).toContain(`?atributo=${valor}`)
      expect(texto(seletor)).toContain(curto)
    }
    expect(seletor).toMatch(/atributo=REBOTES"[^>]*aria-current="page"/)
  }, 60_000)

  it('atributo desconhecido na URL cai em PONTOS, sem quebrar a tela', async () => {
    const html = await renderizarTime(sujeito.timeId, { atributo: 'CHUTES' })
    expect(texto(html)).toContain('Hierarquia do CJ · PONTOS')
  }, 60_000)
})

describe('tela do time · as duas visões de time', () => {
  it('a hierarquia é rotulada "lista do CJ" e o elenco, "time atual"', async () => {
    // A divergência (Giannis no Miami) é intencional; sem rótulo ela é lida
    // como bug — a crítica ao Sofascore que a spec §4.5 cita.
    const html = await renderizarTime(sujeito.timeId)

    expect(texto(secaoDaHierarquia(html))).toContain('lista do CJ')

    const elenco = html.slice(html.indexOf('Elenco'))
    expect(texto(elenco)).toContain('time atual')
    // O elenco é a lista real do provedor: `jogadores.time_id`.
    const doProvedor = await banco.db
      .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
      .from(jogadores)
      .where(eq(jogadores.timeId, sujeito.timeId))
    expect(doProvedor.length).toBeGreaterThan(0)
    for (const jogador of doProvedor) expect(texto(elenco)).toContain(jogador.nome)
  }, 60_000)
})

describe('tela do time · regras de escrita', () => {
  it('nada de probabilidade, de "nível" solto, de meia linha ou de reticências', async () => {
    const visivel = texto(await renderizarTime(sujeito.timeId))
    const minusculo = visivel.toLowerCase()

    expect(minusculo).not.toContain('probabilidade')

    // "nível" é do JOGADOR ou do APITO — nunca a nota da partida, nunca solto.
    for (const ocorrencia of visivel.match(/nível.{0,16}/gi) ?? []) {
      expect(ocorrencia.toLowerCase()).toMatch(/^nível (do jogador|do apito)/)
    }

    // Linha sempre inteira, com "+". Nunca meio ponto.
    expect(visivel).not.toMatch(/\d+,\d+\+/)
    expect(minusculo).not.toContain('meio ponto')

    // Odd, quando aparecer, é sempre FAIXA (1,30–1,70).
    for (const pedaco of visivel.match(/ODD[^·]{0,24}/g) ?? []) {
      expect(pedaco).toMatch(/\d,\d{2}\s*–\s*\d,\d{2}/)
    }

    expect(minusculo).not.toContain('altíssimo valor')
    expect(visivel).not.toContain('...')
    expect(visivel).not.toContain('…')
  }, 60_000)
})

// ===========================================================================
// TASK 5.3 · O ÍNDICE DA ABA E A TELA DE PARTIDA
// ===========================================================================

async function renderizarIndice(busca: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

async function renderizarJogo(jogoId: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
  return renderToStaticMarkup(
    await Pagina({ params: Promise.resolve({ id: jogoId }), searchParams: Promise.resolve({}) }),
  )
}

async function umJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
  const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.status, status)).limit(1)
  expect(jogo, `a temporada simulada tem jogo ${status}`).toBeDefined()
  return jogo!
}

/** O HTML de cada `<tr>` do corpo de toda tabela de um trecho, na ordem. */
function linhasDaTabela(html: string): string[] {
  return html
    .split('<tbody>')
    .slice(1)
    .flatMap((corpo) => corpo.slice(0, corpo.indexOf('</tbody>')).split('<tr').slice(1))
    .map((pedaco) => pedaco.slice(0, pedaco.indexOf('</tr>')))
}

/** O HTML de cada `<th>` de um trecho. */
function cabecalhosDaTabela(html: string): string[] {
  return html.match(/<th\b[^>]*>[\s\S]*?<\/th>/g) ?? []
}

/** A cor com que a tela escreveu aquele número — `color` fecha o estilo. */
function corDe(html: string, numero: number): string | undefined {
  return html.match(new RegExp(`color:([^"]+)">${numero}<`))?.[1]
}

/** "100,0" — o aproveitamento como a tela o escreve (a unidade fica no cabeçalho). */
function aproveitamentoEscrito(v: number | null): string {
  return v === null ? '—' : (v * 100).toFixed(1).replace('.', ',')
}

describe('índice da aba · os jogos do dia como lista', () => {
  it('uma linha por jogo, visitante @ mandante, cada uma com o seu status', async () => {
    const doDia = await telaJogosDoDia(banco.db, dataDeReferencia(AGORA, fuso), fuso)
    expect(doDia.jogos.length).toBeGreaterThan(0)

    const html = await renderizarIndice()
    await gravarConferencia('estatisticas-indice', html)
    const secao = trecho(html, 'Jogos do dia', 'Classificação')
    const linhas = itensDaLista(secao)
    expect(linhas.length).toBe(doDia.jogos.length)

    doDia.jogos.forEach((jogo, indice) => {
      const linha = linhas[indice]!
      // A ordem da transmissão, a mesma do Fire Live: visitante, depois mandante.
      expect(linha.indexOf(jogo.visitante.sigla)).toBeGreaterThan(-1)
      expect(linha.indexOf(jogo.visitante.sigla)).toBeLessThan(linha.lastIndexOf(jogo.casa.sigla))

      if (jogo.status === 'AGENDADO') {
        expect(linha).toContain(horaCurta(jogo.dataHoraUtc, fuso))
      }
      if (jogo.status === 'AO_VIVO') {
        expect(linha).toContain(`${jogo.quartoAtual ?? 1}º Q · AO VIVO`)
      }
      if (jogo.status === 'ENCERRADO') {
        expect(linha).toContain('ENCERRADO')
      }
      if (jogo.casa.placar !== null && jogo.visitante.placar !== null) {
        expect(linha).toContain(String(jogo.casa.placar))
        expect(linha).toContain(String(jogo.visitante.placar))
      }
    })
  }, 60_000)

  it('o jogo em andamento traz o parcial e o ponto do ao vivo, sem declarar vencedor', async () => {
    const doDia = await telaJogosDoDia(banco.db, dataDeReferencia(AGORA, fuso), fuso)
    const aoVivo = doDia.jogos.find((j) => j.status === 'AO_VIVO')
    expect(aoVivo, 'a temporada simulada tem um jogo em andamento hoje').toBeDefined()
    expect(aoVivo!.casa.placar).not.toBeNull()

    const secao = trecho(await renderizarIndice(), 'Jogos do dia', 'Classificação')

    // O ponto vermelho ao lado do texto: cor nunca é canal único, então o
    // "AO VIVO" está escrito do lado dele.
    expect(secao).toContain(`background:${semantico.vivoSelo}`)
    // NENHUM vencedor: no placar final o perdedor apaga (texto55); no jogo em
    // andamento os dois números têm o mesmo peso — a sentença é do fim do jogo.
    expect(corDe(secao, aoVivo!.casa.placar!)).toBe(semantico.texto100)
    expect(corDe(secao, aoVivo!.visitante.placar!)).toBe(semantico.texto100)
  }, 60_000)

  it('num dia já encerrado a linha traz o placar final e o status escrito', async () => {
    const encerrado = await umJogo('ENCERRADO')
    const secao = trecho(
      await renderizarIndice({ data: encerrado.dataReferencia }),
      'Jogos de',
      'Classificação',
    )
    const visivel = texto(secao)

    expect(visivel).toContain('ENCERRADO')
    expect(visivel).toContain(String(encerrado.placarCasa))
    expect(visivel).toContain(String(encerrado.placarVisitante))
  }, 60_000)
})

describe('índice da aba · a classificação como tabela', () => {
  /** Os rótulos que a tabela ESCREVE — a grade de caixinhas não dizia nenhum. */
  const CABECALHOS = ['POS', 'TIME', 'V–D', '%', 'SEQ', 'ÚLT. 5', 'TRILHO']

  it('é uma <table> com posição, sigla, V–D, %, sequência e os últimos 5 em pontinhos', async () => {
    const tabela = await telaDaClassificacao(banco.db, temporada)
    expect(tabela.linhas.length).toBeGreaterThan(10)

    const html = await renderizarIndice()
    const secao = trecho(html, 'Classificação', 'Última atualização')
    expect(secao).toContain('<table')
    // A grade de caixinhas some: a tabela é a única forma da classificação.
    const cabecalho = texto(cabecalhosDaTabela(secao).join(' '))
    for (const rotulo of CABECALHOS) expect(cabecalho).toContain(rotulo)

    const linhas = linhasDaTabela(secao)
    expect(linhas.length).toBe(tabela.linhas.length)

    tabela.linhas.forEach((time, indice) => {
      const linha = linhas[indice]!
      const visivel = texto(linha)
      expect(visivel).toContain(time.sigla)
      expect(visivel).toContain(`${time.vitorias}–${time.derrotas}`)
      expect(visivel).toContain(aproveitamentoEscrito(time.aproveitamento))
      if (time.sequencia !== null) expect(visivel).toContain(time.sequencia)
      // A sigla continua sendo a porta do time — era o que a grade dava.
      expect(linha).toContain(`href="${rotaDoTime(time.timeId)}"`)
      // Os pontinhos são NOMEADOS um a um: a cor não é o único canal.
      const nomeados = linha.match(/aria-label="(vitória|derrota)"/g) ?? []
      expect(nomeados.length).toBe(time.forma.length)
    })
  }, 60_000)

  it('as posições 1 a 6 dizem playoff e as 7 a 10 dizem play-in, por escrito', async () => {
    const tabela = await telaDaClassificacao(banco.db, temporada)
    const secao = trecho(await renderizarIndice(), 'Classificação', 'Última atualização')
    const linhas = linhasDaTabela(secao)

    tabela.linhas.forEach((time, indice) => {
      const visivel = texto(linhas[indice]!)
      const esperado =
        time.posicao === null ? '—' : time.posicao <= 6 ? 'playoff' : time.posicao <= 10 ? 'play-in' : '—'
      expect(visivel, `posição ${time.posicao}`).toContain(esperado)
    })

    // O trilho é ESCRITO, não uma cor de fundo: seis vagas de playoff e quatro
    // de play-in por conferência, e a tela diz qual é qual em cada linha.
    const visivel = texto(secao)
    expect((visivel.match(/playoff/g) ?? []).length).toBe(6)
    expect((visivel.match(/play-in/g) ?? []).length).toBe(4)
  }, 60_000)

  it('time sem partida encerrada mostra "—" nos últimos 5, em vez de inventar resultado', async () => {
    const [novo] = await banco.db
      .insert(times)
      .values({ sigla: 'ZZZ', nome: 'Clube sem partida' })
      .returning()
    await banco.db.insert(classificacao).values({
      temporada,
      timeId: novo!.id,
      vitorias: 0,
      derrotas: 0,
      posicao: 99,
      capturadoEm: new Date(0),
    })

    try {
      const secao = trecho(await renderizarIndice(), 'Classificação', 'Última atualização')
      const linha = linhasDaTabela(secao).find((l) => l.includes(novo!.sigla))!
      expect(linha, 'o time entrou na classificação').toBeDefined()
      expect(linha).not.toContain('aria-label="vitória"')
      expect(linha).not.toContain('aria-label="derrota"')
      expect(texto(linha)).toContain('—')
    } finally {
      await banco.db.delete(classificacao).where(eq(classificacao.timeId, novo!.id))
      await banco.db.delete(times).where(eq(times.id, novo!.id))
    }
  }, 60_000)
})

describe('tela de partida · o 1º quarto em destaque', () => {
  it('a célula do 1º Q veste o quente, e a tela diz uma vez o que o Fire Live observa', async () => {
    const jogo = await umJogo('ENCERRADO')
    const html = await renderizarJogo(jogo.id)
    await gravarConferencia('estatisticas-partida', html)
    const secao = trecho(html, 'Pontos por quarto', 'Líderes da partida')
    const quente = componente.contextoQuente.faixaFundo

    const cabecalhos = cabecalhosDaTabela(secao)
    const doPrimeiro = cabecalhos.find((c) => texto(c).trim().startsWith('1º'))!
    expect(doPrimeiro, 'a coluna do 1º quarto existe').toBeDefined()
    expect(doPrimeiro).toContain(quente)
    expect(doPrimeiro).toContain(componente.contextoQuente.borda)
    for (const outro of cabecalhos.filter((c) => c !== doPrimeiro)) {
      expect(outro).not.toContain(quente)
    }

    // A coluna inteira, não só o cabeçalho: a célula de cada time é a que o
    // Fire Live lê.
    const linhas = linhasDaTabela(secao)
    expect(linhas.length).toBe(2)
    for (const linha of linhas) {
      const celulas = linha.split('<td').slice(1)
      expect(celulas[1]).toContain(quente)
      expect(celulas[2]).not.toContain(quente)
    }

    // O rótulo explica o destaque UMA vez — repetido por célula viraria ruído.
    expect((texto(html).match(/1º Q · o que o Fire Live observa/g) ?? []).length).toBe(1)
  }, 60_000)
})

describe('tela de partida · o rosto no box score', () => {
  it('cada linha do box score traz o rosto, e nenhum deles veste anel de apito', async () => {
    const jogo = await umJogo('ENCERRADO')
    const tela = (await telaDoJogo(banco.db, jogo.id, {}))!
    const html = await renderizarJogo(jogo.id)
    const secao = trecho(html, `Box score · ${tela.casa.nome}`, `Box score · ${tela.visitante.nome}`)

    expect(tela.casa.boxScore.length).toBeGreaterThan(0)
    const primeiro = tela.casa.boxScore[0]!
    expect(secao).toContain(
      renderToStaticMarkup(
        createElement(Avatar, {
          nome: primeiro.nome,
          fotoUrl: primeiro.fotoUrl,
          timeSigla: tela.casa.sigla,
          nivelApito: null,
          tamanho: 26,
          raio: 8,
        }),
      ),
    )
    // Um rosto por linha — nem mais, nem menos.
    expect((secao.match(/width:26px;height:26px/g) ?? []).length).toBe(tela.casa.boxScore.length)
    // A aba é dado canônico: nada aqui carrega nível do apito.
    expect(secao).not.toContain('Nível do apito')
  }, 60_000)
})

describe('tela de partida · os desfalques com a hierarquia do CJ', () => {
  it('o desfalque que está na lista do CJ sai com a posição e o nível dela', async () => {
    // A seção só existe antes do fim do jogo — e o desfalque é por JOGO.
    const doDia = await telaJogosDoDia(banco.db, dataDeReferencia(AGORA, fuso), fuso)
    let escolhido: { jogoId: string; timeId: string; linha: LinhaHierarquia } | undefined
    for (const jogo of doDia.jogos) {
      if (jogo.status === 'ENCERRADO') continue
      for (const lado of [jogo.casa, jogo.visitante]) {
        const hierarquia = await hierarquiaDoTime(banco.db, lado.id, 'PONTOS', jogo.id)
        // O box score e os desfalques leem `jogadores.time_id` (o time REAL);
        // a hierarquia lê a lista do CJ. Só serve quem os dois reconhecem.
        for (const linha of hierarquia) {
          const [jogador] = await banco.db
            .select()
            .from(jogadores)
            .where(eq(jogadores.id, linha.jogadorId))
            .limit(1)
          if (jogador?.timeId === lado.id) {
            escolhido = { jogoId: jogo.id, timeId: lado.id, linha }
            break
          }
        }
        if (escolhido) break
      }
      if (escolhido) break
    }
    expect(escolhido, 'há jogo por vir hoje com a lista do CJ no elenco real').toBeDefined()
    const [semClassificacao] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Atleta sem classificação', timeId: escolhido!.timeId })
      .returning()

    try {
      await banco.db.insert(lesoesEscalacao).values([
        { jogoId: escolhido!.jogoId, jogadorId: escolhido!.linha.jogadorId, status: 'FORA' },
        { jogoId: escolhido!.jogoId, jogadorId: semClassificacao!.id, status: 'FORA' },
      ])
      const secao = trecho(await renderizarJogo(escolhido!.jogoId), 'Desfalques', 'Última atualização')
      const visivel = texto(secao)

      expect(visivel).toContain(escolhido!.linha.nome)
      expect(visivel).toContain(`nº ${escolhido!.linha.posicao}`)
      expect(visivel).toContain(NIVEL_ESCRITO[escolhido!.linha.nivel])
      // A marcação é da lista do CJ, não do elenco real: as duas visões
      // divergem de propósito, e sem rótulo a divergência é lida como bug.
      expect(visivel.toLowerCase()).toContain('lista do cj')
      // A temporada já pode conter outros desfalques com classificação. O
      // contrato é por jogador: uma anotação no classificado, nenhuma no outro.
      const linhas = itensDaLista(secao)
      const classificado = linhas.find((linha) => texto(linha).includes(escolhido!.linha.nome))!
      expect((texto(classificado).match(/nº \d+/g) ?? []).length).toBe(1)
      const semClasse = linhas.find((linha) => texto(linha).includes(semClassificacao!.nomeCompleto))!
      expect(semClasse).toBeDefined()
      expect(texto(semClasse)).not.toMatch(/nº \d+/)
    } finally {
      await banco.db
        .delete(lesoesEscalacao)
        .where(
          and(
            eq(lesoesEscalacao.jogoId, escolhido!.jogoId),
            inArray(lesoesEscalacao.jogadorId, [escolhido!.linha.jogadorId, semClassificacao!.id]),
          ),
        )
      await banco.db.delete(jogadores).where(eq(jogadores.id, semClassificacao!.id))
    }
  }, 60_000)
})

describe('índice e tela de partida · regras de escrita', () => {
  it('nada de probabilidade, de "nível" solto, de meia linha, de odd fora da faixa ou de reticências', async () => {
    const jogo = await umJogo('ENCERRADO')
    const telas: [string, string][] = [
      ['índice', await renderizarIndice()],
      ['partida', await renderizarJogo(jogo.id)],
    ]

    for (const [nome, html] of telas) {
      const visivel = texto(html)
      const minusculo = visivel.toLowerCase()

      // O % é nota de confiança, nunca probabilidade — e a aba nem exibe nota
      // de confiança: o "%" daqui é TAXA (aproveitamento da campanha).
      expect(minusculo, nome).not.toContain('probabilidade')
      expect(minusculo, nome).not.toContain('confiança')

      // "nível" é do JOGADOR ou do APITO. A nota da partida nunca é nível.
      for (const ocorrencia of visivel.match(/nível.{0,16}/gi) ?? []) {
        expect(ocorrencia.toLowerCase(), nome).toMatch(/^nível (do jogador|do apito)/)
      }

      // Linha sempre inteira, com "+". Nunca meio ponto.
      expect(visivel, nome).not.toMatch(/\d+,\d+\+/)
      expect(minusculo, nome).not.toContain('meio ponto')

      // Odd, quando aparecer, é sempre FAIXA (1,30–1,70).
      for (const pedaco of visivel.match(/ODD[^·]{0,24}/g) ?? []) {
        expect(pedaco, nome).toMatch(/\d,\d{2}\s*–\s*\d,\d{2}/)
      }

      expect(minusculo, nome).not.toContain('altíssimo valor')
      expect(visivel, nome).not.toContain('...')
      expect(visivel, nome).not.toContain('…')
    }
  }, 60_000)
})
