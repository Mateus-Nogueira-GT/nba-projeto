import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { apitos, jogadores, jogos, times } from '../../dominio/db/schema'
import { apitosDoJogador } from '../estatisticas/jogador'

/**
 * A ABA DE ESTATÍSTICAS NÃO PODE ENTREGAR O SINAL DO DIA.
 *
 * `/estatisticas/jogador/[id]` é pública — não exige conta. A seção "Apitos da
 * estratégia" se descreve como o que a estratégia fez com o jogador
 * CONFERIDO, mas a consulta filtrava só por estratégia e jogador: devolvia
 * também o apito de hoje, com o jogo ainda por começar. Atributo e linha
 * exatos, de graça, na mesma noite — que é precisamente o que a Lista Secreta
 * vende.
 *
 * O corte é o jogo ter ENCERRADO. Não é escolha de produto: é o que a própria
 * seção diz mostrar. `AGUARDANDO_OFICIAL` continua existindo para o caso
 * legítimo — o jogo acabou e o box score ainda não chegou.
 */
const ONTEM = '2026-09-05'
const HOJE = '2026-09-06'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogadorId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa, fora] = await banco.db
    .insert(times)
    .values([
      { sigla: 'AAA', nome: 'Casa' },
      { sigla: 'BBB', nome: 'Fora' },
    ])
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Sujeito do teste', timeId: casa!.id })
    .returning()
  jogadorId = jogador!.id

  // Três jogos, um por status: o de ontem terminou; o de hoje ainda vai
  // começar; e há um em andamento — o sinal dele também já é público.
  const [encerrado, agendado, aoVivo] = await banco.db
    .insert(jogos)
    .values([
      {
        dataReferencia: ONTEM,
        dataHoraUtc: new Date('2026-09-05T23:00:00.000Z'),
        timeCasaId: casa!.id,
        timeVisitanteId: fora!.id,
        status: 'ENCERRADO',
      },
      {
        dataReferencia: HOJE,
        dataHoraUtc: new Date('2026-09-06T23:00:00.000Z'),
        timeCasaId: casa!.id,
        timeVisitanteId: fora!.id,
        status: 'AGENDADO',
      },
      {
        dataReferencia: HOJE,
        dataHoraUtc: new Date('2026-09-06T22:00:00.000Z'),
        timeCasaId: fora!.id,
        timeVisitanteId: casa!.id,
        status: 'AO_VIVO',
      },
    ])
    .returning()

  await banco.db.insert(apitos).values([
    {
      rulesetVersao: 'v1',
      jogoId: encerrado!.id,
      jogadorId,
      atributo: 'PONTOS',
      estrategia: 'LISTA_SECRETA',
      nivelJogador: 'MVP',
      nivelApito: 3,
      linha: 20,
    },
    {
      rulesetVersao: 'v1',
      jogoId: agendado!.id,
      jogadorId,
      atributo: 'REBOTES',
      estrategia: 'LISTA_SECRETA',
      nivelJogador: 'MVP',
      nivelApito: 3,
      linha: 4,
    },
    {
      rulesetVersao: 'v1',
      jogoId: aoVivo!.id,
      jogadorId,
      atributo: 'ASSISTENCIAS',
      estrategia: 'LISTA_SECRETA',
      nivelJogador: 'MVP',
      nivelApito: 2,
      linha: 7,
    },
  ])
}, 120_000)

afterAll(async () => banco?.fechar())

describe('apitosDoJogador não entrega o sinal de jogo que ainda não terminou', () => {
  it('devolve só o apito do jogo ENCERRADO', async () => {
    const lista = await apitosDoJogador(banco.db, jogadorId, 50)
    expect(lista).toHaveLength(1)
    expect(lista[0]!.atributo).toBe('PONTOS')
    expect(lista[0]!.linhaMaisBaixa).toBe(20)
  })

  it('o apito do jogo AGENDADO não aparece — é o sinal de hoje, pré-live', async () => {
    const lista = await apitosDoJogador(banco.db, jogadorId, 50)
    // Atributo E linha: é o par que a Lista Secreta vende.
    expect(lista.some((a) => a.atributo === 'REBOTES')).toBe(false)
    expect(lista.some((a) => a.linhaMaisBaixa === 4)).toBe(false)
  })

  it('o apito do jogo AO_VIVO também não aparece — foi publicado antes da bola subir', async () => {
    const lista = await apitosDoJogador(banco.db, jogadorId, 50)
    expect(lista.some((a) => a.atributo === 'ASSISTENCIAS')).toBe(false)
    expect(lista.some((a) => a.linhaMaisBaixa === 7)).toBe(false)
  })
})
