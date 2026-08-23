import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const codigoWorker = readFileSync('public/sw.js', 'utf8')
const ORIGEM = 'https://app.ia-nba.test'

type Manipulador = (evento: Record<string, unknown>) => void

function criarHarness() {
  const manipuladores = new Map<string, Manipulador>()
  const itens = new Map<string, Response>()
  const addAll = vi.fn(async (urls: string[]) => {
    for (const url of urls) itens.set(url, new Response(url))
  })
  const put = vi.fn(async (request: { url?: string } | string, response: Response) => {
    itens.set(typeof request === 'string' ? request : (request.url ?? ''), response)
  })
  const cache = {
    addAll,
    match: vi.fn(async (request: { url?: string } | string) =>
      itens.get(typeof request === 'string' ? request : (request.url ?? '')),
    ),
    put,
  }
  const nomes = ['ia-da-nba-pwa-v0', 'ia-da-nba-pwa-v1', 'cache-de-terceiro']
  const apagar = vi.fn(async () => true)
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => nomes),
    delete: apagar,
    match: vi.fn(async (request: string) => itens.get(request)),
  }
  const buscar = vi.fn(async () => new Response('rede', { status: 200 }))
  const claim = vi.fn(async () => undefined)
  const skipWaiting = vi.fn(async () => undefined)
  const self = {
    location: { origin: ORIGEM },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      claim,
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => null),
    },
    skipWaiting,
    addEventListener: (tipo: string, manipulador: Manipulador) => {
      manipuladores.set(tipo, manipulador)
    },
  }

  runInNewContext(codigoWorker, { self, caches, fetch: buscar, URL, Response, console })

  async function eventoExtensivel(tipo: string, dados: Record<string, unknown> = {}) {
    let trabalho: Promise<unknown> | undefined
    manipuladores.get(tipo)?.({
      ...dados,
      waitUntil(promessa: Promise<unknown>) {
        trabalho = promessa
      },
    })
    await trabalho
  }

  async function eventoFetch(request: Record<string, unknown>) {
    let resposta: Promise<Response> | undefined
    manipuladores.get('fetch')?.({
      request,
      respondWith(promessa: Promise<Response>) {
        resposta = promessa
      },
    })
    return resposta ? await resposta : undefined
  }

  return {
    addAll,
    apagar,
    buscar,
    claim,
    eventoExtensivel,
    eventoFetch,
    itens,
    put,
    skipWaiting,
  }
}

describe('service worker — fundação PWA', () => {
  it('precacheia somente a allowlist pública e não força ativação no install', async () => {
    const harness = criarHarness()
    await harness.eventoExtensivel('install')

    expect(harness.addAll).toHaveBeenCalledOnce()
    expect(harness.addAll.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        '/offline',
        '/icons/app-192.png',
        '/icons/app-512.png',
        '/icons/app-maskable-512.png',
      ]),
    )
    expect(harness.addAll.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining(['/', '/estatisticas', '/fire-live', '/api']),
    )
    expect(harness.skipWaiting).not.toHaveBeenCalled()
  })

  it('remove apenas cache antigo da aplicação e preserva cache de terceiros', async () => {
    const harness = criarHarness()
    await harness.eventoExtensivel('activate')

    expect(harness.apagar).toHaveBeenCalledExactlyOnceWith('ia-da-nba-pwa-v0')
    expect(harness.apagar).not.toHaveBeenCalledWith('cache-de-terceiro')
    expect(harness.claim).toHaveBeenCalledOnce()
  })

  it('aplica skipWaiting somente após mensagem explícita da UI', async () => {
    const harness = criarHarness()
    await harness.eventoExtensivel('message', { data: { tipo: 'IGNORAR' } })
    expect(harness.skipWaiting).not.toHaveBeenCalled()

    await harness.eventoExtensivel('message', { data: { tipo: 'PWA_APLICAR_ATUALIZACAO' } })
    expect(harness.skipWaiting).toHaveBeenCalledOnce()
  })

  it.each(['/api/push/preferencias', '/admin/usuarios', '/entrar'])(
    'não intercepta nem armazena %s',
    async (caminho) => {
      const harness = criarHarness()
      const resposta = await harness.eventoFetch({
        method: 'GET',
        mode: 'navigate',
        url: `${ORIGEM}${caminho}`,
      })

      expect(resposta).toBeUndefined()
      expect(harness.buscar).not.toHaveBeenCalled()
      expect(harness.put).not.toHaveBeenCalled()
    },
  )

  it.each(['/', '/estatisticas', '/estatisticas/jogador/1', '/fire-live'])(
    'usa rede em %s sem armazenar HTML autenticado',
    async (caminho) => {
      const harness = criarHarness()
      const resposta = await harness.eventoFetch({
        method: 'GET',
        mode: 'navigate',
        url: `${ORIGEM}${caminho}`,
      })

      expect(await resposta?.text()).toBe('rede')
      expect(harness.buscar).toHaveBeenCalledOnce()
      expect(harness.put).not.toHaveBeenCalled()
    },
  )

  it('serve somente o fallback neutro quando a navegação falha', async () => {
    const harness = criarHarness()
    harness.itens.set('/offline', new Response('Sem conexão'))
    harness.buscar.mockRejectedValueOnce(new TypeError('offline'))

    const resposta = await harness.eventoFetch({
      method: 'GET',
      mode: 'navigate',
      url: `${ORIGEM}/`,
    })
    expect(await resposta?.text()).toBe('Sem conexão')
    expect(harness.put).not.toHaveBeenCalled()
  })

  it('usa cache-first somente para asset público allowlisted', async () => {
    const harness = criarHarness()
    harness.itens.set(`${ORIGEM}/icons/app-192.png`, new Response('icone'))

    const resposta = await harness.eventoFetch({
      method: 'GET',
      mode: 'no-cors',
      url: `${ORIGEM}/icons/app-192.png`,
    })
    expect(await resposta?.text()).toBe('icone')
    expect(harness.buscar).not.toHaveBeenCalled()
  })
})
