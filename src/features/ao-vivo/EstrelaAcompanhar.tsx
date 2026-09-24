'use client'

import { useState, useTransition } from 'react'
import { alternarAcompanhamento } from '@/features/estatisticas/acoes'
import s from './AoVivo.module.css'

/**
 * A ESTRELA DO CANTO — acompanhar o jogador sem sair do Ao Vivo.
 *
 * Atualização otimista: a estrela acende na hora e volta atrás se o servidor
 * recusar. Vive numa camada acima da cobertura que leva à análise (ver
 * `LinhaAoVivo`), senão o clique na estrela abriria o apito.
 *
 * O acompanhamento não é enfeite: é ele que decide qual jogo o Ao Vivo abre
 * primeiro (`selecionarJogoAoVivo`) e quem pode tocar o som local.
 */
export function EstrelaAcompanhar({
  jogadorId,
  nome,
  inicial,
}: {
  jogadorId: string
  nome: string
  inicial: boolean
}) {
  const [acompanhado, setAcompanhado] = useState(inicial)
  const [erro, setErro] = useState(false)
  const [salvando, iniciar] = useTransition()

  return (
    <button
      type="button"
      className={s.estrela}
      aria-pressed={acompanhado}
      aria-label={acompanhado ? `Deixar de acompanhar ${nome}` : `Acompanhar ${nome}`}
      title={erro ? 'Não foi possível salvar. Tente de novo.' : acompanhado ? 'Acompanhando' : 'Acompanhar jogador'}
      disabled={salvando}
      data-erro={erro || undefined}
      onClick={() => {
        const proximo = !acompanhado
        setAcompanhado(proximo)
        setErro(false)
        iniciar(async () => {
          const r = await alternarAcompanhamento({ tipo: 'JOGADOR', id: jogadorId, acompanhar: proximo })
          if (r.ok) setAcompanhado(r.acompanhado)
          else {
            setAcompanhado(!proximo)
            setErro(true)
          }
        })
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 16 16"
        aria-hidden
        fill={acompanhado ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M8 1.5l2 4.2 4.5.6-3.3 3.2.8 4.5L8 11.8 4 14l.8-4.5L1.5 6.3 6 5.7z" />
      </svg>
      {erro && <span className="so-leitor">Não foi possível salvar. Tente de novo.</span>}
    </button>
  )
}
