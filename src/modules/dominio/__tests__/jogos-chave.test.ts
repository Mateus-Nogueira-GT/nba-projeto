import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { jogos, times } from '../db/schema'
import { bancoDeTeste } from './ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

describe('chave do jogo é a rodada, não a data UTC (0036)', () => {
  it('MIA×CHI em Miami em noites seguidas são dois jogos', async () => {
    // Caso real do backfill de 2025-26: 31/01 começou às 01:00 UTC do dia
    // 01/02, e o de 01/02 às 23:00 UTC — mesma data UTC, rodadas diferentes.
    const [mia, chi] = await banco.db
      .insert(times)
      .values([
        { sigla: 'MIA', nome: 'Miami Heat' },
        { sigla: 'CHI', nome: 'Chicago Bulls' },
      ])
      .returning()
    const confronto = { timeCasaId: mia!.id, timeVisitanteId: chi!.id }

    await banco.db.insert(jogos).values([
      { ...confronto, dataReferencia: '2026-01-31', dataHoraUtc: new Date('2026-02-01T01:00:00Z') },
      { ...confronto, dataReferencia: '2026-02-01', dataHoraUtc: new Date('2026-02-01T23:00:00Z') },
    ])

    expect(await banco.db.select().from(jogos)).toHaveLength(2)
  })

  it('o mesmo confronto na mesma rodada continua sendo um jogo só', async () => {
    const [casa] = await banco.db.select().from(times).limit(1)
    const [fora] = await banco.db.select().from(times).offset(1).limit(1)
    const linha = {
      timeCasaId: fora!.id,
      timeVisitanteId: casa!.id,
      dataReferencia: '2026-03-10',
      dataHoraUtc: new Date('2026-03-10T23:00:00Z'),
    }
    await banco.db.insert(jogos).values(linha)

    await expect(
      banco.db.insert(jogos).values({ ...linha, dataHoraUtc: new Date('2026-03-11T01:00:00Z') }),
    ).rejects.toThrow()
  })
})
