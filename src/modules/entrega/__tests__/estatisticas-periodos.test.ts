import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  identidadesJogador,
  jogadores,
  jogos,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import { telaDoJogador } from '../estatisticas/jogador'
import { buscar } from '../estatisticas/busca'

const calendario = { mesInicio: 10, formato: 'dois_anos', fuso: 'UTC' } as const
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string
let jogadorComLacunas: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, fora] = await banco.db
    .insert(times)
    .values([
      { sigla: 'BOS', nome: 'Boston Celtics' },
      { sigla: 'NYK', nome: 'New York Knicks' },
    ])
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Atleta Teste', timeId: casa!.id })
    .returning()
  jogadorId = jogador!.id
  await banco.db
    .insert(identidadesJogador)
    .values({ jogadorId, provedor: 'nba', idExterno: '1628973' })
  const partidas = await banco.db
    .insert(jogos)
    .values(
      Array.from({ length: 30 }, (_, i) => ({
        timeCasaId: casa!.id,
        timeVisitanteId: fora!.id,
        dataHoraUtc: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T20:00:00Z`),
        dataReferencia: `2026-01-${String(i + 1).padStart(2, '0')}`,
        status: 'ENCERRADO' as const,
      })),
    )
    .returning()
  await banco.db.insert(estatisticasJogo).values(
    partidas.map((jogo, i) => ({
      jogoId: jogo.id,
      jogadorId,
      minutos: '30',
      pontos: i + 1,
      rebotesTotal: 2,
      assistencias: 1,
    })),
  )
  // A média materializada é deliberadamente diferente: resumo e gráfico
  // precisam ler as mesmas partidas, sem herdar outro recorte.
  await banco.db.insert(mediasJogador).values({
    jogadorId,
    temporada: '2025-26',
    janela: 'TEMPORADA',
    jogos: 30,
    ppg: '99',
    rpg: '99',
    apg: '99',
  })
  const [outro] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Outro Atleta', timeId: casa!.id })
    .returning()
  jogadorComLacunas = outro!.id
  await banco.db.insert(estatisticasJogo).values([
    { jogoId: partidas[0]!.id, jogadorId: jogadorComLacunas, minutos: '20', pontos: 0 },
    { jogoId: partidas[1]!.id, jogadorId: jogadorComLacunas, minutos: '0', pontos: 0 },
    { jogoId: partidas[2]!.id, jogadorId: jogadorComLacunas, minutos: null, pontos: 0 },
  ])
})

afterAll(async () => {
  await banco.fechar()
})

describe('Stats · recorte explícito', () => {
  it('últimos 10 usa as mesmas dez partidas no histórico e no resumo', async () => {
    const tela = await telaDoJogador(banco.db, jogadorId, {
      temporada: '2025-26',
      calendario,
      periodo: '10',
    })
    expect(tela!.historico.map((j) => j.pontos)).toEqual([30, 29, 28, 27, 26, 25, 24, 23, 22, 21])
    expect(tela!.perfilNumeros.ataque.pontos).toBe(25.5)
    expect(tela!.jogosDisputados).toBe(10)
  })

  it('últimos 5 e temporada inteira não herdam o limite de 25 partidas', async () => {
    const cinco = await telaDoJogador(banco.db, jogadorId, {
      temporada: '2025-26',
      calendario,
      periodo: '5',
    })
    const temporada = await telaDoJogador(banco.db, jogadorId, {
      temporada: '2025-26',
      calendario,
      periodo: 'temporada',
    })
    expect(cinco!.historico).toHaveLength(5)
    expect(cinco!.perfilNumeros.ataque.pontos).toBe(28)
    expect(temporada!.historico).toHaveLength(30)
    expect(temporada!.perfilNumeros.ataque.pontos).toBe(15.5)
    expect(temporada!.historicoCortado).toBe(false)
  })

  it('menos de 5 preserva DNP, pendente e zero real sem preencher partidas ausentes', async () => {
    const tela = await telaDoJogador(banco.db, jogadorComLacunas, {
      temporada: '2025-26',
      calendario,
      periodo: '5',
    })
    expect(tela!.historico).toHaveLength(3)
    expect(tela!.historico.map((l) => l.estado)).toEqual(['PENDENTE', 'DNP', 'CONFERIDO'])
    expect(tela!.recorte).toEqual({
      periodo: '5',
      disponiveis: 3,
      conferidos: 1,
      dnp: 1,
      pendentes: 1,
    })
    expect(tela!.perfilNumeros.ataque.pontos).toBe(0)
  })

  it('perfil e busca oficial/alias levam ao mesmo UUID', async () => {
    const tela = await telaDoJogador(banco.db, jogadorId, {
      temporada: '2025-26',
      calendario,
      periodo: '10',
    })
    expect(tela!.perfil.nome).toBe('Jalen Brunson')
    for (const termo of ['Atleta Teste', 'Jalen Brunson', 'Brunson']) {
      const achados = await buscar(banco.db, termo, { apenas: 'JOGADOR' })
      expect(achados[0]).toMatchObject({ id: jogadorId, nome: 'Jalen Brunson' })
    }
  })
})
