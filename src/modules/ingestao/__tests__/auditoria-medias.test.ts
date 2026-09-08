import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasJogo,
  feedSnapshot,
  jogadores,
  jogos,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { lerFeed, publicarListaSecreta } from '../../entrega/lista-secreta'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { recalcularMedias } from '../sincronizar/medias'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const calendario = calendarioDoRuleset(ruleset)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let timeId: string
let adversarioId: string
let jogadorId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(feedSnapshot)
  await banco.db.delete(apitos)
  await banco.db.delete(estatisticasJogo)
  await banco.db.delete(mediasJogador)
  await banco.db.delete(niveis)
  await banco.db.delete(niveisVersao)
  await banco.db.delete(jogos)
  await banco.db.delete(jogadores)
  await banco.db.delete(times)

  const [time] = await banco.db.insert(times).values({ sigla: 'NYK', nome: 'Knicks' }).returning()
  const [adversario] = await banco.db
    .insert(times)
    .values({ sigla: 'ADV', nome: 'Adversário da fixture' })
    .returning()
  timeId = time!.id
  adversarioId = adversario!.id
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Brunson', timeId })
    .returning()
  jogadorId = jogador!.id
})

async function partidaEncerrada(instante: string, dataReferencia: string, pontos: number) {
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(instante),
      dataReferencia,
      timeCasaId: timeId,
      timeVisitanteId: adversarioId,
      status: 'ENCERRADO',
    })
    .returning()
  await banco.db.insert(estatisticasJogo).values({
    jogoId: jogo!.id,
    jogadorId,
    minutos: '30.00',
    pontos,
  })
}

describe('auditoria da média que alimenta a estratégia', () => {
  it('não inclui o último jogo de setembro na média da temporada seguinte por já ser outubro em UTC', async () => {
    const fimDaTemporada = '2026-10-01T01:30:00Z'
    expect(temporadaDe(new Date(fimDaTemporada), calendario)).toBe('2025-26')
    await partidaEncerrada(fimDaTemporada, '2026-09-30', 40)
    await partidaEncerrada('2026-10-02T23:00:00Z', '2026-10-02', 20)

    await recalcularMedias(banco.db, {
      janela: 'temporada',
      configTemporada: calendario,
      agora: new Date('2026-10-03T12:00:00Z'),
    })
    const [media] = await banco.db
      .select()
      .from(mediasJogador)
      .where(and(eq(mediasJogador.jogadorId, jogadorId), eq(mediasJogador.temporada, '2026-27')))

    expect(media).toMatchObject({ jogos: 1, ppg: '20.00' })
  })

  it('inclui o último jogo de setembro na temporada que ainda está vigente em Brasília', async () => {
    await partidaEncerrada('2026-09-29T23:00:00Z', '2026-09-29', 20)
    await partidaEncerrada('2026-10-01T01:30:00Z', '2026-09-30', 40)
    const agora = new Date('2026-10-01T02:30:00Z')
    expect(temporadaDe(agora, calendario)).toBe('2025-26')

    await recalcularMedias(banco.db, { janela: 'temporada', configTemporada: calendario, agora })
    const [media] = await banco.db
      .select()
      .from(mediasJogador)
      .where(and(eq(mediasJogador.jogadorId, jogadorId), eq(mediasJogador.temporada, '2025-26')))

    expect(media).toMatchObject({ jogos: 2, ppg: '30.00' })
  })

  it('avalia a Lista Secreta pela mesma janela configurada que a materialização exibe', async () => {
    const alterado = structuredClone(ruleset)
    alterado.media.janela = 'ultimos_10'
    const [versao] = await banco.db
      .insert(niveisVersao)
      .values({ versao: 'auditoria-janela', ativa: true })
      .returning()
    await banco.db.insert(niveis).values({
      niveisVersaoId: versao!.id,
      jogadorId,
      timeId,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    })

    // Dois jogos fora da janela recente: (2*80 + 10*20)/12 = 30 na
    // temporada, mas 20 nos últimos dez. A última pontuação 20 não oscila
    // contra média 20; apita indevidamente quando o motor lê a média 30.
    for (let dia = 1; dia <= 12; dia += 1) {
      const data = `2026-01-${String(dia).padStart(2, '0')}`
      await partidaEncerrada(`${data}T23:00:00Z`, data, dia <= 2 ? 80 : 20)
    }
    const agora = new Date('2026-01-15T22:30:00Z')
    await recalcularMedias(banco.db, { janela: 'temporada', configTemporada: calendario, agora })
    await recalcularMedias(banco.db, { janela: 'ultimos_10', configTemporada: calendario, agora })
    await banco.db.insert(jogos).values({
      dataHoraUtc: new Date('2026-01-15T23:00:00Z'),
      dataReferencia: '2026-01-15',
      timeCasaId: timeId,
      timeVisitanteId: adversarioId,
    })

    const resultado = await publicarListaSecreta(banco.db, alterado, {
      dataReferencia: '2026-01-15',
      agora,
    })
    expect(resultado.publicou).toBe(true)
    const feed = await lerFeed(banco.db, '2026-01-15')
    expect(feed).not.toBeNull()
    expect(feed!.conteudo.itens).toEqual([])
  })
})
