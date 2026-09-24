'use client'

import { useState, useTransition } from 'react'
import { alternarAcompanhamento } from './acoes'
import s from './Comum.module.css'

/** Acompanhar jogador/time — atualização otimista, desfeita se o servidor recusar. */
export function BotaoAcompanhar({
  tipo,
  id,
  inicial,
}: {
  tipo: 'JOGADOR' | 'TIME'
  id: string
  inicial: boolean
}) {
  const [acompanhado, setAcompanhado] = useState(inicial)
  const [erro, setErro] = useState('')
  const [salvando, iniciar] = useTransition()
  const alvo = tipo === 'JOGADOR' ? 'jogador' : 'time'

  return (
    <span className={s.acompanhar}>
      <button
        type="button"
        className={s.botaoAcompanhar}
        aria-pressed={acompanhado}
        disabled={salvando}
        onClick={() => {
          const proximo = !acompanhado
          setAcompanhado(proximo)
          setErro('')
          iniciar(async () => {
            const r = await alternarAcompanhamento({ tipo, id, acompanhar: proximo })
            if (r.ok) setAcompanhado(r.acompanhado)
            else {
              setAcompanhado(!proximo)
              setErro('Não foi possível salvar. Tente novamente.')
            }
          })
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill={acompanhado ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M8 1.5l2 4.2 4.5.6-3.3 3.2.8 4.5L8 11.8 4 14l.8-4.5L1.5 6.3 6 5.7z" />
        </svg>
        {acompanhado ? `Acompanhando ${alvo}` : `Acompanhar ${alvo}`}
      </button>
      {erro && (
        <span className={s.erro} role="status">
          {erro}
        </span>
      )}
    </span>
  )
}
