'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * O ÚNICO PEDAÇO DE TEMPO REAL DA ABA.
 *
 * `router.refresh()` a cada 30s enquanto o jogo está em andamento — sem
 * WebSocket, de propósito: a regra do projeto é "o push é o canal de tempo
 * real, o feed é snapshot" (docs/01-arquitetura.md), e uma tela de consulta
 * não justifica uma conexão aberta por espectador.
 *
 * Monta SOMENTE quando o jogo está ao vivo: o servidor decide, o cliente só
 * obedece. Assim nenhuma outra tela do app paga por este JavaScript.
 */
export function AtualizarAoVivo({ intervaloMs = 30_000 }: { intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs)
    return () => clearInterval(id)
  }, [router, intervaloMs])

  return null
}
