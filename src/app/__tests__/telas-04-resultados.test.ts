import { gravarConferencia, prepararFotosConferencia } from './conferencia'
import { and, eq, inArray } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { dataHora } from '../../components/formato'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import {
  recapDaNoite,
  taxaDaTemporada,
  ultimaRodadaConferida,
} from '../../modules/entrega/resultados'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'

/**
 * RESULTADOS POR RODADA — o recap da noite (spec 04, §4.4).
 *
 * Mesmo arnês de `telas-04-detalhe.test.ts`: o componente de servidor de
 * verdade sobre o banco de verdade semeado por `simularAte`; só sessão e
 * direito de acesso são simulados. NENHUMA asserção nomeia jogador, time ou
 * horário — o sujeito é lido do banco e a asserção é sobre ele.
 *
 * A regra de escrita NOVA desta tela também é testada aqui: a taxa da noite e
 * a da temporada nunca dividem elemento com um % de confiança de apito.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)
const ONTEM = somarDias(HOJE, -1)
/** Um dia antes da janela semeada: existe no calendário, não tem lista. */
const SEM_LISTA = somarDias(HOJE, -40)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@teste.com',
  }),
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
const textoDaTela = (html: string) => semEntidades(html.replace(/<[^>]+>/g, ''))
/** Idem, com um espaço no lugar de cada tag — para casar rótulo + número. */
const textoSeparado = (html: string) => semEntidades(html.replace(/<[^>]+>/g, ' '))

/** O pedaço da tela entre duas marcas. */
function trecho(html: string, de: string, ate: string): string {
  const inicio = html.indexOf(de)
  const fim = html.indexOf(ate, inicio + 1)
  expect(inicio, `marca "${de}" ausente`).toBeGreaterThan(-1)
  expect(fim, `marca "${ate}" ausente depois de "${de}"`).toBeGreaterThan(inicio)
  return html.slice(inicio, fim)
}

/** Um `<article>` por card de entrada — a peça que fecha o ciclo. */
const cardsDaTela = (html: string) =>
  [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map((m) => m[0])

async function renderizar(data: string): Promise<string> {
  const { default: Pagina } = await import('../(app)/resultados/[data]/page')
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ data }) }))
}

/** O destino do `redirect()` que a tela lançou. */
async function destinoDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    expect(digest, 'a tela não redirecionou').toContain('NEXT_REDIRECT')
    return digest.split(';')[2] ?? ''
  }
  throw new Error('a tela renderizou em vez de redirecionar')
}

/** Percentual inteiro, do jeito que o bloco da noite escreve. */
const pct = (taxa: number) => `${Math.round(taxa * 100)}%`

describe('Resultados · o índice da rodada', () => {
  it('/resultados sozinho manda para a ÚLTIMA rodada com conferência — a noite que terminou, não a de hoje', async () => {
    const { default: Pagina } = await import('../(app)/resultados/page')
    const ultima = await ultimaRodadaConferida(banco.db, HOJE)
    // O fixture: hoje está em curso, ontem terminou.
    expect(ultima).toBe(ONTEM)
    expect(await destinoDoRedirect(Pagina())).toBe(`/resultados/${ONTEM}`)
  }, 60_000)

  it('data que não é uma data volta para hoje, em vez de quebrar', async () => {
    const { default: Pagina } = await import('../(app)/resultados/[data]/page')
    expect(await destinoDoRedirect(Pagina({ params: Promise.resolve({ data: 'ontem' }) }))).toBe(
      `/resultados/${HOJE}`,
    )
    // Formato certo, dia que não existe no calendário.
    expect(
      await destinoDoRedirect(Pagina({ params: Promise.resolve({ data: '2026-02-31' }) })),
    ).toBe(`/resultados/${HOJE}`)
  }, 60_000)

  it('o rótulo é o da RODADA, com as setas de ontem e de amanhã', async () => {
    const html = await renderizar(ONTEM)
    await gravarConferencia('identidade-04-resultados', html)
    const [ano, mes, dia] = ONTEM.split('-').map(Number)
    const semana = new Date(Date.UTC(ano!, mes! - 1, dia!)).toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
      weekday: 'long',
    })
    expect(html).toContain(`${semana[0]!.toUpperCase()}${semana.slice(1)}, ${dia}/${mes}`)
    expect(html).toContain('RESULTADOS · RODADA')
    // A anterior sempre existe; a próxima também, porque ONTEM não é hoje.
    expect(html).toContain(`href="/resultados/${somarDias(ONTEM, -1)}"`)
    expect(html).toContain(`href="/resultados/${HOJE}"`)
    // E o seletor divide a casa com a Lista Secreta.
    expect(html).toContain('HOJE')
    expect(html).toContain('RESULTADOS')
  }, 60_000)

  it('na rodada de hoje a seta de amanhã fica desabilitada, sem href', async () => {
    const html = await renderizar(HOJE)
    expect(html).not.toContain(`href="/resultados/${somarDias(HOJE, 1)}"`)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain(`href="/resultados/${somarDias(HOJE, -1)}"`)
  }, 60_000)

  it('dia sem lista publicada não é tela em branco — e as setas continuam funcionando', async () => {
    const html = await renderizar(SEM_LISTA)
    expect(html).toContain('Sem lista publicada neste dia')
    expect(html).toContain(`href="/resultados/${somarDias(SEM_LISTA, -1)}"`)
    expect(html).toContain(`href="/resultados/${somarDias(SEM_LISTA, 1)}"`)
    expect(cardsDaTela(html)).toHaveLength(0)
  }, 60_000)
})

