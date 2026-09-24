import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A ÚLTIMA NOITE E O HIATO EM CACHE (revisão da Tarefa 3 do front v2).
 *
 * `unstable_cache` falso com a semântica que importa (mesmo de `feed.test.ts`):
 * guarda pela chave + argumentos, e o valor atravessa JSON como o de verdade.
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

const ultimaRodadaConferida = vi.fn()
const recapDaNoite = vi.fn()
const estadoDaTemporada = vi.fn()
vi.mock('@/modules/entrega/resultados', () => ({
  ultimaRodadaConferida: (...a: unknown[]) => ultimaRodadaConferida(...a),
  recapDaNoite: (...a: unknown[]) => recapDaNoite(...a),
}))
vi.mock('@/modules/entrega/estatisticas/temporadas', () => ({
  estadoDaTemporada: (...a: unknown[]) => estadoDaTemporada(...a),
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

import { TAG_LATERAL } from '../lateral'
import { estadoDaTemporadaCacheado, resumoDaNoiteCacheado } from '../rodada'

// O recap de verdade traz datas aninhadas (porJogo, atualizacao): o cache
// guarda só o recorte da tela, sem nenhuma — e volta idêntico do JSON.
const RECAP = {
  dataReferencia: '2026-11-02',
  publicados: 9,
  conferidos: 8,
  bateram: 6,
  taxa: 0.75,
  noiteEncerrada: true,
  apitoDaNoite: { nome: 'Fulano', fotoUrl: null, fez: 31, atributo: 'PONTOS', jogoId: 'j', extra: 1 },
  porJogo: [{ jogo: { dataHoraUtc: new Date('2026-11-02T23:00:00Z') }, cards: [] }],
  atualizacao: { em: new Date('2026-11-03T03:00:00Z') },
}

const RULESET = {
  temporada: { mes_inicio: 10, formato: 'dois_anos' as const, minimo_jogos_para_exibir: 50 },
  rodada: { fuso: 'America/Sao_Paulo' },
  // O resto do ruleset não pode virar chave do cache.
  outra_coisa: { enorme: true },
}

beforeEach(() => {
  loja.clear()
  registros.length = 0
  ultimaRodadaConferida.mockReset()
  recapDaNoite.mockReset()
  estadoDaTemporada.mockReset()
})

describe('resumoDaNoiteCacheado', () => {
  it('a segunda visita do dia não vai ao banco', async () => {
    ultimaRodadaConferida.mockResolvedValue('2026-11-02')
    recapDaNoite.mockResolvedValue(RECAP)
    await resumoDaNoiteCacheado('2026-11-03')
    await resumoDaNoiteCacheado('2026-11-03')
    expect(ultimaRodadaConferida).toHaveBeenCalledTimes(1)
    expect(recapDaNoite).toHaveBeenCalledTimes(1)
  })

  it('guarda só o recorte da coluna, sem Date — e ele sobrevive ao JSON do cache', async () => {
    ultimaRodadaConferida.mockResolvedValue('2026-11-02')
    recapDaNoite.mockResolvedValue(RECAP)
    await resumoDaNoiteCacheado('2026-11-03')
    const segunda = await resumoDaNoiteCacheado('2026-11-03')
    expect(segunda).toEqual({
      ultima: '2026-11-02',
      recap: {
        dataReferencia: '2026-11-02',
        noiteEncerrada: true,
        bateram: 6,
        conferidos: 8,
        taxa: 0.75,
        apitoDaNoite: { nome: 'Fulano', fotoUrl: null, fez: 31, atributo: 'PONTOS' },
      },
    })
  })

  it('sem noite conferida não pede o recap', async () => {
    ultimaRodadaConferida.mockResolvedValue(null)
    expect(await resumoDaNoiteCacheado('2026-10-02')).toEqual({ ultima: null, recap: null })
    expect(recapDaNoite).not.toHaveBeenCalled()
  })
})

describe('estadoDaTemporadaCacheado', () => {
  it('uma consulta por dia, com só o recorte do ruleset na chave', async () => {
    estadoDaTemporada.mockResolvedValue({
      exibida: '2025-26',
      doCalendario: '2026-27',
      emHiato: true,
      proximoJogo: null,
    })
    await estadoDaTemporadaCacheado('2026-10-02', RULESET)
    const segunda = await estadoDaTemporadaCacheado('2026-10-02', RULESET)
    expect(estadoDaTemporada).toHaveBeenCalledTimes(1)
    expect(segunda).toMatchObject({ emHiato: true, exibida: '2025-26' })
    const [, rulesetPassado] = estadoDaTemporada.mock.calls[0]!
    expect(rulesetPassado).not.toHaveProperty('outra_coisa')
    // O dia seguinte é outra chave.
    await estadoDaTemporadaCacheado('2026-10-03', RULESET)
    expect(estadoDaTemporada).toHaveBeenCalledTimes(2)
  })
})

describe('forma', () => {
  it('as duas leituras usam a tag da lateral e uma hora', async () => {
    ultimaRodadaConferida.mockResolvedValue(null)
    estadoDaTemporada.mockResolvedValue({ exibida: 'x', doCalendario: 'x', emHiato: false, proximoJogo: null })
    await resumoDaNoiteCacheado('2026-11-03')
    await estadoDaTemporadaCacheado('2026-11-03', RULESET)
    expect(registros.map((r) => [r.tags, r.revalidate])).toEqual([
      [[TAG_LATERAL], 3600],
      [[TAG_LATERAL], 3600],
    ])
  })

  it('a Lista, o resumo e a abertura leem pela versão cacheada', () => {
    const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const resumo = semComentarios(readFileSync('src/features/lista/ResumoDaRodada.tsx', 'utf8'))
    expect(resumo).toContain('resumoDaNoiteCacheado(')
    expect(resumo).not.toMatch(/[^a-zA-Z](recapDaNoite|ultimaRodadaConferida)\(/)
    // `/abrir` é a primeira visita de TODA abertura do PWA, e no hiato (o
    // lançamento cai dentro dele) toda abertura perguntava a temporada ao
    // banco: a mesma leitura da Lista e do Ao Vivo, pelo mesmo cache.
    for (const caminho of ['src/features/lista/carregar.ts', 'src/app/abrir/page.tsx']) {
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      expect(fonte, caminho).toContain('estadoDaTemporadaCacheado(')
      expect(fonte, caminho).not.toMatch(/[^a-zA-Z]estadoDaTemporada\(/)
    }
  })
})
