import { dataDeReferencia } from './rodada'

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
  /**
   * Fuso que define o calendário. Não é detalhe de exibição: a virada de
   * temporada é uma data, e 30 de setembro às 22h em Brasília já é 1º de
   * outubro em UTC — dois rótulos de temporada diferentes para o mesmo jogo.
   */
  fuso: string
}

/**
 * A temporada a que uma data pertence.
 *
 * Antes do mês de início, a data ainda pertence à temporada que começou no ano
 * anterior: 15 de março de 2026 é da temporada 2025-26, não da 2026-27.
 */
export function temporadaDe(data: Date, config: ConfigTemporada): string {
  const [anoTexto, mesTexto] = dataDeReferencia(data, config.fuso).split('-')
  const ano = Number(anoTexto)
  const mes = Number(mesTexto)

  const anoInicial = mes >= config.mesInicio ? ano : ano - 1

  if (config.formato === 'ano_inicial') return String(anoInicial)

  // "2025-26" — dois dígitos finais do ano seguinte, com zero à esquerda na
  // virada de século (2099-00).
  const seguinte = String((anoInicial + 1) % 100).padStart(2, '0')
  return `${anoInicial}-${seguinte}`
}

/**
 * O calendário, montado do ruleset. Fonte única.
 *
 * Dez lugares repetiam este objeto à mão. Quando o fuso entrou na conta, cada
 * um deles seria uma chance de esquecer o campo novo e voltar silenciosamente
 * para UTC — que é exatamente o defeito que o fuso veio corrigir.
 */
export function calendarioDoRuleset(ruleset: {
  temporada: { mes_inicio: number; formato: FormatoTemporada }
  rodada: { fuso: string }
}): ConfigTemporada {
  return {
    mesInicio: ruleset.temporada.mes_inicio,
    formato: ruleset.temporada.formato,
    fuso: ruleset.rodada.fuso,
  }
}
