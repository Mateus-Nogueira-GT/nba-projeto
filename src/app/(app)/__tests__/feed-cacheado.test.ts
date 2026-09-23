import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `unstable_cache` falso com a semântica que importa: guarda por chave,
 * e o valor atravessa JSON — como o de verdade (unstable-cache.js:24,182).
 *
 * Entrada marcada como velha modela o stale-while-revalidate de
 * `revalidateTag(…, 'max')`: o Next dispara o callback SEM await (a parte
 * síncrona dele roda antes do `return cachedResponse`, unstable-cache.js
 * ~l.189 e ~l.219) e devolve o valor guardado na hora.
 */
const loja = new Map<string, unknown>()
const velhas = new Set<string>()
const registros: { chaves: string[]; tags: string[] }[] = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, chaves: string[], opcoes: { tags: string[] }) => async () => {
      registros.push({ chaves, tags: opcoes.tags })
      const k = JSON.stringify(chaves)
      if (loja.has(k) && velhas.has(k)) {
        velhas.delete(k)
        const velho = loja.get(k)
        void fn().then((v) => loja.set(k, JSON.parse(JSON.stringify(v))))
        return velho
      }
      if (!loja.has(k)) loja.set(k, JSON.parse(JSON.stringify(await fn())))
      return loja.get(k)
    },
}))

const lerFeed = vi.fn()
vi.mock('@/modules/entrega/lista-secreta', () => ({ lerFeed: (...a: unknown[]) => lerFeed(...a) }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

import { lerFeedCacheado, TAG_FEED, tagDoFeed } from '../feed-cacheado'

const FEED = {
  conteudo: {
    dataReferencia: '2026-11-03',
    geradoEm: '2026-11-03T22:00:00.000Z',
    rulesetVersao: 'v1',
    itens: [],
  },
  geradoEm: new Date('2026-11-03T22:00:00.000Z'),
}

beforeEach(() => {
  loja.clear()
  velhas.clear()
  registros.length = 0
  lerFeed.mockReset()
})

describe('lerFeedCacheado', () => {
  it('geradoEm volta como Date, mesmo depois de atravessar o JSON do cache', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    const segunda = await lerFeedCacheado('2026-11-03')
    expect(segunda?.geradoEm).toBeInstanceOf(Date)
    expect(segunda?.geradoEm.toISOString()).toBe('2026-11-03T22:00:00.000Z')
  })

  it('a segunda leitura do mesmo dia não vai ao banco', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    await lerFeedCacheado('2026-11-03')
    expect(lerFeed).toHaveBeenCalledTimes(1)
  })

  it('null em cache nunca é confiado: relê direto, e vê a lista recém-publicada', async () => {
    lerFeed.mockResolvedValueOnce(null).mockResolvedValueOnce(FEED)
    expect(await lerFeedCacheado('2026-11-03')).toBeNull()
    const depois = await lerFeedCacheado('2026-11-03')
    expect(depois?.conteudo.dataReferencia).toBe('2026-11-03')
  })

  it('null velho servido durante a revalidação em segundo plano não é confiado (W2-1)', async () => {
    // Antes da publicação o cache guarda null; o cron publica e chama
    // revalidateTag(tag, 'max'). A visita seguinte recebe o null velho
    // enquanto o callback roda em segundo plano — e precisa reler.
    lerFeed.mockResolvedValueOnce(null)
    expect(await lerFeedCacheado('2026-11-03')).toBeNull()
    velhas.add(JSON.stringify(['feed', '2026-11-03']))

    // Banco de verdade responde depois de I/O, nunca no mesmo microtask.
    lerFeed.mockImplementation(() => new Promise((r) => setTimeout(() => r(FEED), 0)))
    const depois = await lerFeedCacheado('2026-11-03')
    expect(depois?.conteudo.dataReferencia).toBe('2026-11-03')
  })

  it('a data entra na chave e na tag; a tag geral cobre todas as datas', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    expect(registros[0]).toEqual({
      chaves: ['feed', '2026-11-03'],
      tags: [TAG_FEED, tagDoFeed('2026-11-03')],
    })
    expect(tagDoFeed('2026-11-03')).toBe('feed-2026-11-03')
  })
})