describe('Resultados · o recap da noite', () => {
  it('o cabeçalho da noite traz os três números de recapDaNoite — APITOS é o que está em tela', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)

    expect(recap.noiteEncerrada).toBe(true)
    expect(recap.conferidos).toBeGreaterThan(0)
    // O número grande é o de cards em tela: "APITOS 0" em cima de 29 cards
    // era a leitura que a revisão derrubou. A taxa é sobre os CONFERIDOS (DNP
    // é neutro), e quando a base difere do que está em tela ela vem escrita.
    const bloco = textoSeparado(trecho(html, 'APITOS', 'TEMPORADA'))
    expect([...bloco.matchAll(/\d+%?/g)].map((m) => m[0])).toEqual([
      String(recap.publicados),
      String(recap.bateram),
      pct(recap.taxa!),
      ...(recap.conferidos === recap.publicados
        ? []
        : [String(recap.bateram), String(recap.conferidos)]),
    ])
    expect(cardsDaTela(html)).toHaveLength(recap.publicados)
    expect(bloco).toContain('BATERAM')
    expect(bloco).toContain('NA NOITE')
    expect(bloco).not.toContain('aguardando o fim da noite')
  }, 60_000)

  it('com um DNP na noite, a base da taxa fica escrita ao lado dela', async () => {
    const { estatisticasJogo } = await import('../../modules/dominio/db/schema')
    const antes = await recapDaNoite(banco.db, ONTEM)
    const alvo = antes.porJogo.flatMap((g) => g.cards).find((c) => c.fez !== null)!
    const onde = and(
      eq(estatisticasJogo.jogoId, alvo.jogoId),
      eq(estatisticasJogo.jogadorId, alvo.jogadorId),
    )
    const [linha] = await banco.db.select().from(estatisticasJogo).where(onde)

    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const recap = await recapDaNoite(banco.db, ONTEM)
      const html = await renderizar(ONTEM)
      expect(recap.conferidos).toBeLessThan(recap.publicados)
      const bloco = textoSeparado(trecho(html, 'APITOS', 'TEMPORADA'))
      expect(bloco).toContain(`${recap.bateram} de ${recap.conferidos}`)
      expect(bloco).toContain(pct(recap.taxa!))
      expect(cardsDaTela(html)).toHaveLength(recap.publicados)
    } finally {
      await banco.db.insert(estatisticasJogo).values(linha!)
    }
  }, 60_000)

  it('a faixa da temporada mostra taxaDaTemporada, com quantas rodadas e quantos apitos', async () => {
    // Janela larga de propósito: a temporada semeada cabe inteira nela, então
    // o número não depende de o teste repetir a conta de janela da tela.
    const temporada = await taxaDaTemporada(banco.db, HOJE, 400)
    const html = await renderizar(ONTEM)
    const texto = textoSeparado(html)

    expect(temporada.conferidos).toBeGreaterThan(0)
    const taxa = ((temporada.acertos / temporada.conferidos) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
    expect(texto).toContain(`TEMPORADA · ${temporada.rodadas} RODADAS`)
    expect(texto).toContain(`${taxa}%`)
    expect(texto).toContain(
      `${temporada.acertos.toLocaleString('pt-BR')} de ${temporada.conferidos.toLocaleString('pt-BR')}`,
    )
  }, 60_000)

  it('o apito da noite é o de recapDaNoite, com o que ele fez e a linha mais baixa', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const alvo = recap.apitoDaNoite!
    const html = await renderizar(ONTEM)
    const bloco = textoSeparado(trecho(html, 'APITO DA NOITE', 'Pontos por quarto'))

    expect(alvo).toBeDefined()
    expect(bloco).toContain(alvo.nome)
    expect(bloco).toContain(String(alvo.fez))
    expect(bloco).toContain(`${Math.min(...alvo.linhas.map((l) => l.linha))}+`)
    expect(bloco).toContain(alvo.timeSigla)
  }, 60_000)

  it('um cabeçalho por jogo, com o placar final e a quebra por quarto', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)

    expect(recap.porJogo.length).toBeGreaterThan(1)
    expect(html.match(/aria-label="Pontos por quarto/g) ?? []).toHaveLength(recap.porJogo.length)
    for (const { jogo } of recap.porJogo) {
      expect(html).toContain(`>${jogo.placarVisitante}<`)
      expect(html).toContain(`>${jogo.placarCasa}<`)
      expect(html).toContain(jogo.quartosVisitante.join(' · '))
      expect(html).toContain(jogo.quartosCasa.join(' · '))
    }
  }, 60_000)

  it('os greens do Fire Live seguem em bloco próprio, com o marco batido', async () => {
    // Green só nasce no dia em que o Fire Live rodou — a rodada de hoje.
    const { greensDoDia } = await import('../../modules/entrega/resultados')
    const greens = await greensDoDia(banco.db, HOJE)
    const html = await renderizar(HOJE)

    expect(greens.length).toBeGreaterThan(0)
    const texto = textoSeparado(html)
    expect(texto).toContain('GREENS DO FIRE LIVE')
    const unidade = { PONTOS: 'pontos', REBOTES: 'rebotes', ASSISTENCIAS: 'assistências' }
    for (const g of greens) {
      expect(texto).toContain(g.nome)
      // O valor com a unidade e o quarto; o marco nomeado como marco. Nunca
      // "Pontos 25": atributo + número, nesta tela, é a gramática da LINHA.
      expect(texto).toContain(`${g.valor} ${unidade[g.atributo]} no 1º quarto`)
      expect(texto).toContain(`marco ${g.marco}`)
    }
    expect(texto).not.toMatch(/(Pontos|Rebotes|Assistências) \d+\b(?!\+)/)
  }, 60_000)
})

