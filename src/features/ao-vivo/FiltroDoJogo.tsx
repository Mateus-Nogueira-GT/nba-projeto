'use client'

import { useState, type ReactNode } from 'react'
import s from './AoVivo.module.css'

const OPCOES = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'faltando', rotulo: 'Faltando' },
  { valor: 'batido', rotulo: 'Alvo batido' },
  { valor: 'seguidos', rotulo: 'Seguidos' },
] as const
type Filtro = (typeof OPCOES)[number]['valor']

/**
 * Filtro das linhas DENTRO do jogo — "No ritmo · Abaixo" do Flashscore. Roda
 * só no navegador: cada linha já traz `data-batido` e `data-seguido`, e o CSS
 * esconde o que não entra. Nada volta ao servidor, e a atualização de 30s
 * (que redesenha as linhas) mantém o filtro escolhido.
 */
export function FiltroDoJogo({ contagem, children }: { contagem: Record<Filtro, number>; children: ReactNode }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  return (
    <div className={s.filtravel} data-filtro={filtro}>
      <div className={s.filtroJogo} role="group" aria-label="Filtrar jogadores deste jogo">
        {OPCOES.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={s.filtroOpcao}
            aria-pressed={filtro === o.valor}
            onClick={() => setFiltro(o.valor)}
            disabled={o.valor !== 'todos' && contagem[o.valor] === 0}
          >
            {o.rotulo}
            <span className="num">{contagem[o.valor]}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
