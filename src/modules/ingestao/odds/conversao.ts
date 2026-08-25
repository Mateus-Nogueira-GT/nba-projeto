import type { Atributo } from '../../motor/tipos'

/**
 * Conversões da FRONTEIRA de odds — puras, e só aqui.
 *
 * Depois da porta, odd é SEMPRE decimal com 2 casas e linha é SEMPRE a
 * inteira do CJ. Nenhum formato de provedor (americano, meio ponto,
 * prop_type) atravessa para dentro do sistema.
 */

/** −110 → 1.91 · +150 → 2.50. Zero/NaN não são odds. */
export function americanaParaDecimal(americana: number): number {
  if (!Number.isFinite(americana) || americana === 0) {
    throw new Error(`odd americana inválida: ${americana}`)
  }
  const decimal = americana > 0 ? 1 + americana / 100 : 1 + 100 / Math.abs(americana)
  return Math.round(decimal * 100) / 100
}

/**
 * "24.5" no lado OVER significa "25 ou mais" — exatamente a linha `25+` do
 * CJ. Linha INTEIRA do provedor devolve null: over de "25" é outro mercado
 * (pode empatar/devolver), não equivale a "N+", e não atravessa.
 */
export function linhaDoLadoOver(lineValue: string): number | null {
  const n = Number(lineValue)
  if (!Number.isFinite(n) || lineValue.trim() === '') return null
  return Number.isInteger(n) ? null : Math.ceil(n)
}

/** Só os três mercados da Lista Secreta atravessam; o resto morre na porta. */
export function atributoDoPropType(propType: string): Atributo | null {
  switch (propType) {
    case 'points':
      return 'PONTOS'
    case 'rebounds':
      return 'REBOTES'
    case 'assists':
      return 'ASSISTENCIAS'
    default:
      return null
  }
}
