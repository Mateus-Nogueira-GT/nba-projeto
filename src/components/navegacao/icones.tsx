import { semantico } from '@/design-system/tokens/semantico'

/**
 * ÍCONES DA BARRA — geométricos, em SVG inline, sem emoji.
 *
 * Cada aba tem uma forma fixa (quadrado, quadrado vazado, círculo, losango);
 * TODAS preenchem em `semantico.acento` (laranja) quando ativas — cor nunca é
 * canal único, então o preenchimento precisa mudar de estado em toda aba, não
 * só em algumas. `quadrado` e `quadradoVazado` continuam visualmente
 * diferentes mesmo preenchendo as duas: o que as distingue é o RAIO DO CANTO
 * (`rx={4}` contra `rx={1}`), não o preenchimento. Inativo é só contorno em
 * `semantico.textoSecundario`. Isso é redundância deliberada com o peso da
 * fonte do rótulo e o `aria-current` do link.
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

  // 'quadrado' e 'quadradoVazado' compartilham a mesma forma base; a única
  // diferença entre as duas é o raio do canto — as duas preenchem quando
  // ativas.
  return (
    <svg {...comum}>
      <rect
        x={3.5}
        y={3.5}
        width={13}
        height={13}
        rx={forma === 'quadrado' ? 4 : 1}
        fill={ativo ? cor : 'none'}
        stroke={cor}
        strokeWidth={1.6}
      />
    </svg>
  )
}
