import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { fireLiveExecucoes, jogos, logFalhas, times } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { encerrarExecucao, executarCiclo, registrarCiclo } from '../fire-live/ciclo'
import { executarPassoFireLive } from '../fire-live/passo'

// executarCiclo real por padrão; um teste força uma exceção vinda do motor
// sem montar elenco, estatísticas e fila só para quebrar lá dentro.
vi.mock('../fire-live/ciclo', async (original) => {
  const real = await original<typeof import('../fire-live/ciclo')>()
  return { ...real, executarCiclo: vi.fn(real.executarCiclo) }
})

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-11-03T23:10:00.000Z')
const INICIO = '2026-11-03T23:00:00.000Z'
const filaMuda = { publicar: vi.fn() } as never

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(fireLiveExecucoes)
  await banco.db.delete(jogos)
  await banco.db.delete(times)
  const [casa] = await banco.db.insert(times).values({ sigla: 'CAS', nome: 'Casa' }).returning()
  const [vis] = await banco.db.insert(times).values({ sigla: 'VIS', nome: 'Visitante' }).returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(INICIO),
      dataReferencia: '2026-11-03',
      timeCasaId: casa!.id,
      timeVisitanteId: vis!.id,
      quartoAtual: 2,
    })
    .returning()
  jogoId = jogo!.id
  await banco.db.insert(fireLiveExecucoes).values({
    jogoId,
    iniciadoEm: new Date(INICIO),
    estado: 'INICIADA',
    runId: 'run-1',
    atualizadoEm: new Date(INICIO),
  })
})

const entrada = (o: Partial<Parameters<typeof executarPassoFireLive>[1]> = {}) => ({
  jogoId,
  runId: 'run-1',
  estadoAnterior: { x: 1 } as never,
  iniciadoEmIso: INICIO,
  ciclo: 5,
  motorEncerrado: true,
  ...o,
})

describe('passo do Fire Live', () => {
  it('ingestão falhando não mata o run: continua com o estado anterior', async () => {
    const r = await executarPassoFireLive(
      {
        db: banco.db,
        ruleset,
        fila: filaMuda,
        agora: AGORA,
        ingerir: async () => {
          throw new Error('BDL 502')
        },
      },
      entrada({ motorEncerrado: false }),
    )
    expect(r).toMatchObject({ encerrar: false, estado: { x: 1 }, motorEncerrado: false })
  })

  it('falha de ciclo vai para log_falhas, para a saúde alertar quando se repete', async () => {
    await banco.db.delete(logFalhas)
    await executarPassoFireLive(
      {
        db: banco.db,
        ruleset,
        fila: filaMuda,
        agora: AGORA,
        ingerir: async () => {
          throw new Error('BDL 502')
        },
      },
      entrada({ motorEncerrado: false }),
    )
    const linhas = await banco.db.select().from(logFalhas)
    expect(linhas.map((l) => l.origem)).toEqual(['fire-live-ciclo-falhou'])
    expect(linhas[0]?.contextoJson).toMatchObject({ jogoId, erro: 'BDL 502' })
  })

  it('todo passo grava o batimento, mesmo depois do fim do 1Q', async () => {
    await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => {} },
      entrada(),
    )
    const [linha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha?.atualizadoEm).toEqual(AGORA)
  })

  it('run que perdeu o lease para no próximo passo', async () => {
    await banco.db
      .update(fireLiveExecucoes)
      .set({ runId: 'run-2' })
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    const ingerir = vi.fn()
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir },
      entrada(),
    )
    expect(r).toEqual({ encerrar: true, motivo: 'lease-perdido' })
    expect(ingerir).not.toHaveBeenCalled()
  })

  it('jogo encerrado continua sendo saída dura', async () => {
    await banco.db.update(jogos).set({ status: 'ENCERRADO' }).where(eq(jogos.id, jogoId))
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => {} },
      entrada(),
    )
    expect(r).toEqual({ encerrar: true, motivo: 'jogo-encerrado' })
  })

  it('erro no ciclo renova o batimento no fim do passo, para o cron não retomar um run vivo', async () => {
    const fimDoPasso = new Date(AGORA.getTime() + 48_000)
    const r = await executarPassoFireLive(
      {
        db: banco.db,
        ruleset,
        fila: filaMuda,
        agora: AGORA,
        relogio: () => fimDoPasso,
        ingerir: async () => {
          throw new Error('timeout do provedor')
        },
      },
      entrada({ motorEncerrado: false }),
    )
    expect(r).toMatchObject({ encerrar: false })
    const [linha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha?.atualizadoEm).toEqual(fimDoPasso)
  })

  it('exceção dentro de executarCiclo também é capturada e o run continua', async () => {
    vi.mocked(executarCiclo).mockRejectedValueOnce(new Error('motor explodiu'))
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => {} },
      entrada({ motorEncerrado: false }),
    )
    expect(executarCiclo).toHaveBeenCalled()
    expect(r).toMatchObject({ encerrar: false, estado: { x: 1 }, motorEncerrado: false })
  })

  it('runId null (run legado) pula o batimento e segue', async () => {
    await banco.db
      .update(fireLiveExecucoes)
      .set({ runId: 'outro-run' })
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    const ingerir = vi.fn(async () => {})
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir },
      entrada({ runId: null }),
    )
    expect(ingerir).toHaveBeenCalled()
    expect(r).toMatchObject({ encerrar: false })
    const [linha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha?.atualizadoEm).toEqual(new Date(INICIO))
  })

  it('run velho não escreve estado nem encerra a linha entregue a outro run', async () => {
    await banco.db
      .update(fireLiveExecucoes)
      .set({ runId: 'run-2', ciclos: 7 })
      .where(eq(fireLiveExecucoes.jogoId, jogoId))

    await registrarCiclo(banco.db, jogoId, { y: 2 }, 99, 'run-1')
    await encerrarExecucao(banco.db, jogoId, 'jogo-encerrado', AGORA, 'run-1')

    const [linha] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha).toMatchObject({
      estado: 'INICIADA',
      runId: 'run-2',
      ciclos: 7,
      ultimoEstado: null,
    })
    expect(linha?.atualizadoEm).toEqual(new Date(INICIO))

    // O dono da linha continua escrevendo normalmente.
    await registrarCiclo(banco.db, jogoId, { y: 2 }, 8, 'run-2')
    await encerrarExecucao(banco.db, jogoId, 'jogo-encerrado', AGORA, 'run-2')
    const [depois] = await banco.db
      .select()
      .from(fireLiveExecucoes)
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(depois).toMatchObject({ estado: 'ENCERRADA', ciclos: 8, ultimoEstado: { y: 2 } })
  })
})
