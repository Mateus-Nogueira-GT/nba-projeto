import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { apitos, jogadores, jogos, times } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import { materializarFeedFireLive } from '../fire-live/feed'
import { lerFeedFireLive, placaresAoVivo } from '../fire-live/leitura'
import { rulesetAtivo } from '../ruleset-ativo'

const ANTES = new Date('2026-01-16T02:58:00Z')
const DEPOIS = new Date('2026-01-16T03:02:00Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string
let hojeId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, visitante] = await banco.db
    .insert(times)
    .values([
      { sigla: 'LAL', nome: 'Lakers' },
      { sigla: 'NYK', nome: 'Knicks' },
    ])
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({
      nomeCompleto: 'Jogador da madrugada',
      timeId: casa!.id,
    })
    .returning()
  const [madrugada, hoje] = await banco.db
    .insert(jogos)
    .values([
      {
        dataHoraUtc: new Date('2026-01-16T02:50:00Z'),
        dataReferencia: '2026-01-15',
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        status: 'AO_VIVO',
        quartoAtual: 1,
        placarCasa: 19,
        placarVisitante: 15,
      },
      {
        dataHoraUtc: new Date('2026-01-17T01:00:00Z'),
        dataReferencia: '2026-01-16',
        timeCasaId: visitante!.id,
        timeVisitanteId: casa!.id,
      },
    ])
    .returning()
  jogoId = madrugada!.id
  hojeId = hoje!.id
  await banco.db.insert(apitos).values({
    jogoId,
    jogadorId: jogador!.id,
    rulesetVersao: '1',
    atributo: 'PONTOS',
    estrategia: 'FIRE_LIVE',
    nivelJogador: 'MVP',
    nivelApito: 1,
    alvo1q: 9,
    geradoEm: ANTES,
  })
  await materializarFeedFireLive(banco.db, await rulesetAtivo(), jogoId, ANTES)
})
afterAll(async () => banco.fechar())

it('o mesmo apito e placar sobrevivem à virada real de Brasília e ao link do push', async () => {
  const fuso = 'America/Sao_Paulo'
  const anterior = await lerFeedFireLive(banco.db, dataDeReferencia(ANTES, fuso), 1)
  const dia = dataDeReferencia(DEPOIS, fuso)
  const posterior = await lerFeedFireLive(banco.db, dia, 1)
  const peloPush = await lerFeedFireLive(banco.db, dia, 1, { jogo: jogoId })
  expect(anterior.itens).toHaveLength(1)
  expect(posterior.itens).toEqual(anterior.itens)
  expect(peloPush.itens).toEqual(anterior.itens)
  expect(posterior.jogos.map((j) => j.id)).toEqual(expect.arrayContaining([jogoId, hojeId]))
  expect(await placaresAoVivo(banco.db, dia, 1)).toEqual([
    { jogoId, casaSigla: 'LAL', casaPlacar: 19, visitanteSigla: 'NYK', visitantePlacar: 15 },
  ])
})

it('a continuidade termina com o jogo; não ressuscita rodada encerrada', async () => {
  await banco.db
    .update(jogos)
    .set({ status: 'ENCERRADO', quartoAtual: 4 })
    .where(eq(jogos.id, jogoId))
  const feed = await lerFeedFireLive(banco.db, '2026-01-16', 1)
  expect(feed.itens).toEqual([])
  expect(feed.jogos.map((j) => j.id)).toEqual([hojeId])
})
