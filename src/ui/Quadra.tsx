import s from './Quadra.module.css'

/**
 * Quadra ilustrativa do placar ao vivo. O feed traz placar e quarto — não traz
 * coordenadas de arremesso, posse nem posição de jogador —, então a quadra é
 * cenário: nada nela é dado inventado. Cores só da paleta do Manual: piso
 * azul-escuro, garrafões no azul NIP, linhas brancas; sem o bronze do antigo
 * (laranja não é cor de interface da NIP).
 *
 * As cores vêm dos tokens `--quadra-*` (fixos: cenário não troca de tema) e
 * entram por `style`, não por atributo: atributo de apresentação do SVG com
 * `var()` é terreno instável entre navegadores, `style` não.
 */
const PISO = { fill: 'var(--quadra-piso)' }
const AZUL = { fill: 'var(--quadra-azul)' }
const LINHA = { stroke: 'var(--quadra-linha)' }

export function Quadra() {
  return (
    <div className={s.quadra} aria-hidden="true">
      <svg viewBox="0 0 600 320" fill="none" focusable="false">
        <defs>
          <linearGradient id="piso-nip" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--quadra-azul)' }} stopOpacity="0.22" />
            <stop offset="0.5" style={{ stopColor: 'var(--quadra-meio)' }} stopOpacity="0.9" />
            <stop offset="1" style={{ stopColor: 'var(--quadra-vermelho)' }} stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="598" height="318" rx="14" style={PISO} />
        <rect x="18" y="18" width="564" height="284" rx="2" fill="url(#piso-nip)" />
        <g style={LINHA} strokeOpacity="0.04">
          {[50, 82, 114, 146, 178, 210, 242, 274].map((y) => (
            <path key={y} d={`M18 ${y}H582`} />
          ))}
        </g>
        <g style={AZUL} fillOpacity="0.18">
          <path d="M18 112H130V208H18Z" />
          <path d="M582 112H470V208H582Z" />
          <circle cx="300" cy="160" r="36" />
        </g>
        <g style={LINHA} strokeOpacity="0.62" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="18" y="18" width="564" height="284" rx="2" />
          <path d="M300 18V302" />
          <circle cx="300" cy="160" r="36" />
          <circle cx="300" cy="160" r="5" />
          <path d="M18 112H130V208H18M582 112H470V208H582" />
          <path d="M130 124A36 36 0 0 1 130 196M470 124A36 36 0 0 0 470 196" />
          <path d="M18 38H65A132 132 0 0 1 65 282H18M582 38H535A132 132 0 0 0 535 282H582" />
          <path d="M42 146V174M558 146V174" strokeWidth="3" />
          <circle cx="49" cy="160" r="6" strokeOpacity="0.95" strokeWidth="2" />
          <circle cx="551" cy="160" r="6" strokeOpacity="0.95" strokeWidth="2" />
        </g>
        <g style={LINHA} strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="4 5">
          <path d="M130 124A36 36 0 0 0 130 196M470 124A36 36 0 0 1 470 196" />
        </g>
      </svg>
    </div>
  )
}
