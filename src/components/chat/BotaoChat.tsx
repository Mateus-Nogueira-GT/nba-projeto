'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import estilos from './BotaoChat.module.css'

// O painel só é BAIXADO quando alguém clica. A Moldura monta este botão em 16
// telas; embarcar a conversa inteira no primeiro render de todas elas seria
// cobrar de quem nunca vai abrir.
const PainelChat = dynamic(() => import('./PainelChat').then((m) => m.PainelChat), { ssr: false })

/**
 * O BOTÃO FLUTUANTE DO ASSISTENTE.
 *
 * Fica ACIMA da barra de abas: a `Moldura` reserva a altura dela, e um botão
 * na borda de baixo cairia em cima dos alvos de toque da navegação — o polegar
 * erraria a aba e abriria o chat. A área segura do aparelho entra na conta
 * pelo CSS (`env(safe-area-inset-bottom)`).
 */
export function BotaoChat() {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        className={estilos.botao}
        aria-label="Abrir o assistente"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
      >
        {/* Identidade 02: forma geométrica em SVG, sem emoji. */}
        <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {aberto && <PainelChat aoFechar={() => setAberto(false)} />}
    </>
  )
}
