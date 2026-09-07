import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  jogos,
  lesoesEscalacao,
  niveis,
  niveisVersao,
} from '../../dominio/db/schema'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { conferirRodadas } from '../resultados'
import { apitosDoJogador, telaDoJogador } from '../estatisticas/jogador'
import { hierarquiaDoTime } from '../estatisticas/time'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'
const TEMPORADA = temporadaDe(AGORA, calendarioDoRuleset(ruleset))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7 })
}, 300_000)
afterAll(async () => banco.fechar())

/**
 * ESTATÍSTICAS ENTIDADE-CÊNTRICAS (identidade 04). A aba continua sendo dado
 * canônico; o que entra é a leitura do que a ESTRATÉGIA fez com cada entidade
 * — rotulada como tal — e a hierarquia do CJ desenhada como o depth chart.
 */
describe('apitosDoJogador — a aba Games com ✓/✗', () => {
  it('lista os apitos conferidos do jogador, mais recente primeiro, com fez e bateu coerentes', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const comHistorico = new Map<string, number>()
    for (const d of dias)
      for (const j of d.jogadores)
        if (j.valor !== null)
          comHistorico.set(j.jogadorId, (comHistorico.get(j.jogadorId) ?? 0) + 1)
    const [jogadorId, n] = [...comHistorico.entries()].sort((a, b) => b[1] - a[1])[0]!
    expect(n).toBeGreaterThan(0)

    const apitos = await apitosDoJogador(banco.db, jogadorId, 20)
    expect(apitos.length).toBe(
      dias.reduce((c, d) => c + d.jogadores.filter((j) => j.jogadorId === jogadorId).length, 0),
    )
    for (let i = 1; i < apitos.length; i++) {
      // Ordenado pelo INSTANTE da partida — a mesma coluna que a tabela jogo a
      // jogo ordena e formata, para que a mesma partida não saia com duas datas.
      expect(apitos[i - 1]!.data >= apitos[i]!.data).toBe(true)
    }
    for (const a of apitos) {
      expect(a.adversarioSigla).toMatch(/^[A-Z]{3}$/)
      expect(a.linhaMaisBaixa).toBeGreaterThan(0)
      if (a.fez === null) expect(a.bateu).toBeNull()
      else expect(a.bateu).toBe(a.fez >= a.linhaMaisBaixa)
    }
  })

  it('respeita o limite', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores)[0]!
    expect((await apitosDoJogador(banco.db, algum.jogadorId, 1)).length).toBeLessThanOrEqual(1)
  })
})

describe('apitosDoJogador — os DOIS motivos de não haver veredito', () => {
  /** Um apito já conferido, com ✓ ou ✗ — o ponto de partida dos dois casos. */
  async function apitoConferido() {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    for (const j of dias.flatMap((d) => d.jogadores)) {
      const lista = await apitosDoJogador(banco.db, j.jogadorId, 20)
      const conferido = lista.find((a) => a.bateu !== null)
      if (conferido) return { jogadorId: j.jogadorId, apito: conferido }
    }
    throw new Error('a temporada simulada precisa de ao menos um apito conferido')
  }

  it('jogo ainda não encerrado é "aguardando dado oficial", nunca DNP', async () => {
    // O campo `estado` existe para isso: sem ele a tela chamaria de "não
    // jogou" o apito do jogo desta noite (spec §5.1, "nunca inferir de parcial").
    const { jogadorId, apito } = await apitoConferido()
    expect(apito.estado).toBe('CONFERIDO')

    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)
    try {
      await banco.db.update(jogos).set({ status: 'AGENDADO' }).where(eq(jogos.id, apito.jogoId))
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      expect(depois.estado).toBe('AGUARDANDO_OFICIAL')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db.update(jogos).set({ status: jogo!.status }).where(eq(jogos.id, apito.jogoId))
    }
  })

  it('linha de box score com zero minuto é "não jogou", não "fez 0 ✗"', async () => {
    // O provedor manda a linha do reserva que NÃO ENTROU (0 min, 0 pts) e a
    // sincronização insere toda linha recebida. Tratar ausência de linha como
    // o único DNP pintava de vermelho quem nunca pisou na quadra.
    const { jogadorId, apito } = await apitoConferido()
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(
        and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
      )
      .limit(1)
    expect(box, 'o apito conferido tem box score').toBeDefined()

    try {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: '0.00', pontos: 0, rebotesTotal: 0, assistencias: 0 })
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      expect(depois.estado).toBe('NAO_JOGOU')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({
          minutos: box!.minutos,
          pontos: box!.pontos,
          rebotesTotal: box!.rebotesTotal,
          assistencias: box!.assistencias,
        })
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
    }
  })

  it('jogo ENCERRADO cujo box score ainda não chegou é "aguardando dado oficial", nunca DNP', async () => {
    // O TERCEIRO caso, e o que mais acontece na vida real: o jogo acabou às
    // 23h e o job de box score ainda não rodou. A ausência de linha não é
    // minuto zero — é dado que não chegou. É a mesma regra de `estadoDoCiclo`
    // (lista-por-jogo.ts): ENCERRADO sem box é AGUARDANDO_OFICIAL.
    const { jogadorId, apito } = await apitoConferido()
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(
        and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
      )
      .limit(1)
    expect(box, 'o apito conferido tem box score').toBeDefined()

    try {
      await banco.db
        .delete(estatisticasJogo)
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)
      expect(jogo!.status).toBe('ENCERRADO')
      expect(depois.estado).toBe('AGUARDANDO_OFICIAL')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db.insert(estatisticasJogo).values(box!)
    }
  })
})

