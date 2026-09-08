import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

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
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed, publicarListaSecreta } from '../lista-secreta'

const ruleset = carregarRuleset(yamlBruto)
const HOJE = '2026-01-15'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let timeId: string
let adversarioId: string
let versaoAtivaId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [time, adversario] = await banco.db
    .insert(times)
    .values([
      { sigla: 'NYK', nome: 'Knicks' },
      { sigla: 'ADV', nome: 'Adversário da fixture' },
    ])
    .returning()
  timeId = time!.id
  adversarioId = adversario!.id
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Jogador do vínculo', timeId })
    .returning()
  jogadorId = jogador!.id
  const [anterior] = await banco.db
    .insert(jogos)
    .values({
      dataReferencia: '2026-01-14',
      dataHoraUtc: new Date('2026-01-14T23:00:00Z'),
      timeCasaId: timeId,
      timeVisitanteId: adversarioId,
      status: 'ENCERRADO',
    })
    .returning()
  await banco.db.insert(estatisticasJogo).values({
    jogoId: anterior!.id,
    jogadorId,
    minutos: '30.00',
    pontos: 20,
  })
  await banco.db.insert(mediasJogador).values({
    jogadorId,
    temporada: '2025-26',
    janela: 'TEMPORADA',
    jogos: 20,
    ppg: '30.00',
    // Sem média de rebotes: a segunda classificação não gera outro apito.
  })
  await banco.db.insert(jogos).values({
    dataReferencia: HOJE,
    dataHoraUtc: new Date(`${HOJE}T23:00:00Z`),
    timeCasaId: timeId,
    timeVisitanteId: adversarioId,
  })
})

afterAll(async () => banco.fechar())

beforeEach(async () => {
  await banco.db.delete(feedSnapshot)
  await banco.db.delete(apitos)
  await banco.db.delete(niveis)
  await banco.db.delete(niveisVersao)
  const [ativa] = await banco.db
    .insert(niveisVersao)
    .values({ versao: 'vinculos-ativa', ativa: true })
    .returning()
  versaoAtivaId = ativa!.id
  await banco.db.insert(niveis).values({
    niveisVersaoId: versaoAtivaId,
    jogadorId,
    timeId,
    atributo: 'PONTOS',
    nivel: 'MVP',
    posicaoHierarquia: 1,
  })
})

async function conferirTimePublicado() {
  const resultado = await publicarListaSecreta(banco.db, ruleset, {
    dataReferencia: HOJE,
    agora: new Date(`${HOJE}T22:30:00Z`),
    ignorarAntecedencia: true,
  })
  expect(resultado.publicou).toBe(true)
  const feed = await lerFeed(banco.db, HOJE)
  const itens = feed!.conteudo.itens
  expect(itens.length).toBeGreaterThan(0)
  expect(new Set(itens.map((item) => item.atributo))).toEqual(new Set(['PONTOS']))
  for (const item of itens) {
    expect(item).toMatchObject({ jogadorId, timeSigla: 'NYK', timeNome: 'Knicks' })
  }
}

describe('o feed preserva o vínculo editorial que produziu o apito', () => {
  it('versão inativa inserida depois não troca o time da versão ativa', async () => {
    const [inativa] = await banco.db
      .insert(niveisVersao)
      .values({ versao: 'vinculos-inativa', ativa: false })
      .returning()
    await banco.db.insert(niveis).values({
      niveisVersaoId: inativa!.id,
      jogadorId,
      timeId: adversarioId,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    })
    await conferirTimePublicado()
  })

  it('rebotes em outro time não substitui o vínculo de pontos no mesmo jogador', async () => {
    await banco.db.insert(niveis).values({
      niveisVersaoId: versaoAtivaId,
      jogadorId,
      timeId: adversarioId,
      atributo: 'REBOTES',
      nivel: 'SUPORTE',
      posicaoHierarquia: 1,
    })
    await conferirTimePublicado()
  })
})