describe('Resultados · o card conferido fecha o ciclo', () => {
  it('um card por apitado, com badge FT, "fez N" e o ✓/✗ escrito', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const cards = cardsDaTela(html)
    const todos = recap.porJogo.flatMap((g) => g.cards)

    expect(todos.length).toBeGreaterThan(0)
    expect(cards).toHaveLength(todos.length)
    expect(html.match(/>FT</g) ?? []).toHaveLength(todos.length)

    const texto = textoDaTela(html)
    for (const card of todos) expect(texto).toContain(`fez ${card.fez}`)
    // ✓ e ✗ com nome acessível: a cor nunca é o único canal.
    expect(html.match(/aria-label="Bateu a linha"/g) ?? []).toHaveLength(
      todos.filter((c) => c.bateuLinhaMaisBaixa === true).length,
    )
    expect(html.match(/aria-label="Não bateu a linha"/g) ?? []).toHaveLength(
      todos.filter((c) => c.bateuLinhaMaisBaixa === false).length,
    )
  }, 60_000)

  it('a barrinha da rodada entra no fim da fileira, destacada — uma por card conferido', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const feed = await lerFeed(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const jogaram = recap.porJogo.flatMap((g) => g.cards).filter((c) => c.fez !== null)

    expect(feed).not.toBeNull()
    expect(jogaram.length).toBeGreaterThan(0)
    expect(html.match(/outline:2px/g) ?? []).toHaveLength(jogaram.length)
    expect(html).toContain('ÚLT. 5 NA LINHA')
    expect(html).toContain('a última é a desta rodada')
    // O valor da barrinha nova é o que ele fez.
    for (const card of jogaram) expect(html).toContain(`>${card.fez}<`)
  }, 60_000)

  it('quem não entrou em quadra é NEUTRO: badge DNP, sem ✓ e sem ✗', async () => {
    const { estatisticasJogo } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    // Um jogo com DOIS apitados diferentes: o jogo segue conferido (o outro
    // tem box) e só este jogador vira DNP — que é o caso que a tela precisa
    // distinguir de "o box do jogo ainda não chegou".
    const grupo = recap.porJogo.find((g) => new Set(g.cards.map((c) => c.jogadorId)).size > 1)!
    const alvo = grupo.cards[0]!
    const doAlvo = grupo.cards.filter((c) => c.jogadorId === alvo.jogadorId)
    const onde = and(
      eq(estatisticasJogo.jogoId, alvo.jogoId),
      eq(estatisticasJogo.jogadorId, alvo.jogadorId),
    )
    const [linha] = await banco.db.select().from(estatisticasJogo).where(onde)

    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const html = await renderizar(ONTEM)
      expect(textoDaTela(html)).toContain('não jogou · neutro')
      expect(html.match(/>DNP</g) ?? []).toHaveLength(doAlvo.length)
      // O card recua sem sumir, e não ganha barrinha nova.
      expect(html).toContain('opacity:0.75')
      expect(html.match(/outline:2px/g) ?? []).toHaveLength(
        recap.porJogo.flatMap((g) => g.cards).filter((c) => c.fez !== null).length - doAlvo.length,
      )
    } finally {
      await banco.db.insert(estatisticasJogo).values(linha!)
    }
  }, 60_000)

  it('jogo encerrado SEM box não inventa veredito: mostra o carimbo do dado oficial', async () => {
    const { estatisticasJogo } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo = recap.porJogo[0]!
    const onde = eq(estatisticasJogo.jogoId, grupo.jogo.jogoId)
    const linhas = await banco.db.select().from(estatisticasJogo).where(onde)

    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const html = await renderizar(ONTEM)
      const texto = textoDaTela(html)
      expect(texto.toLowerCase()).toContain('aguardando dado oficial')
      // Nem ✓, nem ✗, nem DNP para quem ninguém conferiu ainda.
      for (const card of grupo.cards) expect(texto).not.toContain(`fez ${card.fez}`)
      expect(texto).not.toContain('não jogou · neutro')
      // O carimbo é a data e a hora da última atualização, no fuso da rodada.
      expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    } finally {
      await banco.db.insert(estatisticasJogo).values(linhas)
    }
  }, 60_000)

  it('a rodada AINDA EM CURSO não vira veredito: card no estado do ciclo, sem "fez"', async () => {
    // A armadilha do §5.1: `conferirRodadas` enxerga o box PARCIAL do 1º quarto,
    // e sem o estado do ciclo a tela diria "não jogou" para quem entra às 22h.
    const html = await renderizar(HOJE)
    const texto = textoDaTela(html)
    expect(texto).not.toContain('não jogou · neutro')
    expect(texto).not.toMatch(/fez \d/)
    expect(html).toContain('>PRÉ<')
  }, 60_000)
})

