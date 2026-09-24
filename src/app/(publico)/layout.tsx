import type { ReactNode } from 'react'

/** Telas fora do app logado: sem sidebar, sem barra inferior. */
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return children
}
