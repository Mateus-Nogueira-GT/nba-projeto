import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { checkpointsIngestao, execucoesIngestao } from '../../../dominio/db/schema'
import { contarDadoParaLimpar, podeRodarScriptDaDemo } from '../guarda-scripts'

/**
 * OS SCRIPTS MANUAIS DA DEMO TÊM A MESMA GUARDA DO CRON (pente fino de 09/10,
 * achado 5).
 *
 * Com `.env.local` apontando para produção, um `demo:limpar --confirmar` de
 * rotina apagava a temporada 2025-26 real e os apitos regravados; um
 * `demo:temporada` semeava ficção por cima dela.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

async function gravarCheckpointReal() {
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
}

describe('guarda dos scripts da demo', () => {
  it('banco vazio: os três scripts rodam', async () => {
    for (const script of ['seed', 'temporada', 'limpar'] as const) {
      expect(await podeRodarScriptDaDemo(banco.db, {}, { script })).toEqual({ pode: true })
    }
  })

  it('ingestão real ligada: semear recusa, mesmo com a flag (ela é só do limpar)', async () => {
    const env = { NBA_INGESTAO_HABILITADA: 'true' }
    expect(await podeRodarScriptDaDemo(banco.db, env, { script: 'temporada' })).toEqual({
      pode: false,
      motivo: 'INGESTAO_REAL_HABILITADA',
    })
    expect(
      await podeRodarScriptDaDemo(banco.db, env, { script: 'seed', apagarDadoReal: true }),
    ).toEqual({ pode: false, motivo: 'INGESTAO_REAL_HABILITADA' })
  })

  it('ingestão real ligada: limpar recusa sem a flag e passa com --apagar-dado-real', async () => {
    const env = { NBA_INGESTAO_HABILITADA: 'true' }
    expect(await podeRodarScriptDaDemo(banco.db, env, { script: 'limpar' })).toEqual({
      pode: false,
      motivo: 'INGESTAO_REAL_HABILITADA',
    })
    expect(
      await podeRodarScriptDaDemo(banco.db, env, { script: 'limpar', apagarDadoReal: true }),
    ).toEqual({ pode: true })
  })

  it('checkpoint real presente: os três recusam sem a flag', async () => {
    await gravarCheckpointReal()
    for (const script of ['seed', 'temporada', 'limpar'] as const) {
      expect(await podeRodarScriptDaDemo(banco.db, {}, { script })).toEqual({
        pode: false,
        motivo: 'DADO_REAL_PRESENTE',
      })
    }
  })

  it('checkpoint real presente com --apagar-dado-real: só o limpar passa', async () => {
    expect(
      await podeRodarScriptDaDemo(banco.db, {}, { script: 'limpar', apagarDadoReal: true }),
    ).toEqual({ pode: true })
    expect(
      await podeRodarScriptDaDemo(banco.db, {}, { script: 'temporada', apagarDadoReal: true }),
    ).toEqual({ pode: false, motivo: 'DADO_REAL_PRESENTE' })
  })

  it('a contagem do que o limpar levaria sai antes de apagar, sem apagar nada', async () => {
    const contagens = await contarDadoParaLimpar(banco.db)
    expect(contagens).toMatchObject({ jogos: 0, jogadores: 0, apitos: 0 })
    // Contar não é limpar: o checkpoint gravado acima continua lá.
    expect(await podeRodarScriptDaDemo(banco.db, {}, { script: 'limpar' })).toEqual({
      pode: false,
      motivo: 'DADO_REAL_PRESENTE',
    })
  })
})
