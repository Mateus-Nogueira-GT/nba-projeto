import type { JogoResumo } from '@/modules/entrega/lista-por-jogo'
import { semantico } from '@/design-system/tokens/semantico'

/**
 * OS JOGOS DO DIA, SEM O SINAL — a home e o Fire Live do grátis.
 *
 * Mostra que há rodada e quais confrontos; quem apitou, o nível e a
 * confiança são 100% pagos (spec, decisão 5). Recebe o mesmo `JogoResumo`
 * que a home paga usa nos cabeçalhos de seção — nada é lido a mais.
 */
export function JogosDoDia({ jogos, fuso }: { jogos: JogoResumo[]; fuso: string }) {
  if (jogos.length === 0) {
    return <p style={{ color: semantico.textoSecundario }}>Sem jogos hoje.</p>
  }
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  return (
    <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {jogos.map((j) => (
        <li
          key={j.id}
          style={{ display: 'flex', justifyContent: 'space-between', fontFamily: semantico.fonteRotulo }}
        >
          <span>
            {j.casaSigla} × {j.visitanteSigla}
          </span>
          <span style={{ color: semantico.textoSecundario }}>
            {j.status === 'AO_VIVO' && j.placarCasa !== null && j.placarVisitante !== null
              ? `${j.placarCasa}–${j.placarVisitante} · Q${j.quartoAtual ?? '–'}`
              : hora.format(j.dataHoraUtc)}
          </span>
        </li>
      ))}
    </ul>
  )
}
