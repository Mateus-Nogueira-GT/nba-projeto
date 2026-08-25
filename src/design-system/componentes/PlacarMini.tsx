import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

export type PlacarMiniProps = {
  placar: {
    jogoId: string
    casaSigla: string
    casaPlacar: number
    visitanteSigla: string
    visitantePlacar: number
  }
}

/**
 * Mini-placar do jogo ao vivo — sempre 1º quarto, a única janela em que o
 * Fire Live existe. SEM cronômetro: decisão registrada na spec da identidade
 * 02 ("placar somente de jogos no 1Q, sem cronômetro") — o CJ vence o mockup.
 *
 * O ponto pulsante é redundante com o texto "ao vivo" ao lado — nunca o único
 * sinal — e para de piscar quando o navegador pede menos movimento.
 */
export function PlacarMini({ placar }: PlacarMiniProps) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: `1px solid ${semantico.divisor}`,
        background: componente.contextoFrio.cardGradiente,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
      }}
    >
      <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 16, letterSpacing: 0.5 }}>
        {placar.casaSigla}
      </span>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: semantico.fonteTitulo,
            fontSize: 24,
            letterSpacing: 2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {placar.casaPlacar} · {placar.visitantePlacar}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: semantico.vivoSelo,
            fontWeight: 700,
          }}
        >
          <span>1º Q</span>
          <span
            aria-hidden
            className="ponto-ao-vivo"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: semantico.vivoSelo,
            }}
          />
          <span>ao vivo</span>
        </div>
      </div>
      <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 16, letterSpacing: 0.5 }}>
        {placar.visitanteSigla}
      </span>
    </div>
  )
}
