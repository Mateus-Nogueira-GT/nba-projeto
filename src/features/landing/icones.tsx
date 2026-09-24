import type { ReactNode } from 'react'

/** Ícones de traço da landing (desenho no estilo Lucide, 24×24). */
function Base({ children, tamanho = 20 }: { children: ReactNode; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

type P = { tamanho?: number }

export const IcLista = (p: P) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Base>
)
export const IcAoVivo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" />
  </Base>
)
export const IcAlvo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Base>
)
export const IcTendencia = (p: P) => (
  <Base {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Base>
)
export const IcBarras = (p: P) => (
  <Base {...p}>
    <path d="M3 3v18h18" />
    <path d="M8 17v-5M13 17V8M18 17v-9" />
  </Base>
)
export const IcCarteira = (p: P) => (
  <Base {...p}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </Base>
)
export const IcTrofeu = (p: P) => (
  <Base {...p}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M6 4h12v6a6 6 0 0 1-12 0z" />
    <path d="M9 21h6M12 16v5" />
  </Base>
)
export const IcRobo = (p: P) => (
  <Base {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 13v1M15 13v1M2 14h2M20 14h2" />
  </Base>
)
export const IcSino = (p: P) => (
  <Base {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Base>
)
export const IcRaio = (p: P) => (
  <Base {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
  </Base>
)
export const IcEscudo = (p: P) => (
  <Base {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
)
export const IcCheck = (p: P) => (
  <Base {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
)
export const IcX = (p: P) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)
export const IcSeta = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
)
export const IcEntrar = (p: P) => (
  <Base {...p}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="m10 17 5-5-5-5M15 12H3" />
  </Base>
)
export const IcPresente = (p: P) => (
  <Base {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </Base>
)
export const IcFiltro = (p: P) => (
  <Base {...p}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
  </Base>
)
export const IcMais = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)
