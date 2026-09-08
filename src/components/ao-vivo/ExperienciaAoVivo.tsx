'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import {
  compararSnapshotsAoVivo,
  type SnapshotJogoAoVivo,
} from '@/modules/entrega/fire-live/movimento'
import {
  intensidadeEfetiva,
  somLocalPermitido,
  type EstadoExperiencia,
} from '@/modules/plataforma/experiencia/contrato'

import estilos from './ExperienciaAoVivo.module.css'

const ROTULO_ATRIBUTO = {
  PONTOS: 'PTS',
  REBOTES: 'REB',
  ASSISTENCIAS: 'AST',
} as const

const CHAVE_EVENTOS_PROCESSADOS = 'fire-live:apitos-processados'
const CANAL_EVENTOS_PROCESSADOS = 'fire-live:apitos-processados'

function tocarApito(contexto: AudioContext, volume: number) {
  const inicio = contexto.currentTime
  const ganho = contexto.createGain()
  ganho.gain.setValueAtTime(0.0001, inicio)
  ganho.gain.exponentialRampToValueAtTime(Math.max(0.015, volume / 500), inicio + 0.015)
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.24)
  ganho.connect(contexto.destination)

  for (const [frequencia, atraso] of [
    [880, 0],
    [1175, 0.09],
  ] as const) {
    const oscilador = contexto.createOscillator()
    oscilador.type = 'sine'
    oscilador.frequency.setValueAtTime(frequencia, inicio + atraso)
    oscilador.connect(ganho)
    oscilador.start(inicio + atraso)
    oscilador.stop(inicio + atraso + 0.13)
  }
}

function reiniciarAnimacao(elemento: HTMLElement, classe: string) {
  elemento.classList.remove(classe)
  void elemento.offsetWidth
  elemento.classList.add(classe)
  elemento.addEventListener('animationend', () => elemento.classList.remove(classe), { once: true })
}

