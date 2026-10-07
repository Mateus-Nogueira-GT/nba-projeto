import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  conflitosIdentidadeJogador,
  identidadesJogador,
  jogadores,
  times,
} from '../../../dominio/db/schema'
import { FonteFake } from '../../nba/adaptadores/fake'
import type { JogadorExterno, TimeExterno } from '../../nba/porta'
import { vincularConflito } from '../conflitos'
import { sincronizarJogadores, sincronizarTimes } from '../elenco'

const PROVEDOR = 'balldontlie'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

beforeEach(async () => {
  await banco.db.delete(conflitosIdentidadeJogador)
  await banco.db.delete(identidadesJogador)
  await banco.db.delete(jogadores)
  await banco.db.delete(times)
})

const TIMES: TimeExterno[] = [
  { idExterno: 't1', sigla: 'LAL', nome: 'Lakers', conferencia: 'Oeste', logoUrl: null },
  { idExterno: 't2', sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste', logoUrl: null },
]

function micah(idExterno: string, timeSiglaProvedor: string | null): JogadorExterno {
  return {
    idExterno,
    nomeCompleto: 'Micah Potter',
    timeSiglaProvedor,
    posicao: 'F',
    alturaCm: 208,
    numeroCamisa: 25,
    fotoUrl: null,
    ativo: true,
  }
}

/** Dois ids da BallDontLie para a mesma pessoa, ligados pela curadoria. */
async function micahComDoisIds() {
  const f = new FonteFake(PROVEDOR, { times: TIMES, jogadores: [micah('A', 'LAL')] })
  await sincronizarTimes(banco.db, f)
  await sincronizarJogadores(banco.db, f)
  await sincronizarJogadores(
    banco.db,
    new FonteFake(PROVEDOR, { jogadores: [micah('A', 'LAL'), micah('B', 'LAL')] }),
  )
  return vincularConflito(banco.db, PROVEDOR, 'B', 'parceiro')
}

describe('jogador com dois ids no mesmo provedor', () => {
  it('um id fora do /players/active não derruba o jogador que o outro id mantém ativo', async () => {
    const jogadorId = await micahComDoisIds()

    // Snapshot de /players/active: só o id A aparece.
    await sincronizarJogadores(
      banco.db,
      new FonteFake(PROVEDOR, { jogadores: [micah('A', 'LAL')] }),
    )

    const [j] = await banco.db.select().from(jogadores).where(eq(jogadores.id, jogadorId))
    expect(j!.ativo).toBe(true)
  })

  it('nenhum dos ids presente: aí sim fica inativo', async () => {
    const jogadorId = await micahComDoisIds()

    await sincronizarJogadores(
      banco.db,
      new FonteFake(PROVEDOR, {
        jogadores: [{ ...micah('X', 'BOS'), nomeCompleto: 'Outro Jogador' }],
      }),
    )

    const [j] = await banco.db.select().from(jogadores).where(eq(jogadores.id, jogadorId))
    expect(j!.ativo).toBe(false)
  })

  it('os dois ids presentes com times diferentes: vale o primeiro na ordem da API', async () => {
    const jogadorId = await micahComDoisIds()
    const [bos] = await banco.db.select().from(times).where(eq(times.sigla, 'BOS'))

    await sincronizarJogadores(
      banco.db,
      new FonteFake(PROVEDOR, { jogadores: [micah('B', 'BOS'), micah('A', 'LAL')] }),
    )

    const [j] = await banco.db.select().from(jogadores).where(eq(jogadores.id, jogadorId))
    expect(j!.timeId).toBe(bos!.id)
  })
})
