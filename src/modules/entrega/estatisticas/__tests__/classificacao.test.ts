import { afterAll, beforeAll, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { classificacao, jogos, times } from '../../../dominio/db/schema'
import { telaDaClassificacao } from '../time'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

it('os últimos cinco são por time, mesmo quando a liga tem muitos jogos mais recentes', async () => {
  const [alvo, rival, outro, adversario] = await banco.db
    .insert(times)
    .values([
      { sigla: 'ALV', nome: 'Time com calendário antigo' },
      { sigla: 'RIV', nome: 'Rival' },
      { sigla: 'OUT', nome: 'Outro time' },
      { sigla: 'ADV', nome: 'Adversário' },
    ])
    .returning()
  await banco.db.insert(classificacao).values({
    temporada: '2026',
    timeId: alvo!.id,
    vitorias: 3,
    derrotas: 2,
    posicao: 1,
  })
  await banco.db.insert(jogos).values(
    Array.from({ length: 5 }, (_, i) => ({
      dataHoraUtc: new Date(Date.UTC(2025, 0, i + 1, 18)),
      dataReferencia: `2025-01-0${i + 1}`,
      timeCasaId: alvo!.id,
      timeVisitanteId: rival!.id,
      status: 'ENCERRADO' as const,
      placarCasa: i % 2 === 0 ? 110 : 90,
      placarVisitante: 100,
    })),
  )
  await banco.db.insert(jogos).values(
    Array.from({ length: 301 }, (_, i) => {
      const data = new Date(Date.UTC(2026, 0, i + 1, 18))
      return {
        dataHoraUtc: data,
        dataReferencia: data.toISOString().slice(0, 10),
        timeCasaId: outro!.id,
        timeVisitanteId: adversario!.id,
        status: 'ENCERRADO' as const,
        placarCasa: 100,
        placarVisitante: 90,
      }
    }),
  )

  const tela = await telaDaClassificacao(banco.db, '2026')
  expect(tela.linhas.find((linha) => linha.timeId === alvo!.id)?.forma).toEqual(['V', 'D', 'V', 'D', 'V'])
})