function eventosProcessados(): Set<string> {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE_EVENTOS_PROCESSADOS) ?? '[]')
    return new Set(
      Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

function salvarEventosProcessados(eventos: Set<string>) {
  try {
    localStorage.setItem(CHAVE_EVENTOS_PROCESSADOS, JSON.stringify([...eventos].slice(-100)))
  } catch {
    // O armazenamento local pode estar indisponível em navegação privada.
  }
}

export function ExperienciaAoVivo({
  snapshot,
  estado,
  children,
}: {
  snapshot: SnapshotJogoAoVivo
  estado: EstadoExperiencia
  children: ReactNode
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const anterior = useRef(snapshot)
  const audio = useRef<AudioContext | null>(null)
  const canalDeEventos = useRef<BroadcastChannel | null>(null)
  const eventosDeOutrasAbas = useRef(new Set<string>())
  const [audioAtivo, setAudioAtivo] = useState(false)
  const [sistemaReduzMovimento, setSistemaReduzMovimento] = useState(false)
  const [anuncio, setAnuncio] = useState('')
  const intensidade = intensidadeEfetiva(estado.preferencias.intensidade, sistemaReduzMovimento)

  const ativarAudio = useCallback(
    async (teste = false) => {
      if (!estado.preferencias.somHabilitado || estado.preferencias.volume === 0) return
      try {
        const contexto = audio.current ?? new AudioContext()
        audio.current = contexto
        await contexto.resume()
        const ativo = contexto.state === 'running'
        setAudioAtivo(ativo)
        if (ativo && teste) tocarApito(contexto, estado.preferencias.volume)
      } catch {
        setAudioAtivo(false)
      }
    },
    [estado.preferencias.somHabilitado, estado.preferencias.volume],
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setSistemaReduzMovimento(media.matches)
    atualizar()
    media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  useEffect(() => {
    const incorporar = (valor: unknown) => {
      if (!Array.isArray(valor)) return
      for (const item of valor) {
        if (typeof item === 'string') eventosDeOutrasAbas.current.add(item)
      }
    }
    const aoArmazenar = (evento: StorageEvent) => {
      if (evento.key !== CHAVE_EVENTOS_PROCESSADOS || evento.newValue === null) return
      try {
        incorporar(JSON.parse(evento.newValue))
      } catch {
        // Uma gravação inválida em outra aba não bloqueia as atualizações ao vivo.
      }
    }

    window.addEventListener('storage', aoArmazenar)
    if (typeof BroadcastChannel !== 'undefined') {
      const canal = new BroadcastChannel(CANAL_EVENTOS_PROCESSADOS)
      canal.onmessage = (evento) => incorporar(evento.data)
      canalDeEventos.current = canal
    }

    return () => {
      window.removeEventListener('storage', aoArmazenar)
      canalDeEventos.current?.close()
      canalDeEventos.current = null
    }
  }, [])

  useEffect(() => {
    if (!estado.preferencias.somHabilitado || estado.preferencias.volume === 0) return
    const liberar = () => void ativarAudio(false)
    document.addEventListener('pointerdown', liberar, { once: true, capture: true })
    document.addEventListener('keydown', liberar, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', liberar, { capture: true })
      document.removeEventListener('keydown', liberar, { capture: true })
    }
  }, [ativarAudio, estado.preferencias.somHabilitado, estado.preferencias.volume])

  useEffect(() => {
    const mudancas = compararSnapshotsAoVivo(anterior.current, snapshot)
    anterior.current = snapshot
    const container = raiz.current
    if (!container) return

    if (mudancas.placarSubiu) {
      const placar = container.querySelector<HTMLElement>('[data-live-score]')
      if (placar) reiniciarAnimacao(placar, estilos.eventoPlacar!)
    }
    for (const progresso of mudancas.progresso) {
      const cartao = container.querySelector<HTMLElement>(
        `[data-live-key="${CSS.escape(progresso.chave)}"]`,
      )
      if (!cartao) continue
      cartao.dataset.delta = `+${progresso.diferenca} ${ROTULO_ATRIBUTO[progresso.atributo]}`
      reiniciarAnimacao(cartao, estilos.eventoProgresso!)
    }
    for (const chave of mudancas.alvosBatidos) {
      const cartao = container.querySelector<HTMLElement>(`[data-live-key="${CSS.escape(chave)}"]`)
      if (cartao) reiniciarAnimacao(cartao, estilos.eventoAlvo!)
    }
    for (const chave of mudancas.modoFire) {
      const cartao = container.querySelector<HTMLElement>(`[data-live-key="${CSS.escape(chave)}"]`)
      if (cartao) reiniciarAnimacao(cartao, estilos.eventoFire!)
    }

    const quantidade = mudancas.novosApitos.length || mudancas.alvosBatidos.length
    if (
      mudancas.placarSubiu ||
      mudancas.progresso.length ||
      quantidade ||
      mudancas.modoFire.length
    ) {
      setAnuncio(
        quantidade > 0
          ? `${quantidade} novo${quantidade === 1 ? '' : 's'} apito${quantidade === 1 ? '' : 's'} neste jogo.`
          : 'Dados do jogo atualizados.',
      )
    }

    const candidatos = mudancas.novosApitos.filter((alvo) =>
      somLocalPermitido(estado, {
        canal: 'FIRE_LIVE_APITO',
        jogadorId: alvo.jogadorId,
        atributo: alvo.atributo,
      }),
    )
    if (candidatos.length === 0) return

    const registrarETocar = () => {
      const vistos = eventosProcessados()
      for (const item of eventosDeOutrasAbas.current) vistos.add(item)
      const chaves = candidatos.map((alvo) => `${alvo.chave}|${alvo.apitadoEm}`)
      const ineditos = chaves.filter((chave) => !vistos.has(chave))
      for (const chave of chaves) vistos.add(chave)
      eventosDeOutrasAbas.current = vistos
      salvarEventosProcessados(vistos)
      canalDeEventos.current?.postMessage(chaves)

      if (
        ineditos.length > 0 &&
        document.visibilityState === 'visible' &&
        audio.current?.state === 'running'
      ) {
        tocarApito(audio.current, estado.preferencias.volume)
      }
    }

    const bloqueios = navigator.locks
    if (bloqueios) {
      void bloqueios.request('fire-live:audio', registrarETocar)
    } else {
      registrarETocar()
    }
  }, [estado, snapshot])

  const somDisponivel = estado.preferencias.somHabilitado && estado.preferencias.volume > 0

  return (
    <div ref={raiz} className={estilos.raiz} data-intensidade={intensidade}>
      {somDisponivel && (
        <button
          className={estilos.controleSom}
          type="button"
          onClick={() => void ativarAudio(true)}
        >
          <span aria-hidden>{audioAtivo ? '🔊' : '♪'}</span>
          {audioAtivo ? `Som ativo · ${estado.preferencias.volume}%` : 'Ativar som'}
        </button>
      )}
      <span className={estilos.anuncio} aria-live="polite" aria-atomic="true">
        {anuncio}
      </span>
      {children}
    </div>
  )
}
