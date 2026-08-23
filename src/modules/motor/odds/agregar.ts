import type { Ruleset } from '../ruleset/schema'
import type { Nivel } from '../tipos'

export type OrigemOdds = 'CASAS' | 'TABELA_ESTATICA'

/** Sempre faixa (min–max), nunca odd única — `odds.exibicao` do ruleset. */
export type FaixaOdds = {
  min: number
  max: number
  mediana: number
  /** 0 quando a origem é a tabela estática. */
  qtdCasas: number
  origem: OrigemOdds
}

/**
 * Agrega cotações de over em faixa, pelo ruleset homologado:
 * mediana (resiste a outlier de uma casa), mínimo de casas e fallback para a
 * tabela estática. Pura — o backtest (spec 07) reproduz sem banco.
 */
export function agregar(
  cotacoes: { casa: string; oddOver: number | null }[],
  nivel: Nivel,
  linha: number,
  ruleset: Ruleset,
): FaixaOdds | null {
  const valores = cotacoes
    .map((c) => c.oddOver)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  // casas_minimas é positivo por schema: dentro deste ramo, valores nunca é vazio.
  if (valores.length >= ruleset.odds.casas_minimas) {
    const meio = Math.floor(valores.length / 2)
    const central = valores[meio]!
    const mediana = valores.length % 2 === 1 ? central : (valores[meio - 1]! + central) / 2
    return {
      min: valores[0]!,
      max: valores[valores.length - 1]!,
      mediana,
      qtdCasas: valores.length,
      origem: 'CASAS',
    }
  }

  const faixa = ruleset.odds.tabela_estatica[nivel]?.[String(linha)]
  if (!faixa) return null

  const [min, max] = faixa
  return { min, max, mediana: (min + max) / 2, qtdCasas: 0, origem: 'TABELA_ESTATICA' }
}
