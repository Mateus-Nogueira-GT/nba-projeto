import { and, eq, notInArray } from 'drizzle-orm'
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

  it('o lado de cada linha é o time DAQUELE jogo (estatisticas_jogo.time_id), não o cadastro de hoje', async () => {
    // Um jogador que jogou pelo mandante e foi trocado DEPOIS: o cadastro
    // (`jogadores.time_id`) já diz o time novo, mas a linha do box diz por
    // quem ele jogou naquela noite. Sem isso ele sumia do box, ou caía no
    // lado errado quando o time novo era o adversário.
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.status, 'ENCERRADO')).limit(1)
    const antes = (await telaDoJogo(banco.db, jogo!.id, {}))!
    const trocado = antes.casa.boxScore[0]!
    const [cadastro] = await banco.db.select().from(jogadores).where(eq(jogadores.id, trocado.jogadorId))
    const ondeLinha = and(eq(estatisticasJogo.jogoId, jogo!.id), eq(estatisticasJogo.jogadorId, trocado.jogadorId))
    const [linhaOriginal] = await banco.db.select().from(estatisticasJogo).where(ondeLinha)
    try {
      await banco.db.update(estatisticasJogo).set({ timeId: jogo!.timeCasaId }).where(ondeLinha)
      for (const novoTime of [jogo!.timeVisitanteId, null]) {
        // Trocado para o ADVERSÁRIO daquela noite, e para fora dos dois times.
        const [terceiro] = await banco.db
          .select()
          .from(times)
          .where(notInArray(times.id, [jogo!.timeCasaId, jogo!.timeVisitanteId]))
          .limit(1)
        await banco.db
          .update(jogadores)
          .set({ timeId: novoTime ?? terceiro!.id })
          .where(eq(jogadores.id, trocado.jogadorId))
        const tela = (await telaDoJogo(banco.db, jogo!.id, {}))!
        expect(tela.casa.boxScore.map((l) => l.jogadorId), String(novoTime)).toContain(trocado.jogadorId)
        expect(tela.visitante.boxScore.map((l) => l.jogadorId), String(novoTime)).not.toContain(trocado.jogadorId)
        // Com nome e rosto: o cadastro dele é lido mesmo fora dos dois times.
        const linha = tela.casa.boxScore.find((l) => l.jogadorId === trocado.jogadorId)!
        expect(linha.nome).toBe(trocado.nome)
      }
    } finally {
      await banco.db.update(jogadores).set({ timeId: cadastro!.timeId }).where(eq(jogadores.id, trocado.jogadorId))
      await banco.db.update(estatisticasJogo).set({ timeId: linhaOriginal!.timeId }).where(ondeLinha)
    }
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

  it('tem BOX SCORE parcial dos dois lados — não "em atualização" para o jogo em destaque', async () => {
    // Antes desta correção, `estatisticas_jogo` só era escrita dentro do
    // laço do histórico (jogos ENCERRADOS): o jogo AO VIVO da demo tinha
    // `estatisticas_quarto` (o Fire Live lê essa tabela), mas NUNCA um box
    // individual — a própria tela que ganhou o refresh de 30s abria em "Box
    // score em atualização" logo na demonstração.
    const tela = (await umJogo('AO_VIVO'))!
    expect(tela.casa.boxScore.length).toBeGreaterThan(0)
    expect(tela.visitante.boxScore.length).toBeGreaterThan(0)
  })

  it('os quartos do TIME cobrem só o que já foi jogado — nada inventado no 2º/3º/4º', async () => {
    const tela = (await umJogo('AO_VIVO'))!
    expect(tela.casa.quartos).not.toBeNull()
    expect(tela.visitante.quartos).not.toBeNull()
    for (const lado of [tela.casa, tela.visitante]) {
      expect(lado.quartos!.q2).toBe(0)
      expect(lado.quartos!.q3).toBe(0)
      expect(lado.quartos!.q4).toBe(0)
      // O 1º quarto (o único disputado) é o placar do jogo inteiro até agora.
      expect(lado.quartos!.q1).toBe(lado.placar)
    }
  })

  it('os pontos individuais do 1º quarto SOMAM o placar do time — nunca contradizem', async () => {
    const tela = (await umJogo('AO_VIVO'))!
    for (const lado of [tela.casa, tela.visitante]) {
      const soma = lado.boxScore.reduce((s, l) => s + l.pontos, 0)
      expect(soma).toBe(lado.placar)
    }
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