describe('Resultados · regras de escrita', () => {
  it('a taxa nunca divide elemento com o % de confiança de um apito', async () => {
    const html = await renderizar(ONTEM)
    const texto = textoDaTela(html)

    // Os rótulos são estes; "acerto do apito X%" não existe em lugar nenhum.
    expect(texto).toContain('BATERAM')
    expect(texto).toContain('NA NOITE')
    expect(texto).toContain('TEMPORADA')
    expect(texto.toLowerCase()).not.toContain('acerto do apito')
    // Nenhum card conferido escreve o % ao lado do "fez N".
    for (const card of cardsDaTela(html)) expect(textoDaTela(card)).not.toContain('%')
    // E o único percentual com casa decimal da tela é o da temporada.
    const decimais = [...texto.matchAll(/\d+,\d+\s?%/g)].map((m) => m[0])
    expect(decimais).toHaveLength(1)
    expect(textoSeparado(html)).toContain(`TEMPORADA · `)
  }, 60_000)

  it('respeita as regras de escrita da identidade', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const texto = textoDaTela(html)

    expect(texto.toLowerCase()).not.toContain('probabilidade')
    // A nota da partida não entra em tela de estratégia — e nunca se chama nível.
    expect(texto).not.toMatch(/\bNOTA\b/)
    expect(texto.toLowerCase()).not.toContain('nota da partida')
    expect(texto.toLowerCase()).not.toContain('nível da partida')
    // Linha SEMPRE inteira, com "+".
    expect(texto).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
    expect(texto.toLowerCase()).not.toContain('meio ponto')
    const alvo = recap.apitoDaNoite!
    expect(texto).toContain(`${Math.min(...alvo.linhas.map((l) => l.linha))}+`)
    // Odd nunca é um número solto passando por certeza: ou é FAIXA entre
    // casas, ou é a MÉDIA entre casas, escrita com o rótulo. A rodada em
    // curso entra na conta porque é lá que o rodapé ainda mostra odd — no
    // conferido o veredito toma o lugar dela.
    const comOdd = `${textoSeparado(html)}\n${textoSeparado(await renderizar(HOJE))}`
    expect(comOdd).toMatch(/ODD (MÉDIA \d+,\d\d|\d+,\d\d–\d+,\d\d)/)
    expect(comOdd).not.toMatch(/ODD (?!MÉDIA)\d+,\d\d(?!–)/)
    expect(texto).not.toContain('ALTÍSSIMO VALOR')
    expect(texto).not.toContain('...')
    expect(texto).not.toContain('…')
  }, 60_000)
})

