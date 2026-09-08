import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { avaliar } from '../../motor'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import {
  apitos,
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mapaJogadores,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../db/schema'
import { montarFatos } from '../fatos'
import { montarFatosDoJogo } from '../fatos-ao-vivo'
import { calendarioDoRuleset } from '../temporada'
import { bancoDeTeste } from './ajuda-banco'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const calendario = calendarioDoRuleset(ruleset)
const HOJE = '2026-01-15'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let timeId: string
let adversarioId: string
let jogoId: string
let brunsonId: string
let townsId: string
let hartId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(apitos)
  await banco.db.delete(estatisticasJogo)
  await banco.db.delete(lesoesEscalacao)
  await banco.db.delete(mapaJogadores)
  await banco.db.delete(mediasJogador)
  await banco.db.delete(niveis)
  await banco.db.delete(niveisVersao)
  await banco.db.delete(jogos)
  await banco.db.delete(jogadores)
  await banco.db.delete(times)

  const [time] = await banco.db.insert(times).values({ sigla: 'NYK', nome: 'Knicks' }).returning()
  const [adversario] = await banco.db
    .insert(times)
    .values({ sigla: 'ADV', nome: 'Adversário da fixture' })
    .returning()
  timeId = time!.id
  adversarioId = adversario!.id

  const [versao] = await banco.db
    .insert(niveisVersao)
    .values({ versao: 'auditoria-fatos', ativa: true })
    .returning()
  const criados = await banco.db
    .insert(jogadores)
    .values(['Brunson', 'Towns', 'Hart'].map((nomeCompleto) => ({ nomeCompleto, timeId })))
    .returning()
  brunsonId = criados[0]!.id
  townsId = criados[1]!.id
  hartId = criados[2]!.id

  // Recorte de três jogadores das listas do DOCX: pontos P10-14 e rebotes
  // P360-363. Towns é segundo em pontos e primeiro em rebotes; Hart é quinto
  // em pontos e segundo em rebotes. Não há classificação inventada de Brunson.
  await banco.db.insert(niveis).values([
    {
      niveisVersaoId: versao!.id,
      jogadorId: brunsonId,
      timeId,
      atributo: 'PONTOS',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: versao!.id,
      jogadorId: townsId,
      timeId,
      atributo: 'PONTOS',
      nivel: 'ALL_STAR',
      posicaoHierarquia: 2,
    },
    {
      niveisVersaoId: versao!.id,
      jogadorId: hartId,
      timeId,
      atributo: 'PONTOS',
      nivel: 'SUPORTE',
      posicaoHierarquia: 5,
    },
    {
      niveisVersaoId: versao!.id,
      jogadorId: townsId,
      timeId,
      atributo: 'REBOTES',
      nivel: 'MVP',
      posicaoHierarquia: 1,
    },
    {
      niveisVersaoId: versao!.id,
      jogadorId: hartId,
      timeId,
      atributo: 'REBOTES',
      nivel: 'ALL_STAR',
      posicaoHierarquia: 2,
    },
  ])
  await banco.db.insert(mediasJogador).values(
    criados.map((j) => ({
      jogadorId: j.id,
      temporada: '2025-26',
      janela: 'TEMPORADA' as const,
      jogos: 20,
      ppg: '30.00',
      rpg: '10.00',
    })),
  )
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(`${HOJE}T23:00:00Z`),
      dataReferencia: HOJE,
      timeCasaId: timeId,
      timeVisitanteId: adversarioId,
    })
    .returning()
  jogoId = jogo!.id
})

async function historico(data: string, pontos: number, minutos: string | null) {
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(`${data}T23:00:00Z`),
      dataReferencia: data,
      timeCasaId: timeId,
      timeVisitanteId: adversarioId,
      status: 'ENCERRADO',
    })
    .returning()
  await banco.db.insert(estatisticasJogo).values({
    jogoId: jogo!.id,
    jogadorId: brunsonId,
    minutos,
    pontos,
    rebotesTotal: 0,
    assistencias: 0,
  })
}

async function pontosDoPrimeiroJogador() {
  const fatos = await montarFatos(banco.db, HOJE, calendario)
  return avaliar(fatos, ruleset).filter(
    (a) => a.jogadorId === brunsonId && a.atributo === 'PONTOS' && a.estrategia === 'LISTA_SECRETA',
  )
}

