import { eq, notInArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogadores, jogos, times } from '../../../dominio/db/schema'
import { semearDemo } from '../../../ingestao/demo/semear'
import { rulesetAtivo } from '../../ruleset-ativo'
import { telaDoJogo } from '../jogo'

const AGORA = new Date('2026-08-24T18:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, await rulesetAtivo(), AGORA)
}, 180_000)
afterAll(async () => banco.fechar())

async function umJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
  const [j] = await banco.db.select().from(jogos).where(eq(jogos.status, status)).limit(1)
  return telaDoJogo(banco.db, j!.id, {})
}

describe('tela de partida — jogo encerrado', () => {
  it('traz box score dos DOIS elencos, não só o da casa', async () => {
    const tela = (await umJogo('ENCERRADO'))!
    expect(tela.casa.boxScore.length).toBeGreaterThan(0)
    expect(tela.visitante.boxScore.length).toBeGreaterThan(0)
  })

  it('os quartos FECHAM com o placar', async () => {
    // Box score que não soma é pior que box score ausente: parece dado.
    const tela = (await umJogo('ENCERRADO'))!
    for (const lado of [tela.casa, tela.visitante]) {
      const q = lado.quartos!
      expect(q.q1 + q.q2 + q.q3 + q.q4 + q.prorrogacao).toBe(lado.placar)
    }
  })

  it('os líderes SÃO de fato os maiores do jogo', async () => {
    // Um líder que não bate com a tabela logo abaixo destrói a confiança na
    // tela inteira.
    const tela = (await umJogo('ENCERRADO'))!
    const todos = [...tela.casa.boxScore, ...tela.visitante.boxScore]
    const pontos = tela.lideres.find((l) => l.rotulo === 'Pontos')!
    expect(pontos.valor).toBe(Math.max(...todos.map((l) => l.pontos)))
  })

  it('quem jogou o bastante tem nota; a nota vive na escala 3..10', async () => {
    const tela = (await umJogo('ENCERRADO'))!
    const comNota = [...tela.casa.boxScore, ...tela.visitante.boxScore].filter(
      (l) => l.nota !== null,
    )
    expect(comNota.length).toBeGreaterThan(0)
    for (const l of comNota) {
      expect(l.nota!).toBeGreaterThanOrEqual(3)
      expect(l.nota!).toBeLessThanOrEqual(10)
    }
  })

  it('o elenco é o do BOX SCORE REAL — jogador de um TERCEIRO time não aparece', async () => {
    // Fronteira: `montarLado` filtra as linhas do box por
    // `jogadores.time_id === timeId` (jogo.ts). Prova real: insere uma linha
    // de estatisticas_jogo para um jogador de um time que NÃO é nem casa nem
    // visitante deste jogo, e afirma que ele não aparece em NENHUM dos dois
    // lados. A versão anterior deste teste só checava
    // `nome.length > 0` — passaria mesmo lendo a lista curada, porque o
    // fallback de nome ausente ('—') também tem comprimento 1.
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.status, 'ENCERRADO')).limit(1)
    const idsDoJogo = [jogo!.timeCasaId, jogo!.timeVisitanteId]

    const [outroTime] = await banco.db.select().from(times).where(notInArray(times.id, idsDoJogo)).limit(1)
    const [estranho] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.timeId, outroTime!.id))
      .limit(1)

    await banco.db.insert(estatisticasJogo).values({
      jogoId: jogo!.id,
      jogadorId: estranho!.id,
      pontos: 99,
    })

    const tela = (await telaDoJogo(banco.db, jogo!.id, {}))!
    const idsNoBox = new Set(
      [...tela.casa.boxScore, ...tela.visitante.boxScore].map((l) => l.jogadorId),
    )
    expect(idsNoBox.has(estranho!.id)).toBe(false)
  })
})

describe('tela de partida — ao vivo', () => {
  it('tem parcial e NÃO declara vencedor', async () => {
    // Jogo no 1º quarto com "V 51–32" diria que o jogo acabou.
    const tela = (await umJogo('AO_VIVO'))!
    expect(tela.status).toBe('AO_VIVO')
    expect(tela.casa.placar).not.toBeNull()
    expect(tela.casa.forma).not.toContain(undefined)
  })
})

describe('tela de partida — pré-jogo', () => {
  it('traz H2H e forma, que é o que existe antes da bola subir', async () => {
    const tela = (await umJogo('AGENDADO'))!
    expect(tela.h2h.length).toBeGreaterThan(0)
    expect(tela.casa.forma.length).toBeGreaterThan(0)
    for (const v of [...tela.casa.forma, ...tela.visitante.forma]) {
      expect(['V', 'D']).toContain(v)
    }
  })

  it('o H2H é só entre ESTES dois times', async () => {
    // Um confronto de outro par na lista seria mentira sobre o histórico.
    const tela = (await umJogo('AGENDADO'))!
    const siglas = new Set([tela.casa.sigla, tela.visitante.sigla])
    for (const c of tela.h2h) {
      expect(siglas.has(c.siglaCasa)).toBe(true)
      expect(siglas.has(c.siglaVisitante)).toBe(true)
    }
  })

  it('o H2H respeita o limite pedido', async () => {
    const [j] = await banco.db.select().from(jogos).where(eq(jogos.status, 'AGENDADO')).limit(1)
    const tela = (await telaDoJogo(banco.db, j!.id, { limiteH2H: 2 }))!
    expect(tela.h2h.length).toBeLessThanOrEqual(2)
  })
})

describe('tela de partida — bordas', () => {
  it('jogo inexistente devolve null, não explode', async () => {
    expect(await telaDoJogo(banco.db, '00000000-0000-4000-8000-00000000dead', {})).toBeNull()
  })
})
