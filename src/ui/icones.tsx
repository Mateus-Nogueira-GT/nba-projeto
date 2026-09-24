import type { ReactNode, SVGProps } from 'react'

/**
 * Ícones de traço, grade 24, traço 1.75 — um só desenho para o app inteiro.
 * Sempre decorativos (`aria-hidden`): quem dá nome à ação é o texto ou o
 * `aria-label` do controle que os contém.
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { tamanho?: number }

function Icone({ tamanho = 20, children, ...resto }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  )
}

export const IconeEntradas = (p: Props) => (
  <Icone {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Icone>
)

export const IconeAoVivo = (p: Props) => (
  <Icone {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.48M7.76 16.24a6 6 0 0 1 0-8.48" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </Icone>
)

export const IconeStats = (p: Props) => (
  <Icone {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icone>
)

export const IconeGestao = (p: Props) => (
  <Icone {...p}>
    <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
  </Icone>
)

export const IconeResultados = (p: Props) => (
  <Icone {...p}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 6h2.5a1.5 1.5 0 0 1 0 3H17M7 6H4.5a1.5 1.5 0 0 0 0 3H7" />
  </Icone>
)

export const IconeMetodologia = (p: Props) => (
  <Icone {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </Icone>
)

export const IconePerfil = (p: Props) => (
  <Icone {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icone>
)

export const IconeAdmin = (p: Props) => (
  <Icone {...p}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
  </Icone>
)

export const IconeRecolher = (p: Props) => (
  <Icone {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 10l-2 2 2 2" />
  </Icone>
)

export const IconeBusca = (p: Props) => (
  <Icone {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icone>
)

export const IconeSino = (p: Props) => (
  <Icone {...p}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icone>
)

export const IconeFechar = (p: Props) => (
  <Icone {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icone>
)

export const IconeVoltar = (p: Props) => (
  <Icone {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icone>
)

export const IconeAvancar = (p: Props) => (
  <Icone {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icone>
)

export const IconeAbaixo = (p: Props) => (
  <Icone {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icone>
)

export const IconeOrdenar = (p: Props) => (
  <Icone {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icone>
)

export const IconeFiltros = (p: Props) => (
  <Icone {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icone>
)

export const IconeMais = (p: Props) => (
  <Icone {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icone>
)

export const IconeTurbo = (p: Props) => (
  <Icone {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Icone>
)

export const IconeFogo = (p: Props) => (
  <Icone {...p}>
    <path d="M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-9-1.5 2-2 3.5-2 5-1-1-2-2.5-2-5-3 2.5-6 5.5-6 9 0 4.3 3 7 7 7Z" />
  </Icone>
)

export const IconeRelogio = (p: Props) => (
  <Icone {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icone>
)

export const IconeExterno = (p: Props) => (
  <Icone {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icone>
)

export const IconeInfo = (p: Props) => (
  <Icone {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h0" />
  </Icone>
)

export const IconeOcultar = (p: Props) => (
  <Icone {...p}>
    <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.3M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </Icone>
)

export const IconeAssistente = (p: Props) => (
  <Icone {...p}>
    <path d="M12 2v3" />
    <circle cx="12" cy="2" r="0.6" />
    <rect x="4" y="5" width="16" height="13" rx="4" />
    <path d="M2 10v4M22 10v4" />
    <path d="M9.5 11v1.5M14.5 11v1.5" strokeWidth={2.4} />
    <path d="M9.5 15.2h5" />
  </Icone>
)

export const IconeConstrucao = (p: Props) => (
  <Icone {...p}>
    <path d="M2 20h20M5 20V9l7-5 7 5v11" />
    <path d="M9 20v-6h6v6" />
  </Icone>
)
