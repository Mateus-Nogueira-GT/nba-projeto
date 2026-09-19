import { componente } from '../tokens/componente'

export type SeloProps = {
  icone: string
  rotulo: string
  cor?: string
}

/**
 * Marcador textual com ícone. Existe para que turbo, modo fire e cruzamento de
 * OPD tenham rótulo escrito — cor e efeito nunca carregam sentido sozinhos.
 */
export function Selo({ icone, rotulo, cor }: SeloProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        background: componente.marcadorOpdFundo,
        color: cor ?? componente.marcadorOpdTexto,
        border: cor ? `1px solid ${cor}` : `1px solid ${componente.cardDivisor}`,
      }}
    >
      <span aria-hidden>{icone}</span>
      {rotulo}
    </span>
  )
}
