'use client'

import { useState } from 'react'
import type { BlocoJogo } from '@/modules/entrega/detalhe-apito'
import { GraficoBarras } from '@/ui/graficos'
import s from './Apito.module.css'

/**
 * O gráfico da forma com o recorte "5 jogos | todos". Cada recorte é um
 * cartão que já mostra o aproveitamento — a escolha e o número no mesmo
 * lugar, sem uma frase solta para ler. O recorte é só de leitura (não muda a
 * análise), então vive no cliente em vez de na URL.
 */
export function FormaNoAtributo({ blocos, linha }: { blocos: BlocoJogo[]; linha: number | null }) {
  const todos = Math.min(blocos.length, 10)
  const [recorte, setRecorte] = useState(todos)
  const jogos = blocos.slice(-recorte)
  const recortes = blocos.length > 5 ? [5, todos] : [todos]

  return (
    <div className={s.forma}>
      {linha !== null && (
        <div className={s.recortes} role="group" aria-label="Quantos jogos considerar">
          {recortes.map((n) => {
            const trecho = blocos.slice(-n)
            const acertos = trecho.filter((j) => j.bateu).length
            const taxa = Math.round((acertos / trecho.length) * 100)
            return (
              <button
                key={n}
                type="button"
                className={s.recorte}
                aria-pressed={recorte === n}
                onClick={() => setRecorte(n)}
              >
                <span className={s.recorteRotulo}>{n === todos && n !== 5 ? `Últimos ${n}` : 'Últimos 5'}</span>
                <span className={s.recorteValor}>
                  <strong className="num" data-tom={taxa >= 50 ? 'bom' : 'ruim'}>
                    {taxa}%
                  </strong>
                  <span className="num">
                    {acertos}/{trecho.length}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <GraficoBarras jogos={jogos} linha={linha} />
      <p className={s.legenda}>
        <span className={s.legendaBateu} aria-hidden /> bateu a linha
        <span className={s.legendaFalhou} aria-hidden /> ficou abaixo
      </p>
    </div>
  )
}
