import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasTimeJogo,
  feedSnapshot,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { Nivel } from '../../motor/tipos'
import { materializarFeedFireLive, type ConteudoFeedFireLive } from '../fire-live/feed'
import { lerFeed, publicarListaSecreta } from '../lista-secreta'

/**
 * MATCHUP EM ESTRELAS NA MATERIALIZAÇÃO (CJ, 09/10; spec 2026-10-09, §2).
 *
 * O item do feed carrega `matchup: { estrelas, motivos, aviso }`. O adversário
 * é o do time que o FEED usa para o apitado:
 * - Lista Secreta: o time da lista do CJ (`niveis.time_id`), como o painel;
 * - Fire Live: o time canônico (`jogadores.time_id`), como o `adversarioSigla`
 *   do próprio item.
 *
 * O fixture faz o ADV ser quem mais cede pontos (posição 1) e o LAL o 2º. Com
 * corte 1, só quem enfrenta o ADV ganha estrela — e o vínculo do jogador no
 * provedor é o OPOSTO do da lista, para o teste distinguir as duas regras.
 */
const base = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const ruleset = structuredClone(base)
ruleset.matchup.corte_top = 1

const HOJE = '2025-12-15'
const AGORA = new Date(`${HOJE}T23:30:00.000Z`)

const HIERARQUIA: { nome: string; nivel: Nivel }[] = [
  { nome: 'Luka Doncic', nivel: 'MVP' },
  { nome: 'Austin Reaves', nivel: 'ALL_STAR' },
  { nome: 'Grimes', nivel: 'SUPORTE' },
  { nome: 'Kessler', nivel: 'SUPORTE' },
]

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string
const idPorNome = new Map<string, string>()

beforeAll(async () => {
  banco = await bancoDeTeste()
  const db = banco.db
  const [lal] = await db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [adv] = await db.insert(times).values({ sigla: 'ADV', nome: 'Adversário' }).returning()
  const [versao] = await db.insert(niveisVersao).values({ versao: 'teste-1', ativa: true }).returning()

  for (const [indice, { nome, nivel }] of HIERARQUIA.entries()) {
    // No PROVEDOR, o Reaves é do ADV; na lista do CJ, todos são do LAL.
    const timeReal = nome === 'Austin Reaves' ? adv!.id : lal!.id
    const [j] = await db.insert(jogadores).values({ nomeCompleto: nome, timeId: timeReal }).returning()
    idPorNome.set(nome, j!.id)
    await db.insert(niveis).values({
      niveisVersaoId: versao!.id,
      jogadorId: j!.id,
      timeId: lal!.id,
      atributo: 'PONTOS',
      nivel,
      posicaoHierarquia: indice + 1,
    })
    await db.insert(mediasJogador).values({
      jogadorId: j!.id,
      temporada: '2025-26',
      janela: 'TEMPORADA',
      jogos: 40,
      ppg: '18.0',
    })
  }

  // 20 dias de competição antes de HOJE: LAL 130 × 90 ADV em todos.
  for (let d = 1; d <= 20; d++) {
    const data = `2025-11-${String(d + 9).padStart(2, '0')}`
    const [passado] = await db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date(`${data}T23:00:00.000Z`),
        dataReferencia: data,
        timeCasaId: lal!.id,
        timeVisitanteId: adv!.id,
        status: 'ENCERRADO',
      })
      .returning()
    await db.insert(estatisticasTimeJogo).values([
      { jogoId: passado!.id, timeId: lal!.id, pontos: 130 },
      { jogoId: passado!.id, timeId: adv!.id, pontos: 90 },
    ])
  }

  const [jogo] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(`${HOJE}T23:00:00.000Z`),
      dataReferencia: HOJE,
      timeCasaId: lal!.id,
      timeVisitanteId: adv!.id,
      quartoAtual: 1,
      status: 'AO_VIVO',
    })
    .returning()
  jogoId = jogo!.id

  // O nº 1 fora abre a OPD para os três seguintes.
  await db
    .insert(lesoesEscalacao)
    .values({ jogoId, jogadorId: idPorNome.get('Luka Doncic')!, status: 'FORA' })
}, 30_000)
afterAll(async () => banco.fechar())

