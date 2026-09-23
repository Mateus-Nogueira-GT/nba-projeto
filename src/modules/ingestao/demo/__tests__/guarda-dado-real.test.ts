import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { checkpointsIngestao, execucoesIngestao } from '../../../dominio/db/schema'
import { motivoParaNaoSemear } from '../autossemeadura'

/**
 * A DEMO NÃO SEMEIA POR CIMA DE DADO REAL (auditoria de 23/09).
 *
 * `DEMO_AUTOSSEMEADURA` estava em Production e o cron roda todo dia às 6h de
 * Brasília: bastava esquecer a variável depois do backfill da temporada real
 * para ficção ser gravada por cima do dado do assinante pagante.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

describe('guarda de dado real da demo', () => {
  it('banco vazio e ingestão desligada: pode semear', async () => {
    expect(await motivoParaNaoSemear(banco.db, {})).toBeNull()
  })

  it('ingestão real habilitada: não semeia', async () => {
    expect(await motivoParaNaoSemear(banco.db, { NBA_INGESTAO_HABILITADA: 'true' })).toBe(
      'INGESTAO_REAL_HABILITADA',
    )
  })

  it('checkpoint do backfill real no banco: não semeia', async () => {
    const [execucao] = await banco.db
      .insert(execucoesIngestao)
      .values({
        job: 'backfill-rodada',
        janelaInicio: '2025-10-21',
        janelaFim: '2025-10-21',
        temporada: '2025-26',
        origem: 'CLI',
      })
      .returning({ id: execucoesIngestao.id })
    await banco.db.insert(checkpointsIngestao).values({
      job: 'backfill-rodada',
      janelaInicio: '2025-10-21',
      janelaFim: '2025-10-21',
      temporada: '2025-26',
      provedor: 'balldontlie',
      execucaoId: execucao!.id,
    })
    expect(await motivoParaNaoSemear(banco.db, {})).toBe('DADO_REAL_PRESENTE')
  })
})
