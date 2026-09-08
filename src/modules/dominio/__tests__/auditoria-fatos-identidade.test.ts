import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'

import { avaliar } from '../../motor'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import {
  estatisticasJogo,
  jogadores,
  jogos,
  mapaJogadores,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../db/schema'
import { montarFatos } from '../fatos'
import { calendarioDoRuleset } from '../temporada'
import { bancoDeTeste } from './ajuda-banco'

const ruleset = carregarRuleset(yamlBruto)
const calendario = calendarioDoRuleset(ruleset)
const HOJE = '2026-01-15'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let historicoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, visitante] = await banco.db
    .insert(times)
    .values([
      { sigla: 'LAL', nome: 'Lakers' },
      { sigla: 'ADV', nome: 'Adversário' },
    ])
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({
      nomeCompleto: 'Luka Doncic',
      timeId: casa!.id,
    })
    .returning()
  jogadorId = jogador!.id
  const [versao] = await banco.db
    .insert(niveisVersao)
    .values({
      versao: 'auditoria-identidade',
      ativa: true,
    })
    .returning()
  await banco.db.insert(niveis).values({
    niveisVersaoId: versao!.id,
    jogadorId,
    timeId: casa!.id,
    atributo: 'PONTOS',
    nivel: 'MVP',
    posicaoHierarquia: 1,
  })
  await banco.db.insert(mediasJogador).values({
    jogadorId,
    temporada: '2025-26',
    janela: 'TEMPORADA',
    jogos: 20,
    ppg: '30.00',
  })
  const [anterior] = await banco.db
    .insert(jogos)
    .values({
      dataReferencia: '2026-01-14',
      dataHoraUtc: new Date('2026-01-14T23:00:00Z'),
      timeCasaId: casa!.id,
      timeVisitanteId: visitante!.id,
      status: 'ENCERRADO',
    })
    .returning()
  historicoId = anterior!.id
  await banco.db.insert(jogos).values({
    dataReferencia: HOJE,
    dataHoraUtc: new Date(`${HOJE}T23:00:00Z`),
    timeCasaId: casa!.id,
    timeVisitanteId: visitante!.id,
  })
  await banco.db.insert(estatisticasJogo).values({
    jogoId: historicoId,
    jogadorId,
    pontos: 24,
    minutos: '30.00',
  })
})

afterAll(async () => banco.fechar())

beforeEach(async () => {
  await banco.db.delete(mapaJogadores)
  await banco.db.insert(mapaJogadores).values({
    jogadorId,
    nomeNaLista: 'Luka Doncic',
    provedor: 'api-sports',
    confirmadoPor: 'curador',
    confirmadoEm: new Date('2026-01-01T12:00:00Z'),
  })
  await banco.db
    .update(estatisticasJogo)
    .set({
      pontos: 24,
      minutos: '30.00',
      roubos: 0,
      bloqueios: 0,
      cestasT: 0,
    })
    .where(eq(estatisticasJogo.jogoId, historicoId))
})

async function sinais() {
  return avaliar(await montarFatos(banco.db, HOJE, calendario), ruleset).filter(
    (a) => a.jogadorId === jogadorId && a.estrategia === 'LISTA_SECRETA',
  )
}

describe('identidade reconciliada não depende da última casa consultada', () => {
  it('controle: a identidade editorial confirmada aplica delta 7 sobre o UUID', async () => {
    expect(await sinais()).toEqual([])
  })

  it('alias de casa confirmado depois não desativa a exceção editorial de Luka', async () => {
    await banco.db.insert(mapaJogadores).values({
      jogadorId,
      nomeNaLista: 'L. Doncic',
      provedor: 'casa:betmgm',
      confirmadoPor: 'curador',
      confirmadoEm: new Date('2026-01-14T12:00:00Z'),
    })
    // Os dois nomes continuam reconciliados ao MESMO jogador. Confirmar o
    // nome de uma cotação não muda a regra delta=7 da lista do CJ.
    expect(await sinais()).toEqual([])
  })

  it('controle: um alias pendente nunca substitui a identidade confirmada', async () => {
    await banco.db.insert(mapaJogadores).values({
      jogadorId,
      nomeNaLista: 'L. Doncic',
      provedor: 'casa:betmgm',
    })
    expect(await sinais()).toEqual([])
  })
})

describe('eventos de jogo comprovam participação mesmo sem PTS/REB/AST', () => {
  it.each(['roubos', 'bloqueios', 'cestasT'] as const)(
    '%s positivo impede tratar a linha como DNP',
    async (campo) => {
      await banco.db
        .update(estatisticasJogo)
        .set({
          pontos: 0,
          minutos: '0.00',
          [campo]: 1,
        })
        .where(eq(estatisticasJogo.jogoId, historicoId))
      const fatos = await montarFatos(banco.db, HOJE, calendario)
      const jogador = fatos.times.flatMap((t) => t.jogadores).find((j) => j.id === jogadorId)
      expect(jogador?.historico[0]?.jogou).toBe(true)
    },
  )
})
