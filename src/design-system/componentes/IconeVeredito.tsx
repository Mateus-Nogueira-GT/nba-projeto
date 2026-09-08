import { componente } from '../tokens/componente'

/**
 * ✓ / ✗ DO VEREDITO, nomeado para leitor de tela — a cor nunca é o único
 * sinal, e um glifo Unicode solto não é verbalizado por boa parte dos leitores
 * no nível de pontuação padrão.
 *
 * Vive no design system, e não dentro do card, porque o veredito aparece em
 * dois lugares com a mesma semântica: o rodapé do `CardEntrada` conferido e a
 * linha de apito do perfil do jogador. Dois desenhos do mesmo sinal divergem
 * no dia em que um dos dois muda.
 */
export type IconeVereditoProps = {
  tipo: 'bateu' | 'falhou'
  /** Padrão: a cor do próprio veredito. */
  cor?: string
}

export function IconeVeredito({ tipo, cor }: IconeVereditoProps) {
  const tinta = cor ?? (tipo === 'bateu' ? componente.conferido.bateu : componente.conferido.falhou)
  return (
    <svg
      role="img"
      aria-label={tipo === 'bateu' ? 'Bateu a linha' : 'Não bateu a linha'}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke={tinta}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tipo === 'bateu' ? <path d="M2 7l3.5 3.5L12 4" /> : <path d="M3 3l8 8M11 3l-8 8" />}
    </svg>
  )
}
