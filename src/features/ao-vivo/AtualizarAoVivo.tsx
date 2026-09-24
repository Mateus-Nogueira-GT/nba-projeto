'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * O ÚNICO PEDAÇO DE TEMPO REAL DO APP.
 *
 * `router.refresh()` a cada 30s enquanto há jogo em andamento — sem
 * WebSocket, de propósito: a regra do projeto é "o push é o canal de tempo
 * real, o feed é snapshot" (docs/01-arquitetura.md), e uma tela de consulta
 * não justifica uma conexão aberta por espectador.
 *
 * Nasceu na tela de partida (identidade "tela de partida e nota", 26/08) e
 * passou a servir também o Fire Live na identidade 04: até então o Fire Live
 * — a tela que mais precisa — não se atualizava sozinho; dependia do push ou
 * de o assinante navegar. Mora no Ao Vivo desde o front v2 (Tarefa 4): o v2
 * trazia um refresh próprio, de período fixo e sem jitter, e foi trocado por
 * este. A tela de partida do v2 (`features/estatisticas/TelaJogo`) também o
 * usa — a cópia do v2 sem jitter saiu na Tarefa 5.
 *
 * Monta SOMENTE quando o servidor viu jogo ao vivo: o servidor decide, o
 * cliente só obedece. Assim nenhuma outra tela do app paga por este
 * JavaScript.
 *
 * Guarda de visibilidade: só atualiza com a aba em primeiro plano. Sem isso,
 * uma aba esquecida em segundo plano continua batendo, a cada 30s, numa
 * página `force-dynamic` que faz 6 consultas por render — gasto sem
 * ninguém olhando (achado da revisão). Ao voltar a ficar visível, atualiza na
 * hora, em vez de esperar até 30s pra mostrar o placar corrente.
 *
 * Renderiza um `<span hidden>` com o intervalo em `data-atualiza-ao-vivo`:
 * não é decoração, é o que permite à fumaça das telas (que renderiza no
 * servidor, sem montar efeitos) provar que o componente foi montado — e só
 * quando devia.
 */
const JITTER_MS = 10_000
const MINIMO_MS = 5_000

/**
 * ±10 s sobre a base: 2 mil telas abertas no mesmo apito não batem todas no
 * mesmo segundo (W2-6).
 */
export function proximoIntervalo(baseMs: number, aleatorio: () => number = Math.random): number {
  return Math.max(MINIMO_MS, Math.round(baseMs - JITTER_MS + aleatorio() * 2 * JITTER_MS))
}

export function AtualizarAoVivo({ intervaloMs = 30_000 }: { intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }

    // setTimeout encadeado, não setInterval: cada disparo sorteia um novo
    // intervalo (W2-6), o que um setInterval de período fixo não permite.
    let id: ReturnType<typeof setTimeout>
    const agendar = () => {
      id = setTimeout(() => {
        atualizarSeVisivel()
        agendar()
      }, proximoIntervalo(intervaloMs))
    }
    agendar()
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
    }
  }, [router, intervaloMs])

  return <span hidden data-atualiza-ao-vivo={intervaloMs} />
}
