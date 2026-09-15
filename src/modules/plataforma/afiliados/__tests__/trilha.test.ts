import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas } from '@/modules/dominio/db/schema'
import { intervaloDoDia } from '@/modules/dominio/rodada'

import { trilhaDeSaidas } from '../servico'
import { plantarSaidaComOrigem } from './cenario'

const FUSO = 'America/Sao_Paulo'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 60_000)
afterAll(async () => {
  await banco?.fechar()
})

describe('trilhaDeSaidas — o casamento é por dia LOCAL', () => {
  it('banco sem saída nenhuma devolve lista vazia, sem lançar', async () => {
    expect(await trilhaDeSaidas(banco.db, { fuso: FUSO })).toEqual([])
  })

  it('a saída das 23h de Brasília casa com a entrada do MESMO dia local, não do dia seguinte', async () => {
    // 2026-09-15T23:30 em Brasília é 2026-09-16T02:30 em UTC. Se o dia saísse
    // do UTC, esta saída procuraria a entrada do dia 16 e não acharia nada —
    // justamente no horário de maior movimento.
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-16T02:30:00.000Z'),
      linha: 25,
    })
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      dataReferencia: '2026-09-15',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: 25,
      unidades: '1.00',
      odd: null,
    })

    const trilha = await trilhaDeSaidas(banco.db, { fuso: FUSO })
    const nossa = trilha.find((s) => s.id === cenario.eventoId)
    expect(nossa).toBeDefined()
    expect(nossa!.registrou).toBe(true)
    expect(nossa!.origem?.linha).toBe(25)
  })

  it('entrada de OUTRO dia não casa', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-20T18:00:00.000Z'),
      linha: 30,
    })
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      dataReferencia: '2026-09-21',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: 30,
      unidades: '1.00',
      odd: null,
    })
    const trilha = await trilhaDeSaidas(banco.db, { fuso: FUSO })
    expect(trilha.find((s) => s.id === cenario.eventoId)!.registrou).toBe(false)
  })

  it('saída sem origem aparece na trilha, com origem nula e sem casar', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-22T18:00:00.000Z'),
      linha: 20,
      semOrigem: true,
    })
    const nossa = (await trilhaDeSaidas(banco.db, { fuso: FUSO })).find(
      (s) => s.id === cenario.eventoId,
    )
    expect(nossa!.origem).toBeNull()
    expect(nossa!.registrou).toBe(false)
  })

  it('saída de visitante anônimo aparece na trilha e nunca casa, mesmo com entrada igual', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-24T18:00:00.000Z'),
      linha: 18,
      semUsuario: true,
    })
    // A entrada casaria em TODOS os outros campos — dia local, jogador,
    // atributo e linha. É o evento que não tem dono: o casamento é por
    // usuário, e um clique deslogado não carrega um para comparar. Sem esta
    // entrada plantada o teste não discriminaria nada.
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      dataReferencia: '2026-09-24',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: 18,
      unidades: '1.00',
      odd: null,
    })
    const nossa = (await trilhaDeSaidas(banco.db, { fuso: FUSO })).find(
      (s) => s.id === cenario.eventoId,
    )
    expect(nossa).toBeDefined()
    expect(nossa!.origem).not.toBeNull()
    expect(nossa!.registrou).toBe(false)
  })

  it('apito de Fire Live entra com origem, mas nunca casa — não existe entrada sem linha', async () => {
    // Não é defeito: a gestão exige linha para registrar entrada, e Fire Live
    // não tem linha (spec §10). A origem viaja para o admin mesmo assim.
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-23T18:00:00.000Z'),
      estrategia: 'FIRE_LIVE',
      linha: null,
    })
    const nossa = (await trilhaDeSaidas(banco.db, { fuso: FUSO })).find(
      (s) => s.id === cenario.eventoId,
    )
    expect(nossa!.origem).not.toBeNull()
    expect(nossa!.origem!.linha).toBeNull()
    expect(nossa!.registrou).toBe(false)
  })

  it('o recorte de período tem o fim EXCLUSIVO, como as outras seções do painel', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-10-02T03:00:00.000Z'),
      linha: 22,
    })
    const dia = intervaloDoDia('2026-10-02', FUSO)
    // 03:00Z é meia-noite em Brasília: o primeiro instante do dia 2, e o
    // ÚLTIMO instante que o recorte do dia 1 não pode incluir.
    const dentro = await trilhaDeSaidas(banco.db, { fuso: FUSO, filtro: dia })
    expect(dentro.some((s) => s.id === cenario.eventoId)).toBe(true)
    const vespera = intervaloDoDia('2026-10-01', FUSO)
    const fora = await trilhaDeSaidas(banco.db, { fuso: FUSO, filtro: vespera })
    expect(fora.some((s) => s.id === cenario.eventoId)).toBe(false)
  })
})
