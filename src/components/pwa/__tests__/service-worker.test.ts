import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

const codigoWorker = readFileSync('public/sw.js', 'utf8')
const ORIGEM = 'https://app.ia-nba.test'

type EventoWorker = Record<string, unknown> & {
  waitUntil(promessa: Promise<unknown>): void
}

type Manipulador = (evento: EventoWorker) => void

type JanelaWorker = {
  url: string
  focus: ReturnType<typeof vi.fn>
  navigate?: ReturnType<typeof vi.fn>
}

function carregarWorker(janelas: JanelaWorker[] = []) {
  const manipuladores = new Map<string, Manipulador>()
  const mostrar = vi.fn(async () => undefined)
  const abrir = vi.fn(async () => null)
  const erro = vi.fn()

  const self = {
    location: { origin: ORIGEM },
    registration: { showNotification: mostrar },
    clients: {
      matchAll: vi.fn(async () => janelas),
      openWindow: abrir,
    },
    addEventListener: (tipo: string, manipulador: Manipulador) => {
      manipuladores.set(tipo, manipulador)
    },
  }

  runInNewContext(codigoWorker, {
    self,
    URL,
    console: { error: erro },
  })

  async function disparar(tipo: string, dados: Record<string, unknown>) {
    let trabalho: Promise<unknown> | undefined
    const manipulador = manipuladores.get(tipo)
    if (manipulador === undefined) throw new Error(`handler ${tipo} não registrado`)

    manipulador({
      ...dados,
      waitUntil: (promessa: Promise<unknown>) => {
        trabalho = promessa
      },
    })
    if (trabalho === undefined) throw new Error(`handler ${tipo} não chamou waitUntil`)
    await trabalho
  }

  return { disparar, mostrar, abrir, erro, self }
}

function mensagem(overrides: Record<string, unknown> = {}) {
  return {
    versao: 1,
    chave: 'fire:jogo-1:jogador-70:q1',
    canal: 'FIRE_LIVE_APITO',
    titulo: 'Apito Fire Live',
    corpo: 'A entrada atingiu o alvo no primeiro quarto.',
    url: '/',
    ocorridoEm: '2099-01-01T00:00:00.000Z',
    expiraEm: '2099-01-01T00:05:00.000Z',
    dados: {
      jogoId: 'd9428888-122b-4f80-96f8-4a0ca9dcf202',
      jogadorId: '8f14e45f-ea45-4f3b-a021-fcbe915fdf4e',
      atributo: 'PONTOS',
      nivelJogador: 'MVP',
      alvo1Q: 8,
      modoFire: true,
      opdOrigemNivel: 3,
    },
    ...overrides,
  }
}

describe('service worker — Push', () => {
  it('referencia ícone e badge locais existentes', () => {
    expect(existsSync('public/icons/notification.png')).toBe(true)
    expect(existsSync('public/icons/badge.png')).toBe(true)
    expect(codigoWorker).toContain("const ICONE_NOTIFICACAO = '/icons/notification.png'")
    expect(codigoWorker).toContain("const BADGE_NOTIFICACAO = '/icons/badge.png'")
  })

  it('mostra payload válido com tag idempotente, idioma e deep link mínimo', async () => {
    const worker = carregarWorker()

    await worker.disparar('push', { data: { json: () => mensagem() } })

    expect(worker.mostrar).toHaveBeenCalledOnce()
    expect(worker.mostrar).toHaveBeenCalledWith(
      'Apito Fire Live',
      expect.objectContaining({
        body: 'A entrada atingiu o alvo no primeiro quarto.',
        tag: 'fire:jogo-1:jogador-70:q1',
        lang: 'pt-BR',
        data: {
          chave: 'fire:jogo-1:jogador-70:q1',
          url: '/',
          expiraEm: '2099-01-01T00:05:00.000Z',
        },
      }),
    )
  })

  it('descarta silenciosamente alerta vencido', async () => {
    const worker = carregarWorker()

    await worker.disparar('push', {
      data: {
        json: () =>
          mensagem({
            ocorridoEm: '2020-01-01T00:00:00.000Z',
            expiraEm: '2020-01-01T00:05:00.000Z',
          }),
      },
    })

    expect(worker.mostrar).not.toHaveBeenCalled()
    expect(worker.erro).not.toHaveBeenCalled()
  })

  it('payload inválido ou URL externa não exibe nem navega', async () => {
    const worker = carregarWorker()

    await worker.disparar('push', {
      data: { json: () => mensagem({ url: 'https://malicioso.test/roubo' }) },
    })

    expect(worker.mostrar).not.toHaveBeenCalled()
    expect(worker.erro).toHaveBeenCalledWith('Push descartado: contrato inválido.')
  })

  it('rejeita dados incompatíveis com o canal e campos extras', async () => {
    const worker = carregarWorker()

    await worker.disparar('push', {
      data: { json: () => mensagem({ dados: { jogoId: 'jogo-1' } }) },
    })
    await worker.disparar('push', {
      data: { json: () => mensagem({ campoNaoContratado: true }) },
    })

    expect(worker.mostrar).not.toHaveBeenCalled()
    expect(worker.erro).toHaveBeenCalledTimes(2)
  })

  it('no clique navega e foca uma janela same-origin existente', async () => {
    const focar = vi.fn(async () => undefined)
    const janelaNavegada = { focus: focar }
    const navegar = vi.fn(async () => janelaNavegada)
    const janela = {
      url: `${ORIGEM}/estatisticas`,
      focus: vi.fn(async () => undefined),
      navigate: navegar,
    }
    const worker = carregarWorker([janela])
    const fechar = vi.fn()

    await worker.disparar('notificationclick', {
      notification: {
        close: fechar,
        data: {
          url: '/',
          expiraEm: '2099-01-01T00:05:00.000Z',
        },
      },
    })

    expect(fechar).toHaveBeenCalledOnce()
    expect(navegar).toHaveBeenCalledWith(`${ORIGEM}/`)
    expect(focar).toHaveBeenCalledOnce()
    expect(worker.abrir).not.toHaveBeenCalled()
  })

  it('abre janela nova somente para deep link allowlisted e não vencido', async () => {
    const worker = carregarWorker()

    await worker.disparar('notificationclick', {
      notification: {
        close: vi.fn(),
        data: { url: '/', expiraEm: '2099-01-01T00:05:00.000Z' },
      },
    })

    expect(worker.abrir).toHaveBeenCalledWith(`${ORIGEM}/`)
  })

  it('clique adulterado é fechado sem abrir URL arbitrária', async () => {
    const worker = carregarWorker()
    const fechar = vi.fn()

    await worker.disparar('notificationclick', {
      notification: {
        close: fechar,
        data: { url: '//malicioso.test', expiraEm: '2099-01-01T00:05:00.000Z' },
      },
    })

    expect(fechar).toHaveBeenCalledOnce()
    expect(worker.abrir).not.toHaveBeenCalled()
    expect(worker.erro).toHaveBeenCalledWith('Clique de Push descartado: deep link inválido.')
  })
})
