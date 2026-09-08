import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogadores, preferenciasUsuario, times, usuarios } from '../../../dominio/db/schema'
import { gravarPreferencias, preferenciasDoUsuario } from '../../preferencias'
import { jogadoresOcultosDe, ocultarJogador } from '../../jogadores-ocultos'
import {
  definirAcompanhamento,
  definirExclusaoAlerta,
  estadoExperienciaDoUsuario,
  gravarPreferenciasExperiencia,
} from '../servico'
import { estadoExperienciaPadrao } from '../contrato'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioA: string
let usuarioB: string
let jogadorId: string
let timeId: string
beforeAll(async () => {
  banco = await bancoDeTeste()
  const us = await banco.db
    .insert(usuarios)
    .values([
      { email: 'experiencia-a@teste.com', senhaHash: 'x' },
      { email: 'experiencia-b@teste.com', senhaHash: 'x' },
    ])
    .returning()
  usuarioA = us[0]!.id
  usuarioB = us[1]!.id
  const [time] = await banco.db
    .insert(times)
    .values({ sigla: 'TST', nome: 'Time teste' })
    .returning()
  timeId = time!.id
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Jogador teste', timeId })
    .returning()
  jogadorId = jogador!.id
})
afterAll(async () => {
  await banco?.fechar()
})

describe('experiência persistida por conta', () => {
  it('ausência usa defaults e ocultos não viram acompanhados ou silenciados', async () => {
    await ocultarJogador(banco.db, usuarioA, jogadorId)
    expect(await estadoExperienciaDoUsuario(banco.db, usuarioA)).toEqual(estadoExperienciaPadrao())
    expect(await jogadoresOcultosDe(banco.db, usuarioA)).toEqual(new Set([jogadorId]))
  })
  it('patch preserva mute, campos não enviados e ordem/lente, isolando outra conta', async () => {
    await gravarPreferencias(banco.db, usuarioA, { ordemLista: 'POR_NIVEL', lente: 'ODDS' })
    await gravarPreferenciasExperiencia(banco.db, usuarioA, { somHabilitado: false, volume: 25 })
    await gravarPreferenciasExperiencia(banco.db, usuarioA, { intensidade: 'INTENSAS' })
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).preferencias).toEqual({
      intensidade: 'INTENSAS',
      somHabilitado: false,
      volume: 25,
      apenasAcompanhados: false,
    })
    expect(await preferenciasDoUsuario(banco.db, usuarioA)).toEqual({
      ordemLista: 'POR_NIVEL',
      lente: 'ODDS',
    })
    expect(await estadoExperienciaDoUsuario(banco.db, usuarioB)).toEqual(estadoExperienciaPadrao())
  })
  it('acompanhar reexibe apenas nessa conta e retry não duplica; unfollow não oculta', async () => {
    await ocultarJogador(banco.db, usuarioB, jogadorId)
    const entrada = { tipo: 'JOGADOR', id: jogadorId, acompanhar: true } as const
    await definirAcompanhamento(banco.db, usuarioA, entrada)
    await definirAcompanhamento(banco.db, usuarioA, entrada)
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).jogadoresAcompanhados).toEqual([
      jogadorId,
    ])
    expect(await jogadoresOcultosDe(banco.db, usuarioA)).toEqual(new Set())
    expect(await jogadoresOcultosDe(banco.db, usuarioB)).toEqual(new Set([jogadorId]))
    await definirAcompanhamento(banco.db, usuarioA, { ...entrada, acompanhar: false })
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).jogadoresAcompanhados).toEqual([])
    expect(await jogadoresOcultosDe(banco.db, usuarioA)).toEqual(new Set())
  })
  it('seguir time não segue elenco nem altera alertas', async () => {
    await definirAcompanhamento(banco.db, usuarioA, { tipo: 'TIME', id: timeId, acompanhar: true })
    const estado = await estadoExperienciaDoUsuario(banco.db, usuarioA)
    expect(estado.timesAcompanhados).toEqual([timeId])
    expect(estado.jogadoresAcompanhados).toEqual([])
    expect(estado.preferencias.apenasAcompanhados).toBe(false)
  })
  it('exclusões idempotentes são independentes de seguir e de ocultar', async () => {
    const entrada = { tipo: 'JOGADOR', id: jogadorId, silenciado: true } as const
    await definirExclusaoAlerta(banco.db, usuarioA, entrada)
    await definirExclusaoAlerta(banco.db, usuarioA, entrada)
    await definirExclusaoAlerta(banco.db, usuarioA, {
      tipo: 'ATRIBUTO',
      id: 'REBOTES',
      silenciado: true,
    })
    await definirAcompanhamento(banco.db, usuarioA, {
      tipo: 'JOGADOR',
      id: jogadorId,
      acompanhar: true,
    })
    const estado = await estadoExperienciaDoUsuario(banco.db, usuarioA)
    expect(estado.jogadoresSilenciados).toEqual([jogadorId])
    expect(estado.atributosSilenciados).toEqual(['REBOTES'])
    expect(await jogadoresOcultosDe(banco.db, usuarioA)).toEqual(new Set())
    await definirExclusaoAlerta(banco.db, usuarioA, { ...entrada, silenciado: false })
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).jogadoresSilenciados).toEqual([])
  })
  it('valida antes de gravar e alvo inexistente falha sem remover ocultos', async () => {
    await expect(
      gravarPreferenciasExperiencia(banco.db, usuarioA, { volume: NaN }),
    ).rejects.toThrow()
    await expect(
      definirAcompanhamento(banco.db, usuarioA, {
        tipo: 'JOGADOR',
        id: 'inválido',
        acompanhar: true,
      }),
    ).rejects.toThrow()
    await expect(
      definirAcompanhamento(banco.db, usuarioA, {
        tipo: 'JOGADOR',
        id: '11111111-1111-4111-8111-111111111111',
        acompanhar: true,
      }),
    ).rejects.toThrow('não encontrado')
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).preferencias.volume).toBe(25)
  })
  it('constraints protegem escrita direta de volume e intensidade inválidos', async () => {
    await expect(
      banco.db
        .update(preferenciasUsuario)
        .set({ volume: -1 })
        .where(eq(preferenciasUsuario.usuarioId, usuarioA)),
    ).rejects.toThrow()
    await expect(
      banco.db
        .update(preferenciasUsuario)
        .set({ intensidade: 'INVALIDA' })
        .where(eq(preferenciasUsuario.usuarioId, usuarioA)),
    ).rejects.toThrow()
  })
  it('apagar conta remove preferências e relações sem afetar outra conta', async () => {
    await banco.db.delete(usuarios).where(eq(usuarios.id, usuarioA))
    expect(await estadoExperienciaDoUsuario(banco.db, usuarioA)).toEqual(estadoExperienciaPadrao())
    expect(await jogadoresOcultosDe(banco.db, usuarioB)).toEqual(new Set([jogadorId]))
  })
})
