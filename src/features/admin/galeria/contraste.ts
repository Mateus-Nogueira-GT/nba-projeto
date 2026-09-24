import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type Token = { nome: string; valor: string; grupo: string }

/**
 * Lê as cores DIRETO de `src/ui/tokens.css` — a galeria mostra o que o app
 * usa, não uma cópia que envelhece. O grupo é o último comentário de seção
 * antes do token.
 */
export async function coresDosTokens(): Promise<Token[]> {
  const css = await readFile(path.join(process.cwd(), 'src/ui/tokens.css'), 'utf8')
  const raiz = css.slice(css.indexOf(':root'), css.indexOf('@media'))
  const tokens: Token[] = []
  let grupo = 'Geral'
  for (const linha of raiz.split('\n')) {
    const comentario = linha.match(/^\s*\/\*\s*([^*]+?)\s*\*\/\s*$/)
    if (comentario) {
      grupo = comentario[1]!.replace(/[.:—].*$/, '').trim() || grupo
      continue
    }
    const decl = linha.match(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/)
    if (decl) tokens.push({ nome: decl[1]!, valor: decl[2]!, grupo })
  }
  return tokens
}

type Rgba = [number, number, number, number]

function lerCor(cor: string): Rgba | null {
  const hex = cor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const rgb = cor.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  return null
}

function sobre(cor: Rgba, fundo: Rgba): Rgba {
  const a = cor[3]
  return [cor[0] * a + fundo[0] * (1 - a), cor[1] * a + fundo[1] * (1 - a), cor[2] * a + fundo[2] * (1 - a), 1]
}

function luminancia([r, g, b]: Rgba): number {
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste WCAG 2.1 da cor sobre o fundo (cor translúcida é composta antes). */
export function contraste(cor: string, fundo: string): number | null {
  const c = lerCor(cor)
  const f = lerCor(fundo)
  if (!c || !f) return null
  const l1 = luminancia(sobre(c, f))
  const l2 = luminancia(f)
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (claro + 0.05) / (escuro + 0.05)
}