/**
 * O QUE A TELA NÃO PODE AFIRMAR (revisão adversarial da 04, rodada 1).
 *
 * Quatro afirmações que a tela fazia sem ter como saber: que todo jogo que ela
 * não achou na janela local do dia estava encerrado; que a taxa da noite podia
 * sair de um box parcial; que "nenhum apitado tem box" significa "o box do jogo
 * não chegou"; e que todo apitado joga em casa.
 */
describe('Resultados · o estado vem do jogo, não do que a tela não achou', () => {
  it('jogo da rodada fora da janela local do dia não vira FT nem "aguardando"', async () => {
    const { jogos } = await import('../../modules/dominio/db/schema')
    const { intervaloDoDia } = await import('../../modules/dominio/rodada')
    const recap = await recapDaNoite(banco.db, HOJE)
    // O jogo tardio da costa oeste: a rodada é HOJE, o horário local já é
    // de amanhã. `telaJogosDoDia` recorta por horário e não o encontrava.
    const alvo = recap.porJogo.find((g) => g.jogo.status === 'AGENDADO')!
    const antes = await renderizar(HOJE)
    const { fim } = intervaloDoDia(HOJE, FUSO)
    const tardio = new Date(fim.getTime() + 3_600_000)

    expect(alvo).toBeDefined()
    try {
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: tardio })
        .where(eq(jogos.id, alvo.jogo.jogoId))
      const depois = await renderizar(HOJE)

      expect(cardsDaTela(depois)).toHaveLength(cardsDaTela(antes).length)
      expect(depois.match(/>PRÉ</g) ?? []).toHaveLength((antes.match(/>PRÉ</g) ?? []).length)
      expect(depois.match(/>FT</g) ?? []).toHaveLength((antes.match(/>FT</g) ?? []).length)
      expect(textoDaTela(depois).toLowerCase()).not.toContain('aguardando dado oficial')
    } finally {
      await banco.db
        .update(jogos)
        .set({ dataHoraUtc: alvo.jogo.dataHoraUtc })
        .where(eq(jogos.id, alvo.jogo.jogoId))
    }
  }, 60_000)

  it('a rodada EM CURSO não inventa taxa nem escreve "APITOS 0": conta os publicados e aguarda o fim da noite', async () => {
    const { jogos } = await import('../../modules/dominio/db/schema')
    const encerrados = await banco.db
      .select({ id: jogos.id })
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, HOJE), eq(jogos.status, 'ENCERRADO')))
    const recap = await recapDaNoite(banco.db, HOJE)
    const html = await renderizar(HOJE)

    // O fixture: a rodada de hoje está rolando, com cards em tela.
    expect(encerrados).toHaveLength(0)
    expect(recap.noiteEncerrada).toBe(false)
    expect(cardsDaTela(html)).toHaveLength(recap.publicados)
    expect(recap.publicados).toBeGreaterThan(0)

    const bloco = textoSeparado(trecho(html, 'APITOS', 'TEMPORADA'))
    // O número de apitos é o que está em tela; sem jogo encerrado não há
    // "bateram" nem taxa — e a tela diz por quê, em vez de "0 · 0 · —".
    expect([...bloco.matchAll(/\d+%?|—/g)].map((m) => m[0])).toEqual([
      String(recap.publicados),
      '—',
    ])
    expect(bloco).toContain('aguardando o fim da noite')
    expect(html).not.toContain('APITO DA NOITE')
  }, 60_000)

  it('a nota de confiança é inteira e SEM "%" — na rodada em curso, que é onde ela aparece', async () => {
    // A identidade 04 tirou o "%" do card (o número puro é o que os cinco
    // artboards desenham; o "%" sobrou só para TAXA, no cabeçalho da noite e na
    // faixa da temporada). O que continua valendo é a regra antiga: a nota
    // nunca tem casa decimal.
    const html = await renderizar(HOJE)
    const cards = cardsDaTela(html)
    expect(cards.length).toBeGreaterThan(0)

    // A nota é o número grande do card (Anton 30) — o mesmo elemento nos cinco
    // artboards. Casar por ele evita confundir a nota com a média ou a odd, que
    // são decimais legítimos no rodapé.
    const notas = cards.flatMap((card) => [
      ...card.matchAll(/font-size:30px[^"]*"[^>]*>([\d,.]+)</g),
    ])
    expect(notas.length).toBeGreaterThan(0)
    for (const [, nota] of notas) expect(nota).toMatch(/^\d+$/)
    for (const card of cards) expect(textoDaTela(card)).not.toContain('%')
  }, 60_000)

  it('box do jogo chegou e o apitado não jogou: DNP, não "aguardando dado oficial"', async () => {
    const { estatisticasJogo } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    // O caso do jogo de UM apitado só: apagar a linha dele apaga todo o box
    // que a tela enxergava, mas o box do JOGO continua lá.
    const grupo =
      recap.porJogo.find((g) => new Set(g.cards.map((c) => c.jogadorId)).size === 1) ??
      recap.porJogo[0]!
    const apitados = [...new Set(grupo.cards.map((c) => c.jogadorId))]
    const onde = and(
      eq(estatisticasJogo.jogoId, grupo.jogo.jogoId),
      inArray(estatisticasJogo.jogadorId, apitados),
    )
    const linhas = await banco.db.select().from(estatisticasJogo).where(onde)
    const restante = await banco.db
      .select({ jogadorId: estatisticasJogo.jogadorId })
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, grupo.jogo.jogoId))

    // O box do jogo tem mais gente do que os apitados — é o que sustenta o caso.
    expect(restante.length).toBeGreaterThan(linhas.length)
    try {
      await banco.db.delete(estatisticasJogo).where(onde)
      const html = await renderizar(ONTEM)
      const texto = textoDaTela(html)
      expect(texto).toContain('não jogou · neutro')
      expect(html.match(/>DNP</g) ?? []).toHaveLength(grupo.cards.length)
      expect(texto.toLowerCase()).not.toContain('aguardando dado oficial')
    } finally {
      await banco.db.insert(estatisticasJogo).values(linhas)
    }
  }, 60_000)

  it('o mando sai no apoio do card: "@ ADV" para o visitante, "vs ADV" para o mandante', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const texto = textoDaTela(await renderizar(ONTEM))

    let fora = 0
    let casa = 0
    for (const { jogo, cards } of recap.porJogo) {
      for (const card of cards) {
        // O lado é decidido por ID — o time da LISTA do CJ contra os dois
        // times do jogo —, nunca por sigla.
        if (card.timeId === jogo.visitanteId) {
          expect(texto).toContain(`· ${card.timeSigla} · @ ${jogo.casaSigla}`)
          fora++
        } else if (card.timeId === jogo.casaId) {
          expect(texto).toContain(`· ${card.timeSigla} · vs ${jogo.visitanteSigla}`)
          casa++
        }
      }
    }
    // A noite tem os dois lados: sem isso o teste passaria com "vs" fixo.
    expect(fora).toBeGreaterThan(0)
    expect(casa).toBeGreaterThan(0)
  }, 60_000)

  it('o mando e a sigla vêm da LISTA do CJ: o time REAL do provedor não mexe no card', async () => {
    const { jogadores, times } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo = recap.porJogo.find((g) => g.cards.some((c) => c.timeId !== null))!
    const alvo = grupo.cards.find((c) => c.timeId !== null)!
    const [real] = await banco.db
      .select({ timeId: jogadores.timeId })
      .from(jogadores)
      .where(eq(jogadores.id, alvo.jogadorId))
    // Um time que não é o da lista nem joga esta partida — o elenco projetado
    // (Giannis no Miami) visto pelo lado do provedor.
    const forasteiro = (
      await banco.db.select({ id: times.id, sigla: times.sigla }).from(times)
    ).find(
      (t) => t.id !== alvo.timeId && t.id !== grupo.jogo.casaId && t.id !== grupo.jogo.visitanteId,
    )!
    const emCasa = alvo.timeId === grupo.jogo.casaId
    const apoio = emCasa
      ? `· ${alvo.timeSigla} · vs ${grupo.jogo.visitanteSigla}`
      : `· ${alvo.timeSigla} · @ ${grupo.jogo.casaSigla}`

    try {
      await banco.db
        .update(jogadores)
        .set({ timeId: forasteiro.id })
        .where(eq(jogadores.id, alvo.jogadorId))
      const html = await renderizar(ONTEM)
      const artigo = cardsDaTela(html).find((c) => c.includes(alvo.nome))!
      expect(artigo).toBeDefined()
      expect(textoDaTela(artigo)).toContain(apoio)
      expect(textoDaTela(artigo)).not.toContain(forasteiro.sigla)
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: real!.timeId })
        .where(eq(jogadores.id, alvo.jogadorId))
    }
  }, 60_000)

  it('o carimbo de "aguardando dado oficial" é o do PRÓPRIO jogo, não o mais novo da rodada', async () => {
    const { estatisticasJogo, jogos } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const [semBox, tocado, esquecido] = recap.porJogo
    expect(recap.porJogo.length).toBeGreaterThan(2)
    // Horários derivados do próprio jogo, distintos na hora: o jogo sem box
    // foi visto há tempo; um vizinho acabou de ser atualizado; outro está
    // ainda mais velho. Nem o mais novo da rodada (o carimbo antigo) nem o
    // mais antigo (a doutrina da tela) é o do jogo que espera o box.
    const antigo = new Date(semBox!.jogo.dataHoraUtc.getTime() + 3 * 3_600_000)
    const recente = new Date(antigo.getTime() + 5 * 3_600_000)
    const maisVelho = new Date(antigo.getTime() - 5 * 3_600_000)
    const ondeBox = eq(estatisticasJogo.jogoId, semBox!.jogo.jogoId)
    const linhas = await banco.db.select().from(estatisticasJogo).where(ondeBox)
    const carimbar = (jogoId: string, quando: Date) =>
      banco.db.update(jogos).set({ atualizadoEm: quando }).where(eq(jogos.id, jogoId))

    try {
      await banco.db.delete(estatisticasJogo).where(ondeBox)
      await carimbar(semBox!.jogo.jogoId, antigo)
      await carimbar(tocado!.jogo.jogoId, recente)
      await carimbar(esquecido!.jogo.jogoId, maisVelho)
      const texto = textoDaTela(await renderizar(ONTEM))
      expect(texto.toLowerCase()).toContain('aguardando dado oficial')
      expect(texto).toContain(dataHora(antigo, FUSO))
      expect(texto).not.toContain(dataHora(recente, FUSO))
      expect(texto).not.toContain(dataHora(maisVelho, FUSO))
    } finally {
      await banco.db.insert(estatisticasJogo).values(linhas)
      await carimbar(semBox!.jogo.jogoId, semBox!.jogo.atualizadoEm)
      await carimbar(tocado!.jogo.jogoId, tocado!.jogo.atualizadoEm)
      await carimbar(esquecido!.jogo.jogoId, esquecido!.jogo.atualizadoEm)
    }
  }, 60_000)

  it('a barrinha desta rodada é a ÚLTIMA da fileira cronológica, e vale o que o jogador fez', async () => {
    const recap = await recapDaNoite(banco.db, ONTEM)
    const feed = await lerFeed(banco.db, ONTEM)
    const html = await renderizar(ONTEM)
    const alvo = recap.porJogo.flatMap((g) => g.cards).find((c) => c.fez !== null && c.fez > 0)!
    // A metade PRÉ do card: o item do feed da linha mais baixa, com os últimos
    // 5 na ordem canônica da entrega (mais recente primeiro).
    const item = (feed?.conteudo.itens ?? [])
      .filter(
        (i) =>
          i.jogoId === alvo.jogoId &&
          i.jogadorId === alvo.jogadorId &&
          i.atributo === alvo.atributo,
      )
      .sort((a, b) => (a.linha ?? Infinity) - (b.linha ?? Infinity))[0]!

    expect(alvo).toBeDefined()
    expect(item).toBeDefined()
    expect((item.ultimos5 ?? []).length).toBeGreaterThan(0)
    const artigo = cardsDaTela(html).find((c) => c.includes(alvo.nome))!
    const fileira = artigo.slice(artigo.indexOf('ÚLT. 5 NA LINHA'))
    const quadrados = [...fileira.matchAll(/(<span[^>]*>)(\d+)<\/span>/g)]
    expect(quadrados.length).toBeGreaterThan(1)
    // É a TELA que monta a fileira em ordem cronológica — do mais antigo à
    // esquerda ao jogo desta rodada à direita — e o card não a inverte.
    expect(quadrados.map((q) => q[2])).toEqual([
      ...[...(item.ultimos5 ?? []).slice(0, 4)].reverse().map((j) => String(j.valor)),
      String(alvo.fez),
    ])
    const ultimo = quadrados.at(-1)!
    expect(ultimo[1]).toContain('outline:2px')
    expect(quadrados.slice(0, -1).every((q) => !q[1]!.includes('outline'))).toBe(true)
  }, 60_000)

  it('antes do veredito o rodapé segue com média e odd — nunca um valor único sem rótulo', async () => {
    // O card conferido troca o rodapé direito pelo veredito (artboard); na
    // rodada em curso ele é o da Lista Secreta, e é aqui que a odd aparece.
    const texto = textoSeparado(await renderizar(HOJE))

    expect(texto).toContain('MÉDIA')
    expect(texto).toMatch(/ODD (MÉDIA \d+,\d\d|\d+,\d\d–\d+,\d\d)/)
    expect(texto).not.toMatch(/ODD (?!MÉDIA)\d+,\d\d(?!–)/)
  }, 60_000)

  it('sem o box do time o cabeçalho diz ENCERRADO por escrito, sem inventar quartos', async () => {
    const { estatisticasTimeJogo } = await import('../../modules/dominio/db/schema')
    const recap = await recapDaNoite(banco.db, ONTEM)
    const grupo = recap.porJogo[0]!
    const onde = eq(estatisticasTimeJogo.jogoId, grupo.jogo.jogoId)
    const linhas = await banco.db.select().from(estatisticasTimeJogo).where(onde)

    try {
      await banco.db.delete(estatisticasTimeJogo).where(onde)
      const html = await renderizar(ONTEM)
      expect(html.match(/aria-label="Pontos por quarto/g) ?? []).toHaveLength(
        recap.porJogo.length - 1,
      )
      expect(textoDaTela(html)).toContain('ENCERRADO')
    } finally {
      await banco.db.insert(estatisticasTimeJogo).values(linhas)
    }
  }, 60_000)

  it('a tela termina onde o mockup termina: sem parágrafo autoral no rodapé', async () => {
    const texto = textoDaTela(await renderizar(ONTEM))
    expect(texto).not.toContain('Um apitado conta como acerto')
  }, 60_000)
})
