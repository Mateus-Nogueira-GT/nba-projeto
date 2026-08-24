import { semantico } from '@/design-system/tokens/semantico'

/**
 * ÍCONES DA BARRA — geométricos, em SVG inline, sem emoji.
 *
 * Cada aba tem uma forma fixa (quadrado, quadrado vazado, círculo, losango);
 * a única coisa que muda com o estado é o preenchimento. Ativo preenche em
 * `semantico.acento` (laranja); inativo é só contorno em
 * `semantico.textoSecundario`. Isso é redundância deliberada com o peso da
 * fonte do rótulo e o `aria-current` do link — cor nunca é canal único.
 */
export function IconeAba({
  forma,
  ativo,
}: {
  forma: 'quadrado' | 'quadradoVazado' | 'circulo' | 'losango'
  ativo: boolean
}) {
  const cor = ativo ? semantico.acento : semantico.textoSecundario
  const comum = { width: 18, height: 18, viewBox: '0 0 20 20', 'aria-hidden': true } as const

  if (forma === 'losango')
    return (
      <svg {...comum}>
        <rect
          x={4.5}
          y={4.5}
          width={11}
          height={11}
          rx={2}
          transform="rotate(45 10 10)"
          fill={ativo ? cor : 'none'}
          stroke={cor}
          strokeWidth={1.6}
        />
      </svg>
    )

  if (forma === 'circulo')
    return (
      <svg {...comum}>
        <circle cx={10} cy={10} r={6.5} fill={ativo ? cor : 'none'} stroke={cor} strokeWidth={1.6} />
      </svg>
    )

  // 'quadrado' e 'quadradoVazado' compartilham a mesma forma; só o
  // 'quadrado' preenche quando ativo — o vazado (Ao Vivo) fica sempre em
  // contorno, mudando apenas a cor do contorno.
  return (
    <svg {...comum}>
      <rect
        x={3.5}
        y={3.5}
        width={13}
        height={13}
        rx={4}
        fill={ativo && forma === 'quadrado' ? cor : 'none'}
        stroke={cor}
        strokeWidth={1.6}
      />
    </svg>
  )
}
