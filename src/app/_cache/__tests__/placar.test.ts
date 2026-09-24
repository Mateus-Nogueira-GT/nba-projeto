import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O PLACAR DO NIP EM CACHE (Tarefa 6 do front v2).
 *
 * `conferirRodadas` (30 dias de apitos × jogos × estatísticas) rodava em TODA
 * visita a Resultados, e a página pública `/placar` (Tarefa 11) vai pedir o
 * mesmo número. `unstable_cache` falso com a semântica que importa (mesmo de
 * `rodada.test.ts`): guarda pela chave + argumentos, e o valor atravessa JSON
 * como o de verdade.
 */
const loja = new Map<string, unknown>()
const registros: { chaves: string[]; tags: string[]; revalidate: number }[] = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (
      fn: (...a: unknown[]) => Promise<unknown>,
      chaves: string[],
      opcoes: { tags: string[]; revalidate: number },
    ) =>
    async (...args: unknown[]) => {
      registros.push({ chaves, tags: opcoes.tags, revalidate: opcoes.revalidate })
      const k = JSON.stringify([chaves, args])
      if (!loja.has(k)) loja.set(k, JSON.parse(JSON.stringify(await fn(...args))))
      return loja.get(k)
    },
}))

const conferirRodadas = vi.fn()
vi.mock('@/modules/entrega/resultados', () => ({
  conferirRodadas: (...a: unknown[]) => conferirRodadas(...a),
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

import { DIAS_DO_PLACAR, montarPlacar } from '@/features/resultados/placar'
import type { DiaConferido } from '@/modules/entrega/resultados'
import { TAG_LATERAL } from '../lateral'
import { placarCacheado, realizadoDaJanelaCacheado } from '../placar'

const FAIXAS = [
  { de: 80, grau: 5, rotulo: 'Confiança muito alta', rotulo_curto: 'Muito alta', cor_token: 'x' },
  { de: 60, grau: 4, rotulo: 'Confiança alta' },
]

const DIAS: DiaConferido[] = [
  {
    dataReferencia: '2026-11-02',
    acertos: 1,
    conferidos: 2,
    jogadores: [
      {
        jogadorId: 'j1',
        atributo: 'PONTOS',
        fez: 27,
        nivelJogador: 'MVP',
        bateuLinhaMaisBaixa: true,
        linhas: [
          { linha: 20, confianca: 85, bateu: true },
          { linha: 25, confianca: 65, bateu: false },
        ],
      },
      {
        jogadorId: 'j2',
        atributo: 'PONTOS',
        fez: null,
        nivelJogador: 'SUPORTE',
        bateuLinhaMaisBaixa: false,
        linhas: [{ linha: 10, confianca: 62, bateu: false }],
      },
    ],
  } as unknown as DiaConferido,
]

beforeEach(() => {
  loja.clear()
  registros.length = 0
  conferirRodadas.mockReset()
})

describe('placarCacheado', () => {
  it('é o placar de montarPlacar sobre a conferência da janela — nada inventado', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    const placar = await placarCacheado('2026-11-03', FAIXAS)
    expect(conferirRodadas).toHaveBeenCalledWith({}, '2026-11-03', DIAS_DO_PLACAR)
    // Sem `rotulo_curto` no ruleset, a faixa usa o `rotulo` inteiro (Task 1).
    expect(placar).toEqual(
      montarPlacar(DIAS, [
        { de: 80, grau: 5, rotulo_curto: 'Muito alta' },
        { de: 60, grau: 4, rotulo_curto: 'Confiança alta' },
      ]),
    )
  })

  it('a segunda visita da mesma noite não vai ao banco', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    await placarCacheado('2026-11-03', FAIXAS)
    await placarCacheado('2026-11-03', FAIXAS)
    expect(conferirRodadas).toHaveBeenCalledTimes(1)
    // Outra rodada é outra chave.
    await placarCacheado('2026-11-02', FAIXAS)
    expect(conferirRodadas).toHaveBeenCalledTimes(2)
  })

  it('a chave é o recorte das faixas, não o objeto do ruleset inteiro', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    await placarCacheado('2026-11-03', FAIXAS)
    // Um campo que o placar não usa (a cor) não pode abrir uma chave nova.
    await placarCacheado('2026-11-03', FAIXAS.map((f) => ({ ...f, cor_token: 'outra' })))
    expect(conferirRodadas).toHaveBeenCalledTimes(1)
  })

  it('tag da lateral e uma hora — os crons que fecham a rodada já a invalidam', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    await placarCacheado('2026-11-03', FAIXAS)
    expect(registros.at(-1)).toMatchObject({ tags: [TAG_LATERAL], revalidate: 3600 })
  })
})

describe('realizadoDaJanelaCacheado (o "Seu mês" da Gestão)', () => {
  it('é o que cada apitado FEZ na janela, pela chave dia|jogador|atributo — DNP é null', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    const feito = await realizadoDaJanelaCacheado('2026-11-03', 30)
    expect(conferirRodadas).toHaveBeenCalledWith({}, '2026-11-03', 30)
    expect(feito).toEqual({ '2026-11-02|j1|PONTOS': 27, '2026-11-02|j2|PONTOS': null })
  })

  it('a segunda visita da mesma rodada não vai ao banco; outra rodada é outra chave', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    await realizadoDaJanelaCacheado('2026-11-03', 30)
    await realizadoDaJanelaCacheado('2026-11-03', 30)
    expect(conferirRodadas).toHaveBeenCalledTimes(1)
    await realizadoDaJanelaCacheado('2026-11-04', 30)
    expect(conferirRodadas).toHaveBeenCalledTimes(2)
    await realizadoDaJanelaCacheado('2026-11-04', 7)
    expect(conferirRodadas).toHaveBeenCalledTimes(3)
  })

  it('tag da lateral e uma hora', async () => {
    conferirRodadas.mockResolvedValue(DIAS)
    await realizadoDaJanelaCacheado('2026-11-03', 30)
    expect(registros.at(-1)).toMatchObject({ tags: [TAG_LATERAL], revalidate: 3600 })
  })
})
