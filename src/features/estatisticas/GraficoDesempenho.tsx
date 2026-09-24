import Link from 'next/link'
import type { LinhaHistorico } from '@/modules/entrega/estatisticas/jogador'
import type { ContextoEstatisticas } from '@/modules/entrega/estatisticas/rotas'
import { decimal } from '@/ui/formato'
import { LogoTime } from '@/ui/midia'
import { diaMes } from './regras'
import s from './Grafico.module.css'

/** Precisam bater com Grafico.module.css (.trilho e .eixo + gap). */
const ALTURA_TRILHO = 160
const ALTURA_EIXO = 52

const ROTULO: Record<ContextoEstatisticas['atributo'], string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

/**
 * O atributo jogo a jogo, do mais antigo ao mais recente. Aqui não há linha de
 * aposta — a aba não fala de estratégia —, só a média do recorte tracejada.
 * A barra é verde quando o jogo ficou na média ou acima e vermelha abaixo.
 * DNP e pendente aparecem como tal, nunca como zero.
 */
export function GraficoDesempenho({
  historico,
  atributo,
  fuso,
  hrefDoJogo,
}: {
  historico: LinhaHistorico[]
  atributo: ContextoEstatisticas['atributo']
  fuso: string
  hrefDoJogo: (id: string) => string
}) {
  if (historico.length === 0) return <p className={s.vazio}>Nenhuma partida disponível neste recorte.</p>
  const valor = (l: LinhaHistorico) =>
    atributo === 'PONTOS' ? l.pontos : atributo === 'REBOTES' ? l.rebotes : l.assistencias
  const conferidos = historico.filter((l) => l.estado === 'CONFERIDO')
  const maior = Math.max(1, ...conferidos.map(valor))
  const media = conferidos.length > 0 ? conferidos.reduce((t, l) => t + valor(l), 0) / conferidos.length : null
  const topo = maior * 1.15
  const jogos = [...historico].reverse()

  return (
    <figure className={s.grafico}>
      <div className={s.rolagem}>
        <ol
          className={s.area}
          style={{ minWidth: jogos.length * 44 }}
          aria-label={`${ROTULO[atributo]} por partida, da mais antiga para a mais recente`}
        >
          {media !== null && (
            <li className={s.media} style={{ bottom: `${ALTURA_EIXO + (media / topo) * ALTURA_TRILHO}px` }} aria-hidden>
              <span className={`${s.mediaRotulo} num`}>média {decimal(media)}</span>
            </li>
          )}
          {jogos.map((l) => {
            const conferido = l.estado === 'CONFERIDO'
            // Reunião 23/09: acima da média do recorte em verde, abaixo em vermelho.
            const lado = !conferido || media === null ? undefined : valor(l) >= media ? 'acima' : 'abaixo'
            const rotulo = conferido ? String(valor(l)) : l.estado === 'DNP' ? 'DNP' : 'Pend.'
            return (
              <li key={l.jogoId} className={s.coluna}>
                <Link
                  href={hrefDoJogo(l.jogoId)}
                  className={s.link}
                  aria-label={`${diaMes(l.data, fuso)}${l.adversarioSigla ? `, ${l.emCasa ? 'contra' : 'em'} ${l.adversarioSigla}` : ''}: ${conferido ? `${valor(l)} ${ROTULO[atributo].toLowerCase()}` : l.estado === 'DNP' ? 'não jogou' : 'dado pendente'}`}
                >
                  <span className={s.trilho}>
                    <span className={`${s.valor} num`} data-estado={l.estado}>
                      {rotulo}
                    </span>
                    <span
                      className={s.barra}
                      data-estado={l.estado}
                      data-lado={lado}
                      style={{ height: conferido ? `${Math.max(3, (valor(l) / topo) * 100)}%` : '3%' }}
                    />
                  </span>
                  <span className={s.eixo}>
                    {l.adversarioSigla && <LogoTime sigla={l.adversarioSigla} tamanho={20} />}
                    <span className="num">{diaMes(l.data, fuso)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
      {media !== null && (
        <figcaption className={s.legenda}>
          <span data-lado="acima">Na média ou acima</span>
          <span data-lado="abaixo">Abaixo da média</span>
        </figcaption>
      )}
    </figure>
  )
}
