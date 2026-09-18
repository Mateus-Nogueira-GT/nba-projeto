import { semantico } from '../tokens/semantico'

/**
 * Quadra ilustrativa. O feed oferece placar e quarto, sem coordenadas de
 * jogadores/arremessos ou posse. Esses eventos não são simulados aqui.
 */
export function QuadraAoVivo() {
  return (
    <div className="quadra-ao-vivo" aria-hidden="true">
      <svg viewBox="0 0 600 320" fill="none" focusable="false">
        <rect
          x="1"
          y="1"
          width="598"
          height="318"
          rx="14"
          fill={semantico.nivelSuporte}
          fillOpacity="0.2"
        />
        <rect
          x="18"
          y="18"
          width="564"
          height="284"
          rx="2"
          fill={semantico.nivelSuporte}
          fillOpacity="0.12"
        />
        <g stroke={semantico.nivelSuporte} strokeOpacity="0.12">
          {[50, 82, 114, 146, 178, 210, 242, 274].map((y) => (
            <path key={y} d={`M18 ${y}H582`} />
          ))}
        </g>
        <g fill={semantico.acento} fillOpacity="0.1">
          <path d="M18 112H130V208H18Z" />
          <path d="M582 112H470V208H582Z" />
          <circle cx="300" cy="160" r="36" />
        </g>
        <g stroke={semantico.texto70} strokeWidth="1.6" strokeLinejoin="round">
          <rect x="18" y="18" width="564" height="284" rx="2" />
          <path d="M300 18V302" />
          <circle cx="300" cy="160" r="36" />
          <circle cx="300" cy="160" r="5" />
          <path d="M18 112H130V208H18M582 112H470V208H582" />
          <path d="M130 124A36 36 0 0 1 130 196M470 124A36 36 0 0 0 470 196" />
          <path d="M18 38H65A132 132 0 0 1 65 282H18M582 38H535A132 132 0 0 0 535 282H582" />
          <path d="M42 146V174M558 146V174" strokeWidth="3" />
          {/* As cestas: TRAÇO, e traço nunca veste o acento (identidade 05) —
              o azul do manual tem o matiz do turbo, e um contorno azul aqui
              seria um sinal de apito desenhado na quadra. */}
          <circle cx="49" cy="160" r="6" stroke={semantico.texto100} strokeWidth="2" />
          <circle cx="551" cy="160" r="6" stroke={semantico.texto100} strokeWidth="2" />
          <path d="M49 142A18 18 0 0 1 49 178M551 142A18 18 0 0 0 551 178" />
        </g>
        <g stroke={semantico.texto55} strokeWidth="1.2" strokeDasharray="4 5">
          <path d="M130 124A36 36 0 0 0 130 196M470 124A36 36 0 0 1 470 196" />
        </g>
      </svg>
    </div>
  )
}
