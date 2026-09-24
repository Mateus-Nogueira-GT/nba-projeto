'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { DadosDaLateral } from '@/modules/entrega/lateral'
import { LogoTime } from '@/ui/midia'
import s from './Lateral.module.css'

/**
 * A classificação enxuta da coluna: posição, time, V–D e aproveitamento, com
 * uma aba por conferência. O rótulo da conferência vem do provedor — o app
 * nunca carimba "Leste" por conta própria.
 */
export function Classificacao({ classificacao }: { classificacao: DadosDaLateral['classificacao'] }) {
  const conferencias = classificacao.conferencias
  const [aberta, setAberta] = useState(conferencias[0]?.conferencia ?? '')
  if (conferencias.length === 0) return null
  const atual = conferencias.find((c) => c.conferencia === aberta) ?? conferencias[0]!

  return (
    <div className={s.classificacao}>
      {conferencias.length > 1 && (
        <div className={s.abas} role="tablist" aria-label="Conferência">
          {conferencias.map((c) => (
            <button
              key={c.conferencia}
              type="button"
              role="tab"
              aria-selected={c.conferencia === atual.conferencia}
              className={s.aba}
              onClick={() => setAberta(c.conferencia)}
            >
              {c.conferencia}
            </button>
          ))}
        </div>
      )}
      <table className={s.tabela}>
        <caption className="so-leitor">
          Classificação da conferência {atual.conferencia} · temporada {classificacao.temporada}
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Time</th>
            <th scope="col" className={s.numero}>
              V–D
            </th>
            <th scope="col" className={s.numero}>
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {atual.linhas.map((l) => (
            <tr key={l.timeId}>
              <td className={`${s.numero} num`}>{l.posicao ?? '—'}</td>
              <th scope="row">
                <Link href={`/estatisticas/time/${l.timeId}`} className={s.time}>
                  <LogoTime sigla={l.sigla} tamanho={18} />
                  <span>{l.sigla}</span>
                </Link>
              </th>
              <td className={`${s.numero} num`}>
                {l.vitorias}–{l.derrotas}
              </td>
              <td className={`${s.numero} num`}>
                {l.aproveitamento === null ? '—' : `${Math.round(l.aproveitamento * 100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href="/estatisticas#classificacao" className={s.link}>
        Ver completa
      </Link>
    </div>
  )
}
