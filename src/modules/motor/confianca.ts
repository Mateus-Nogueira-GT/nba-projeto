import { bonusConfianca, confiancaBase, linhasDoNivel as linhasPorAtributo } from './atributos'
import type { Ruleset } from './ruleset/schema'
import type { Atributo, Nivel, NivelApito } from './tipos'

/**
 * NOTA DE CONFIANÇA da análise do CJ — não é probabilidade de evento.
 * Confirmado pelo cliente (P12). Nunca renomear para "probabilidade".
 */
export function calcularConfianca(
  nivel: Nivel,
  atributo: Atributo,
  linha: number,
  nivelApito: NivelApito,
  ruleset: Ruleset,
): number | null {
  const base = confiancaBase(nivel, atributo, linha, ruleset)
  if (base === undefined) return null

  // Randola tem bônus 0 em todos os níveis (P8) — sempre a tabela base.
  return base + bonusConfianca(nivel, atributo, nivelApito, ruleset)
}

/** Linhas disponíveis para um nível e atributo, na ordem do ruleset. */
export function linhasDoNivel(nivel: Nivel, atributo: Atributo, ruleset: Ruleset): number[] {
  return linhasPorAtributo(nivel, atributo, ruleset)
}

export type FaixaConfianca = { grau: 1 | 2 | 3 | 4 | 5; rotulo: string }

/** A faixa VISUAL do %. Abaixo da primeira faixa cai no grau 1 — confiança
 *  fora da amplitude esperada não pode sumir da tela. */
export function faixaDaConfianca(valor: number | null, ruleset: Ruleset): FaixaConfianca | null {
  if (valor === null) return null
  const ordenadas = [...ruleset.confianca_exibicao.faixas].sort((a, b) => a.de - b.de)
  let atual = ordenadas[0]!
  for (const faixa of ordenadas) if (valor >= faixa.de) atual = faixa
  return { grau: atual.grau, rotulo: atual.rotulo }
}
