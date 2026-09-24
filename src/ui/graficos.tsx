import { LogoTime } from './midia'
import { decimal, linha as formatarLinha } from './formato'
import s from './graficos.module.css'

type Jogo = { valor: number; bateu: boolean }

/**
 * Minigráfico da linha da tabela: barras proporcionais ao valor, verde quando
 * bateu, vermelho quando não. Recebe do mais ANTIGO para o mais recente.
 */
export function Minigrafico({
  jogos,
  altura = 28,
  valores = false,
  destacarUltimo = false,
}: {
  jogos: readonly Jogo[]
  altura?: number
  /** Escreve o valor dentro de cada barra — a leitura do card antigo. */
  valores?: boolean
  /** Contorna a última barra: é o jogo desta rodada. */
  destacarUltimo?: boolean
}) {
  if (jogos.length === 0) return <span className={s.semDado}>—</span>
  const maximo = Math.max(...jogos.map((j) => j.valor), 1)
  const acertos = jogos.filter((j) => j.bateu).length
  const sequencia = jogos.map((j) => `${j.valor} ${j.bateu ? 'bateu' : 'não bateu'}`).join(', ')
  return (
    <span
      className={`${s.mini} ${valores ? s.miniValores : ''}`}
      style={{ height: valores ? undefined : altura }}
      role="img"
      aria-label={`Bateu ${acertos} de ${jogos.length}. Do mais antigo ao mais recente: ${sequencia}${destacarUltimo ? '. A última é a desta rodada' : ''}`}
    >
      {jogos.map((j, i) => {
        const ultimo = destacarUltimo && i === jogos.length - 1
        return valores ? (
          <span key={i} className={s.miniCaixa} data-bateu={j.bateu} data-ultimo={ultimo || undefined}>
            {j.valor}
          </span>
        ) : (
          <span
            key={i}
            className={s.miniBarra}
            data-bateu={j.bateu}
            data-ultimo={ultimo || undefined}
            style={{ height: `${Math.max(12, (j.valor / maximo) * 100)}%` }}
          />
        )
      })}
    </span>
  )
}

/**
 * Gráfico de barras do detalhe: um jogo por coluna, valor escrito na barra,
 * linha do apito tracejada, logo do adversário embaixo. Antigo → recente.
 */
export function GraficoBarras({
  jogos,
  linha,
}: {
  jogos: readonly (Jogo & { adversarioSigla: string })[]
  linha: number | null
}) {
  if (jogos.length === 0) return null
  const topo = Math.max(...jogos.map((j) => j.valor), linha ?? 0) * 1.15 || 1
  const acertos = jogos.filter((j) => j.bateu).length
  const media = jogos.reduce((t, j) => t + j.valor, 0) / jogos.length
  const resumo =
    linha === null
      ? `Últimos ${jogos.length} jogos, média ${decimal(media)}`
      : `Bateu a linha de ${formatarLinha(linha)} em ${acertos} dos ${jogos.length} jogos`
  return (
    <figure className={s.grafico}>
      <div className={s.area} role="img" aria-label={`${resumo}. ${jogos.map((j) => `${j.adversarioSigla} ${j.valor}`).join(', ')}`}>
        {linha !== null && (
          <div className={s.linha} style={{ bottom: `${(linha / topo) * 100}%` }} aria-hidden>
            <span className={`${s.linhaRotulo} num`}>{formatarLinha(linha)}</span>
          </div>
        )}
        {jogos.map((j, i) => (
          <div key={i} className={s.coluna} aria-hidden>
            <div
              className={s.barra}
              data-bateu={linha === null ? undefined : j.bateu}
              style={{ height: `${Math.max(6, (j.valor / topo) * 100)}%` }}
            >
              <span className={`${s.valor} num`}>{j.valor}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={s.eixo} aria-hidden>
        {jogos.map((j, i) => (
          <div key={i} className={s.adversario}>
            <LogoTime sigla={j.adversarioSigla} tamanho={20} />
            <span>{j.adversarioSigla}</span>
          </div>
        ))}
      </div>
      <figcaption className="so-leitor">{resumo}</figcaption>
    </figure>
  )
}
