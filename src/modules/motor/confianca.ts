import type { Ruleset } from './ruleset/schema'
import type { Nivel, NivelApito } from './tipos'

/**
 * NOTA DE CONFIANÇA da análise do CJ — não é probabilidade de evento.
 * Confirmado pelo cliente (P12). Nunca renomear para "probabilidade".
 */
export function calcularConfianca(
  nivel: Nivel,
  linha: number,
  nivelApito: NivelApito,
  ruleset: Ruleset,
): number | null {
  const base = ruleset.confianca.base[nivel]?.[String(linha)]
  if (base === undefined) return null

  // Randola tem bônus 0 em todos os níveis (P8) — sempre a tabela base.
  const bonus = ruleset.confianca.bonus_por_nivel_apito[nivel]?.[String(nivelApito)] ?? 0

  return base + bonus
}

/** Linhas disponíveis para um nível, na ordem do ruleset. */
export function linhasDoNivel(nivel: Nivel, ruleset: Ruleset): number[] {
  return Object.keys(ruleset.confianca.base[nivel] ?? {})
    .map(Number)
    .sort((a, b) => a - b)
}
