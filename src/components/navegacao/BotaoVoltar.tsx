import Link from 'next/link'

import { semantico } from '@/design-system/tokens/semantico'

/**
 * VOLTAR — o quadrado de 34 px com o chevron do artboard (identidade 04).
 *
 * Fica em um componente só porque a gramática se aprende UMA vez (spec 04,
 * §2/§3): o detalhe do apito desenha a sobrancelha por conta própria — o
 * título dele é o nome do jogador, no hero — e o `CabecalhoTela` desenha a das
 * outras telas. Duas cópias do mesmo botão foi como a mesma rota acabou com o
 * chevron em um caminho e o glifo "←" no estado vazio.
 *
 * O traço é `currentColor`, não o hex do mockup: a cor vem do token.
 */
export function BotaoVoltar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Voltar"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: 10,
        border: `1.5px solid ${semantico.acento}`,
        color: semantico.acento,
        textDecoration: 'none',
      }}
    >
      <svg width="15" height="16" viewBox="0 0 15 16" aria-hidden focusable="false">
        <path
          d="M10 3L5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  )
}
