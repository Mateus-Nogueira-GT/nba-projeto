import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

export type SeloContextoProps = {
  /** O universo da tela: pré-live (Lista Secreta, Resultados) ou ao vivo (Fire Live). */
  contexto: 'preLive' | 'aoVivo'
}

/**
 * SELO DE CONTEXTO — a pílula PREENCHIDA no canto do cabeçalho da tela:
 * "PRÉ-LIVE" laranja ou "■ AO VIVO" vermelho.
 *
 * Desenhada na identidade 03 e nunca implementada (docs/04-design-system.md,
 * "Pendência de lapidação"); entra na 04 como o mesmo componente vestido pelos
 * dois universos via `componente.seloContexto`. O quadrado do ao vivo é
 * decorativo e redundante com o texto — cor nunca é o único canal.
 */
export function SeloContexto({ contexto }: SeloContextoProps) {
  const cores = componente.seloContexto[contexto]
  const aoVivo = contexto === 'aoVivo'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: cores.texto,
        background: cores.fundo,
      }}
    >
      {aoVivo && (
        <span
          aria-hidden
          style={{ display: 'inline-block', width: 7, height: 7, background: cores.texto }}
        />
      )}
      {aoVivo ? 'AO VIVO' : 'PRÉ-LIVE'}
    </span>
  )
}
