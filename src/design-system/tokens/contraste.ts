/**
 * Contraste WCAG 2.1 — matemática pura, sem dependência.
 *
 * Existe para que "passa em AA" seja teste, não opinião. Ver
 * docs/04-design-system.md > Acessibilidade.
 */

export type Rgb = { r: number; g: number; b: number }

/**
 * Aceita `#RGB`, `#RRGGBB` e `rgba(r,g,b,a)`.
 *
 * A tinta translúcida entrou no sistema com o texto em opacidades da
 * identidade 04 e virou COR DE CANAL na 06 (o rótulo do Randola). Medir
 * contraste de uma tinta com alfa exige compor sobre o fundo antes — sem
 * isso, `parseInt` devolve NaN e o teste passa a afirmar nada.
 */
export function corParaRgba(cor: string): Rgb & { a: number } {
  const funcional = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(cor)
  if (funcional) {
    return {
      r: Number(funcional[1]),
      g: Number(funcional[2]),
      b: Number(funcional[3]),
      a: funcional[4] === undefined ? 1 : Number(funcional[4]),
    }
  }
  return { ...hexParaRgb(cor), a: 1 }
}

/** A tinta `frente` composta sobre `fundo` — o que o olho vê de verdade. */
export function sobrepor(frente: string, fundo: string): Rgb {
  const f = corParaRgba(frente)
  const t = corParaRgba(fundo)
  return {
    r: f.r * f.a + t.r * (1 - f.a),
    g: f.g * f.a + t.g * (1 - f.a),
    b: f.b * f.a + t.b * (1 - f.a),
  }
}

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
  const { r, g, b } = corParaRgba(hex)

  const linear = (canal: number): number => {
    const c = canal / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function rgbParaHex({ r, g, b }: Rgb): string {
  const par = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${par(r)}${par(g)}${par(b)}`
}

export function razaoDeContraste(corA: string, corB: string): number {
  // Tinta com alfa é COMPOSTA sobre a outra antes de medir: "branco a 70% sobre
  // o cartão" é um cinza claro concreto, e é ele que o olho lê.
  const a = luminancia(rgbParaHex(sobrepor(corA, corB)))
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
