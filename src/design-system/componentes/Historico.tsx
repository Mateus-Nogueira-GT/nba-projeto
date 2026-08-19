import { componente } from '../tokens/componente'

export type HistoricoProps = {
  /** true = bateu a linha naquele jogo. Mais recente à esquerda. */
  jogos: boolean[]
}

export function Historico({ jogos }: HistoricoProps) {
  const bateu = jogos.filter(Boolean).length

  return (
    <div
      style={{ display: 'flex', gap: 4 }}
      role="img"
      aria-label={`Últimas ${jogos.length} partidas: bateu a linha em ${bateu}`}
    >
      {jogos.map((acertou, i) => (
        <span
          key={i}
          style={{
            width: 14,
            height: 6,
            borderRadius: 2,
            background: acertou ? componente.historicoAtivo : componente.historicoInativo,
          }}
        />
      ))}
    </div>
  )
}
