/**
 * RÓTULO DA TEMPORADA — fonte única.
 *
 * Duas colunas guardam esse rótulo (`classificacao.temporada` e
 * `medias_jogador.temporada`) e três lugares o consultam: a ingestão ao gravar,
 * a aba de estatísticas ao ler, e o backtest ao recortar período. Se cada um
 * montasse o seu, um `getUTCFullYear()` na tela e um "2025-26" na ingestão
 * fariam o JOIN devolver zero linhas — sem erro, só tela vazia.
 *
 * Função pura: a data entra como argumento, nunca `Date.now()`.
 */

export type FormatoTemporada = 'dois_anos' | 'ano_inicial'

export type ConfigTemporada = {
  /** Mês em que a temporada começa. 10 = outubro. */
  mesInicio: number
  formato: FormatoTemporada
}

/**
 * A temporada a que uma data pertence.
 *
 * Antes do mês de início, a data ainda pertence à temporada que começou no ano
 * anterior: 15 de março de 2026 é da temporada 2025-26, não da 2026-27.
 */
export function temporadaDe(data: Date, config: ConfigTemporada): string {
  const ano = data.getUTCFullYear()
  const mes = data.getUTCMonth() + 1

  const anoInicial = mes >= config.mesInicio ? ano : ano - 1

  if (config.formato === 'ano_inicial') return String(anoInicial)

  // "2025-26" — dois dígitos finais do ano seguinte, com zero à esquerda na
  // virada de século (2099-00).
  const seguinte = String((anoInicial + 1) % 100).padStart(2, '0')
  return `${anoInicial}-${seguinte}`
}