describe('auditoria do contrato entre dados persistidos e motor', () => {
  it.each(['0.00', null])('DNP com minutos %s não acrescenta uma oscilação', async (minutos) => {
    // P2: um jogo abaixo seguido de DNP continua sendo nível 1, não nível 2.
    await historico('2026-01-12', 20, '30.00')
    await historico('2026-01-14', 0, minutos)

    const sinais = await pontosDoPrimeiroJogador()
    expect(sinais.length).toBeGreaterThan(0)
    expect([...new Set(sinais.map((a) => a.nivelApito))]).toEqual([1])
  })

  it('produção com zero minuto interrompe a sequência quando supera o limiar', async () => {
    // A proteção do DNP não pode apagar a linha de quem produziu: a fonte
    // pode arredondar minutos. O último jogo acima do limiar encerra a sequência.
    await historico('2026-01-12', 20, '30.00')
    await historico('2026-01-14', 27, '0.00')
    expect(await pontosDoPrimeiroJogador()).toEqual([])
  })

  it('usa a hierarquia de rebotes para o desfalque de Towns', async () => {
    await banco.db.insert(lesoesEscalacao).values({ jogoId, jogadorId: townsId, status: 'FORA' })
    const fatos = await montarFatos(banco.db, HOJE, calendario)
    const sinais = avaliar(fatos, ruleset).filter((a) => a.estrategia === 'LISTA_SECRETA')

    // DOCX P347-348: Towns fora beneficia o próximo de REBOTES. Brunson
    // continua em quadra e impede OPD na hierarquia distinta de PONTOS.
    expect(sinais.filter((a) => a.atributo === 'PONTOS')).toEqual([])
    expect(
      sinais.some(
        (a) => a.jogadorId === hartId && a.atributo === 'REBOTES' && a.opdOrigemNivel === 3,
      ),
    ).toBe(true)
  })

  it('não importa uma OPD de rebotes como origem pré-live de pontos', async () => {
    await banco.db.insert(apitos).values({
      rulesetVersao: 'auditoria',
      jogoId,
      jogadorId: hartId,
      estrategia: 'LISTA_SECRETA',
      metodo: 'OPD',
      atributo: 'REBOTES',
      nivelJogador: 'ALL_STAR',
      nivelApito: 3,
      opdOrigemNivel: 3,
      linha: 6,
    })

    const fatos = await montarFatosDoJogo(banco.db, jogoId, calendario)
    expect(fatos).not.toBeNull()
    expect(fatos!.opdPreLive.has(hartId)).toBe(false)
  })

  it('preserva a origem da OPD quando a oscilação elevou o nível combinado', async () => {
    // docs/05: o apito combina max(OPD, oscilação), mas a origem editorial
    // fica à parte. A OPD N1 não pode reaparecer como N3 no Fire Live.
    await banco.db.insert(apitos).values({
      rulesetVersao: 'auditoria',
      jogoId,
      jogadorId: hartId,
      estrategia: 'LISTA_SECRETA',
      metodo: 'OPD',
      atributo: 'PONTOS',
      nivelJogador: 'SUPORTE',
      nivelApito: 3,
      opdOrigemNivel: 1,
      linha: 10,
    })

    const fatos = await montarFatosDoJogo(banco.db, jogoId, calendario)
    expect(fatos).not.toBeNull()
    expect(fatos!.opdPreLive.get(hartId)).toBe(1)
  })

  it('aplica a exceção nominal de Luka ao UUID confirmado pela curadoria', async () => {
    // O jogador desta fixture assume a identidade de Luka somente neste
    // cenário; não se cria nem se altera mapa de produção.
    await banco.db
      .update(jogadores)
      .set({ nomeCompleto: 'Luka Doncic' })
      .where(eq(jogadores.id, brunsonId))
    await banco.db.insert(mapaJogadores).values({
      nomeNaLista: 'Luka Doncic',
      jogadorId: brunsonId,
      provedor: 'auditoria',
      confirmadoPor: 'fixture',
      confirmadoEm: new Date('2026-01-01T12:00:00Z'),
    })
    await historico('2026-01-14', 24, '30.00')

    // Média 30: delta nominal 7 exige <=23, enquanto o delta MVP 6 apitaria 24.
    expect(await pontosDoPrimeiroJogador()).toEqual([])
  })
})
