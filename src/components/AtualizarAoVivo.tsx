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
 * de o assinante navegar. Por isso mora em `components/`, não numa rota.
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
export function AtualizarAoVivo({ intervaloMs = 30_000 }: { intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }

    const id = setInterval(atualizarSeVisivel, intervaloMs)
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
    }
  }, [router, intervaloMs])

  return <span hidden data-atualiza-ao-vivo={intervaloMs} />
}
