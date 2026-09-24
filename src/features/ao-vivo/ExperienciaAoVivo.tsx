'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { compararSnapshotsAoVivo, type SnapshotJogoAoVivo } from '@/modules/entrega/fire-live/movimento'
import {
  intensidadeEfetiva,
  somLocalPermitido,
  type EstadoExperiencia,
} from '@/modules/plataforma/experiencia/contrato'
import s from './AoVivo.module.css'

const ATRIBUTO_CURTO = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' } as const

const CHAVE_EVENTOS = 'fire-live:apitos-processados'

/** O apito: dois tons curtos, curtos o bastante para não virar alarme. */
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
    const osc = contexto.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequencia, inicio + atraso)
    osc.connect(ganho)
    osc.start(inicio + atraso)
    osc.stop(inicio + atraso + 0.13)
  }
}

function realcar(elemento: HTMLElement, classe: string) {
  elemento.classList.remove(classe)
  void elemento.offsetWidth
  elemento.classList.add(classe)
  elemento.addEventListener('animationend', () => elemento.classList.remove(classe), { once: true })
}

function lerProcessados(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_EVENTOS) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function salvarProcessados(eventos: Set<string>) {
  try {
    localStorage.setItem(CHAVE_EVENTOS, JSON.stringify([...eventos].slice(-100)))
  } catch {
    // Navegação privada pode não ter armazenamento local.
  }
}

function IconeSom({ ativo }: { ativo: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {ativo ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 5M21 9l-5 5" />}
    </svg>
  )
}

/**
 * Compara o snapshot novo com o anterior a cada `router.refresh()`: realça o
 * placar e as linhas que andaram, anuncia para leitor de tela e toca o apito
 * — uma vez só, mesmo com o app aberto em várias abas (localStorage +
 * BroadcastChannel + navigator.locks).
 */
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
  const canal = useRef<BroadcastChannel | null>(null)
  const deOutrasAbas = useRef(new Set<string>())
  const [audioAtivo, setAudioAtivo] = useState(false)
  const [reduzMovimento, setReduzMovimento] = useState(false)
  const [anuncio, setAnuncio] = useState('')
  const intensidade = intensidadeEfetiva(estado.preferencias.intensidade, reduzMovimento)
  const somDisponivel = estado.preferencias.somHabilitado && estado.preferencias.volume > 0

  const ativarAudio = useCallback(
    async (teste = false) => {
      if (!somDisponivel) return
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
    [somDisponivel, estado.preferencias.volume],
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzMovimento(media.matches)
    atualizar()
    media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  useEffect(() => {
    const incorporar = (valor: unknown) => {
      if (!Array.isArray(valor)) return
      for (const item of valor) if (typeof item === 'string') deOutrasAbas.current.add(item)
    }
    const aoArmazenar = (e: StorageEvent) => {
      if (e.key !== CHAVE_EVENTOS || e.newValue === null) return
      try {
        incorporar(JSON.parse(e.newValue))
      } catch {
        // Gravação inválida em outra aba não trava o ao vivo.
      }
    }
    window.addEventListener('storage', aoArmazenar)
    if (typeof BroadcastChannel !== 'undefined') {
      const c = new BroadcastChannel(CHAVE_EVENTOS)
      c.onmessage = (e) => incorporar(e.data)
      canal.current = c
    }
    return () => {
      window.removeEventListener('storage', aoArmazenar)
      canal.current?.close()
      canal.current = null
    }
  }, [])

  // O navegador só libera áudio depois de um gesto: o primeiro toque na tela serve.
  useEffect(() => {
    if (!somDisponivel) return
    const liberar = () => void ativarAudio(false)
    document.addEventListener('pointerdown', liberar, { once: true, capture: true })
    document.addEventListener('keydown', liberar, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', liberar, { capture: true })
      document.removeEventListener('keydown', liberar, { capture: true })
    }
  }, [ativarAudio, somDisponivel])

  useEffect(() => {
    const mudancas = compararSnapshotsAoVivo(anterior.current, snapshot)
    anterior.current = snapshot
    const container = raiz.current
    if (!container) return
    const linha = (chave: string) => container.querySelector<HTMLElement>(`[data-live-key="${CSS.escape(chave)}"]`)

    if (mudancas.placarSubiu) {
      const placar = container.querySelector<HTMLElement>('[data-live-score]')
      if (placar) realcar(placar, s.eventoPlacar!)
    }
    for (const p of mudancas.progresso) {
      const el = linha(p.chave)
      if (!el) continue
      el.dataset.delta = `+${p.diferenca} ${ATRIBUTO_CURTO[p.atributo]}`
      realcar(el, s.eventoProgresso!)
    }
    for (const chave of mudancas.alvosBatidos) {
      const el = linha(chave)
      if (el) realcar(el, s.eventoAlvo!)
    }
    for (const chave of mudancas.modoFire) {
      const el = linha(chave)
      if (el) realcar(el, s.eventoFire!)
    }

    const quantidade = mudancas.novosApitos.length || mudancas.alvosBatidos.length
    if (mudancas.placarSubiu || mudancas.progresso.length || quantidade || mudancas.modoFire.length) {
      setAnuncio(
        quantidade > 0
          ? `${quantidade} novo${quantidade === 1 ? '' : 's'} apito${quantidade === 1 ? '' : 's'} neste jogo.`
          : 'Dados do jogo atualizados.',
      )
    }

    const candidatos = mudancas.novosApitos.filter((alvo) =>
      somLocalPermitido(estado, { canal: 'FIRE_LIVE_APITO', jogadorId: alvo.jogadorId, atributo: alvo.atributo }),
    )
    if (candidatos.length === 0) return

    const registrarETocar = () => {
      const vistos = lerProcessados()
      for (const item of deOutrasAbas.current) vistos.add(item)
      const chaves = candidatos.map((a) => `${a.chave}|${a.apitadoEm}`)
      const ineditos = chaves.filter((c) => !vistos.has(c))
      for (const c of chaves) vistos.add(c)
      deOutrasAbas.current = vistos
      salvarProcessados(vistos)
      canal.current?.postMessage(chaves)
      if (ineditos.length > 0 && document.visibilityState === 'visible' && audio.current?.state === 'running') {
        tocarApito(audio.current, estado.preferencias.volume)
      }
    }
    if (navigator.locks) void navigator.locks.request('fire-live:audio', registrarETocar)
    else registrarETocar()
  }, [estado, snapshot])

  return (
    <div ref={raiz} className={s.experiencia} data-intensidade={intensidade}>
      {somDisponivel && (
        <button className={s.som} type="button" onClick={() => void ativarAudio(true)} aria-pressed={audioAtivo}>
          <IconeSom ativo={audioAtivo} />
          {audioAtivo ? `Som ativo · ${estado.preferencias.volume}%` : 'Ativar som do apito'}
        </button>
      )}
      <span className="so-leitor" aria-live="polite" aria-atomic="true">
        {anuncio}
      </span>
      {children}
    </div>
  )
}
