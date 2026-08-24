import type { Ruleset } from '../ruleset/schema'
import type { NivelApito } from '../tipos'

/**
 * GESTÃO DE BANCA — quanto entrar em cada apito.
 *
 * Função pura, como todo o resto do motor: recebe a banca e o apito, devolve
 * o tamanho da entrada. Nenhum número vive aqui — todos saem de
 * `ruleset.gestao_banca`, hoje preenchido com um modelo de DEMONSTRAÇÃO
 * enquanto o modelo do CJ não chega.
 *
 * `null` quando o ruleset não traz o bloco: sem modelo, a tela avisa que não
 * há modelo. O que não pode acontecer é a ausência virar um número plausível.
 */

export type Entrada = {
  unidades: number
  valor: number
  /** true quando o teto por entrada cortou o valor sugerido. */
  limitadoPeloTeto: boolean
}

export function valorDaUnidade(banca: number, ruleset: Ruleset): number | null {
  const modelo = ruleset.gestao_banca
  if (modelo === undefined) return null
  return (banca * modelo.unidade_percentual_banca) / 100
}

export function sugerirEntrada(
  banca: number,
  nivelApito: NivelApito,
  turbo: boolean,
  ruleset: Ruleset,
): Entrada | null {
  const modelo = ruleset.gestao_banca
  const unidade = valorDaUnidade(banca, ruleset)
  if (modelo === undefined || unidade === null) return null

  const base = modelo.unidades_por_nivel_apito[String(nivelApito)]
  if (base === undefined) return null

  // O turbo SOMA. Multiplicar faria o nível 3 com turbo estourar o teto, e um
  // teto que o modelo estoura sozinho não é teto.
  const unidades = base + (turbo ? modelo.bonus_turbo_unidades : 0)
  const bruto = unidades * unidade
  const teto = (banca * modelo.teto_por_entrada_percentual) / 100

  return {
    unidades,
    valor: Math.min(bruto, teto),
    limitadoPeloTeto: bruto > teto,
  }
}

export type LimitesDoDia = {
  stopWin: number
  stopLoss: number
  tetoPorEntrada: number
}

export function limitesDoDia(banca: number, ruleset: Ruleset): LimitesDoDia | null {
  const modelo = ruleset.gestao_banca
  if (modelo === undefined) return null

  return {
    stopWin: (banca * modelo.stop_win_percentual) / 100,
    stopLoss: (banca * modelo.stop_loss_percentual) / 100,
    tetoPorEntrada: (banca * modelo.teto_por_entrada_percentual) / 100,
  }
}
