'use client'

import { useState } from 'react'
import type { BlocoJogo } from '@/modules/entrega/detalhe-apito'
import { decimal, linha as fmtLinha } from '@/ui/formato'
import s from './Apito.module.css'

type Frase = { texto: string; tom: 'bom' | 'ruim' | 'neutro' }

/**
 * TENDÊNCIAS em frase pronta — o "7/9" do SofaScore e o "% de jogos que
 * bateram" do FootyStats — com a LINHA AJUSTÁVEL do props.cash: −0,5 / +0,5
 * recalculam tudo na hora, para conferir linhas alternativas. Só leitura dos
 * jogos que o detalhe já trouxe (antigo → recente); nenhuma regra nova.
 */
export function Tendencias({
  blocos,
  linhaBase,
  unidade,
  adversarioSigla,
}: {
  blocos: BlocoJogo[]
  linhaBase: number
  unidade: string
  adversarioSigla: string | null
}) {
  const [linha, setLinha] = useState(linhaBase)
  const jogos = blocos.map((b) => ({ ...b, bateu: b.valor >= linha }))
  const alvo = `+${fmtLinha(linha)} ${unidade}`
  const frases: Frase[] = []

  const ultimo = jogos[jogos.length - 1]!
  let seguidos = 0
  for (let i = jogos.length - 1; i >= 0 && jogos[i]!.bateu === ultimo.bateu; i--) seguidos++
  if (seguidos >= 2) {
    frases.push({
      texto: ultimo.bateu
        ? `Bateu ${alvo} nos últimos ${seguidos} jogos seguidos`
        : `Ficou abaixo de ${alvo} nos últimos ${seguidos} jogos`,
      tom: ultimo.bateu ? 'bom' : 'ruim',
    })
  }
  const acertos = jogos.filter((b) => b.bateu).length
  const taxa = acertos / jogos.length
  frases.push({
    texto: `${acertos} de ${jogos.length} jogos acima de ${alvo}`,
    tom: taxa >= 0.6 ? 'bom' : taxa < 0.4 ? 'ruim' : 'neutro',
  })
  const media = jogos.reduce((t, b) => t + b.valor, 0) / jogos.length
  const folga = media - linha
  frases.push({
    texto: `Média de ${decimal(media)} ${unidade} nesses jogos, ${decimal(Math.abs(folga))} ${folga >= 0 ? 'acima' : 'abaixo'} da linha`,
    tom: folga >= 0 ? 'bom' : 'ruim',
  })
  const valores = jogos.map((b) => b.valor)
  frases.push({ texto: `Variou de ${Math.min(...valores)} a ${Math.max(...valores)} ${unidade}`, tom: 'neutro' })
  if (adversarioSigla) {
    const contra = jogos.filter((b) => b.adversarioSigla === adversarioSigla)
    if (contra.length > 0) {
      const bateuContra = contra.filter((b) => b.bateu).length
      frases.push({
        texto: `Contra ${adversarioSigla}: ${bateuContra} de ${contra.length} acima de ${alvo}`,
        tom: bateuContra / contra.length >= 0.5 ? 'bom' : 'ruim',
      })
    }
  }

  const ajustada = linha !== linhaBase
  return (
    <div className={s.tendenciasCaixa}>
      <div className={s.ajusteLinha} role="group" aria-label="Ajustar a linha">
        <span className={s.ajusteRotulo}>Linha</span>
        <button type="button" onClick={() => setLinha((l) => Math.max(0.5, l - 0.5))} aria-label="Diminuir a linha em 0,5">
          −
        </button>
        <strong className="num" aria-live="polite">
          {fmtLinha(linha)}
        </strong>
        <button type="button" onClick={() => setLinha((l) => l + 0.5)} aria-label="Aumentar a linha em 0,5">
          +
        </button>
        {ajustada && (
          <button type="button" className={s.ajusteVoltar} onClick={() => setLinha(linhaBase)}>
            Voltar para {fmtLinha(linhaBase)}
          </button>
        )}
      </div>
      <p className={s.ajusteApoio}>
        Últimos {jogos.length} jogos contra {alvo}
        {ajustada ? ' · linha alternativa, a nota de confiança vale só para a linha do apito' : ''}
      </p>
      <ul className={s.tendencias}>
        {frases.map((f) => (
          <li key={f.texto} data-tom={f.tom}>
            {f.texto}
          </li>
        ))}
      </ul>
    </div>
  )
}
