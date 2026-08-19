import type { NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { APITO, TURBO } from '../tokens/css'

export type AnelProps = {
  nivelApito: NivelApito
  /** Nota de confiança da análise. NUNCA chamar de probabilidade (P12). */
  confianca: number | null
  turbo?: boolean
}

/**
 * O anel: canal visual do NÍVEL DO APITO, com a confiança como número dentro.
 *
 * A fusão da badge de confiança neste anel é o ADR-0005 — antes eram dois
 * elementos coloridos disputando o mesmo card com escalas contraditórias.
 *
 * Redundância obrigatória: o número do nível fica visível abaixo do anel, para
 * que a informação não dependa de enxergar a cor.
 */
export function Anel({ nivelApito, confianca, turbo = false }: AnelProps) {
  const { cor, rotulo } = turbo ? TURBO : APITO[nivelApito]
  const descricao = turbo
    ? `Turbo · confiança ${confianca ?? '—'}`
    : `${rotulo} · confiança ${confianca ?? '—'}`

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
      role="img"
      aria-label={descricao}
    >
      <div
        style={{
          width: componente.anelDiametro,
          height: componente.anelDiametro,
          borderRadius: '50%',
          background: cor,
          // Texto ESCURO dentro do anel. Vale para as quatro cores, não só o
          // amarelo: verificado em __tests__/tokens.test.ts.
          color: componente.anelTexto,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: 20,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          boxShadow: turbo ? `0 0 0 3px ${cor}55` : undefined,
        }}
      >
        {confianca === null ? '—' : Math.round(confianca)}
      </div>

      <span style={{ fontSize: 11, color: componente.cardTextoApoio, letterSpacing: 0.4 }}>
        {turbo ? '⚡ TURBO' : `NÍVEL ${nivelApito}`}
      </span>
    </div>
  )
}