describe('telaDoJogador — o número do jogador e as duas visões de time', () => {
  it('traz a nota média recente (3–10) e o time na lista do CJ, rotulado à parte do time atual', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores).find((j) => j.valor !== null)!
    const tela = (await telaDoJogador(banco.db, algum.jogadorId, { temporada: TEMPORADA }))!
    expect(tela).not.toBeNull()
    expect(tela.notaMediaRecente).not.toBeNull()
    expect(tela.notaMediaRecente!).toBeGreaterThanOrEqual(3)
    expect(tela.notaMediaRecente!).toBeLessThanOrEqual(10)
    // Na temporada simulada as duas visões coincidem; o que se testa é que a
    // segunda EXISTE e vem de `niveis` (lista do CJ), não de `jogadores.time_id`.
    expect(tela.timeNaListaDoCj).not.toBeNull()
    expect(tela.timeNaListaDoCj!.sigla).toMatch(/^[A-Z]{3}$/)
    // O nível do JOGADOR em pontos vem na mesma linha da lista — é o que a
    // tela escreve no mesmo fôlego ("na lista do CJ MIA · Suporte em pontos").
    expect(['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']).toContain(tela.timeNaListaDoCj!.nivel)
  })
})

describe('hierarquiaDoTime — o depth chart do CJ com o desfalque em prefixo', () => {
  it('ordena pela posição do CJ e marca como fora quem está em lesoes_escalacao no jogo', async () => {
    const [versao] = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const [fora] = await banco.db
      .select()
      .from(lesoesEscalacao)
      .where(eq(lesoesEscalacao.status, 'FORA'))
      .limit(1)
    expect(fora, 'a temporada simulada sempre tem ao menos um desfalque').toBeDefined()
    const [vinculo] = await banco.db
      .select()
      .from(niveis)
      .where(
        and(
          eq(niveis.niveisVersaoId, versao!.id),
          eq(niveis.jogadorId, fora!.jogadorId),
          eq(niveis.atributo, 'PONTOS'),
        ),
      )
      .limit(1)

    const hierarquia = await hierarquiaDoTime(banco.db, vinculo!.timeId, 'PONTOS', fora!.jogoId)
    expect(hierarquia.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < hierarquia.length; i++)
      expect(hierarquia[i]!.posicao).toBeGreaterThan(hierarquia[i - 1]!.posicao)
    const linhaDoFora = hierarquia.find((h) => h.jogadorId === fora!.jogadorId)!
    expect(linhaDoFora.fora).toBe(true)
    expect(hierarquia.filter((h) => h.fora).length).toBeGreaterThanOrEqual(1)
    for (const h of hierarquia) {
      expect(h.nome.length).toBeGreaterThan(0)
      expect(['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']).toContain(h.nivel)
    }
  })

  it('sem jogo, ninguém está fora — a hierarquia é só a lista', async () => {
    const [versao] = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const [algum] = await banco.db
      .select()
      .from(niveis)
      .where(eq(niveis.niveisVersaoId, versao!.id))
      .limit(1)
    const hierarquia = await hierarquiaDoTime(banco.db, algum!.timeId, 'REBOTES', null)
    expect(hierarquia.length).toBeGreaterThan(0)
    expect(hierarquia.every((h) => h.fora === false)).toBe(true)
  })
})
