/**
 * Contraste WCAG 2.1 — matemática pura, sem dependência.
 *
 * Existe para que "passa em AA" seja teste, não opinião. Ver
 * docs/04-design-system.md > Acessibilidade.
 */

export type Rgb = { r: number; g: number; b: number }

export function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace('#', '')
  const completo =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo

  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  }
}

/** Luminância relativa — WCAG 2.1, 1.4.3. */
export function luminancia(hex: string): number {
  const { r, g, b } = hexParaRgb(hex)

  const linear = (canal: number): number => {
    const c = canal / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function razaoDeContraste(corA: string, corB: string): number {
  const a = luminancia(corA)
  const b = luminancia(corB)
  const claro = Math.max(a, b)
  const escuro = Math.min(a, b)
  return (claro + 0.05) / (escuro + 0.05)
}

/** Mínimos da WCAG AA. */
export const AA = {
  /** Texto normal. */
  texto: 4.5,
  /** Texto grande (>= 18.66px bold ou 24px) e elementos gráficos. */
  grafico: 3,
} as const

export function passaAA(corA: string, corB: string, tipo: keyof typeof AA): boolean {
  return razaoDeContraste(corA, corB) >= AA[tipo]
}

/** Escolhe entre texto claro e escuro o que tiver MAIS contraste sobre o fundo. */
export function melhorTextoSobre(fundo: string, claro: string, escuro: string): string {
  return razaoDeContraste(fundo, claro) >= razaoDeContraste(fundo, escuro) ? claro : escuro
}