describe('Lista Secreta: matchup pelo time da lista do CJ', () => {
  it('todo item contra o ADV ganha a estrela de pontos cedidos', async () => {
    const r = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
    })
    expect(r.publicou).toBe(true)
    const feed = await lerFeed(banco.db, HOJE)
    const itens = feed!.conteudo.itens
    expect(itens.length).toBeGreaterThan(0)
    // O Reaves inclusive: o time do provedor (ADV) não manda na Lista.
    expect(itens.some((i) => i.jogadorId === idPorNome.get('Austin Reaves'))).toBe(true)
    for (const i of itens) {
      expect(i.matchup).toEqual({
        estrelas: 1,
        motivos: [{ metrica: 'PONTOS_CEDIDOS', posicao: 1 }],
        aviso: [],
      })
    }
  })

  it('antes dos 20 dias de competição, o item vai sem matchup', async () => {
    const cedo = structuredClone(ruleset)
    cedo.matchup.liberar_apos_dias_de_competicao = 21
    await publicarListaSecreta(banco.db, cedo, { dataReferencia: HOJE, agora: AGORA, ignorarAntecedencia: true })
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.every((i) => i.matchup === null)).toBe(true)
  })
})

describe('Fire Live: matchup pelo adversário do próprio item', () => {
  it('o adversário segue o time canônico do apitado, como o adversarioSigla', async () => {
    for (const nome of ['Grimes', 'Austin Reaves']) {
      await banco.db.insert(apitos).values({
        rulesetVersao: 'v-teste',
        jogoId,
        jogadorId: idPorNome.get(nome)!,
        atributo: 'PONTOS',
        estrategia: 'FIRE_LIVE',
        nivelJogador: 'SUPORTE',
        nivelApito: 1,
        alvo1q: 5,
      })
    }
    await materializarFeedFireLive(banco.db, ruleset, jogoId, AGORA)
    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(and(eq(feedSnapshot.estrategia, 'FIRE_LIVE'), eq(feedSnapshot.jogoId, jogoId)))
    const itens = (linha!.conteudoJson as ConteudoFeedFireLive).itens
    const grimes = itens.find((i) => i.jogadorId === idPorNome.get('Grimes'))!
    const reaves = itens.find((i) => i.jogadorId === idPorNome.get('Austin Reaves'))!
    expect(grimes.adversarioSigla).toBe('ADV')
    expect(grimes.matchup).toEqual({
        estrelas: 1,
        motivos: [{ metrica: 'PONTOS_CEDIDOS', posicao: 1 }],
        aviso: [],
      })
    // Reaves é do ADV no provedor: enfrenta o LAL, que é o 2º — fora do corte 1.
    expect(reaves.adversarioSigla).toBe('LAL')
    expect(reaves.matchup).toBeNull()
  })
})

/**
 * PENTE FINO DE 09/10, achado 3: o banco que falha AO LER O MATCHUP. O Fire
 * Live degrada — `matchup: null` em todos os itens do ciclo, com log — e o
 * snapshot ao vivo segue; a Lista Secreta lança (lá parar não custa nada e o
 * dado tem de estar certo).
 *
 * Só a varredura dos perfis (a única leitura que pede `tresC`) falha: o resto
 * do banco responde, como num soluço de uma consulta só.
 */
function bancoQueFalhaNoMatchup(db: typeof banco.db): typeof banco.db {
  return new Proxy(db, {
    get(alvo, prop) {
      const valor = Reflect.get(alvo, prop)
      if (prop === 'select') {
        return (campos?: Record<string, unknown>) => {
          if (campos && 'tresC' in campos) throw new Error('banco fora no matchup')
          return (valor as (c?: unknown) => unknown).call(alvo, campos)
        }
      }
      return typeof valor === 'function' ? valor.bind(alvo) : valor
    },
  })
}

describe('matchup indisponível na materialização', () => {
  it('Fire Live não lança: todos os itens vão com matchup null e o ciclo grava', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Outro instante (a chave do memo é o db; o proxy é outro objeto).
    const r = await materializarFeedFireLive(
      bancoQueFalhaNoMatchup(banco.db),
      ruleset,
      jogoId,
      new Date(AGORA.getTime() + 60_000),
    )
    expect(r).not.toBeNull()
    expect(r!.itens).toBeGreaterThan(0)
    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(and(eq(feedSnapshot.estrategia, 'FIRE_LIVE'), eq(feedSnapshot.jogoId, jogoId)))
    const itens = (linha!.conteudoJson as ConteudoFeedFireLive).itens
    expect(itens.every((i) => i.matchup === null)).toBe(true)
    const eventos = log.mock.calls.map(([m]) => JSON.parse(String(m)) as { evento: string })
    expect(eventos.some((e) => e.evento === 'matchup_indisponivel')).toBe(true)
    log.mockRestore()
  })

  it('Lista Secreta lança', async () => {
    await expect(
      publicarListaSecreta(bancoQueFalhaNoMatchup(banco.db), ruleset, {
        dataReferencia: HOJE,
        agora: AGORA,
        ignorarAntecedencia: true,
      }),
    ).rejects.toThrow('banco fora no matchup')
  })
})
