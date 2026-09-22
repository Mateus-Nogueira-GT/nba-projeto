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

  // Quatro dígitos SEMPRE: é este ano que vira a abertura da temporada, e um
  // "0-01" chegava a `Date.parse` como NaN (diagnóstico de 13/09).
  const anoInicialTexto = String(anoInicial).padStart(4, '0')
  if (config.formato === 'ano_inicial') return anoInicialTexto

  // "2025-26" — dois dígitos finais do ano seguinte, com zero à esquerda na
  // virada de século (2099-00).
  const seguinte = String((anoInicial + 1) % 100).padStart(2, '0')
  return `${anoInicialTexto}-${seguinte}`
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

/** Uma temporada e quanto dado encerrado ela tem. */
export type TemporadaComDados = {
  temporada: string
  jogosEncerrados: number
}

/**
 * A temporada que as telas de CONSULTA devem mostrar.
 *
 * `temporadaDe` responde "a que temporada esta DATA pertence" e continua certa.
 * Esta responde outra pergunta: "que temporada esta TELA deve mostrar?". Entre
 * o lançamento (~02/10) e a primeira bola (~03/11) as duas divergem — o
 * calendário já diz 2026-27 enquanto o banco só tem 2025-26 — e sem esta função
 * o assinante vê tela vazia sem erro nenhum.
 *
 * Regra: se a temporada do calendário já alcançou o piso, é ela. Senão, a mais
 * recente que o tenha alcançado. Se nenhuma alcançou, devolve a do calendário —
 * tela vazia honesta em vez de tela errada.
 *
 * A consulta anda para TRÁS do calendário, nunca para a frente: uma temporada
 * futura com jogo gravado por acidente (pré-temporada com rótulo adiantado) não
 * pode puxar a tela para uma temporada que ainda não começou.
 *
 * Função pura: o piso vem do ruleset e os fatos entram como argumento.
 */
export function temporadaExibida(
  doCalendario: string,
  comDados: TemporadaComDados[],
  minimoJogos: number,
): string {
  const alcancaram = comDados.filter((t) => t.jogosEncerrados >= minimoJogos)

  if (alcancaram.some((t) => t.temporada === doCalendario)) return doCalendario

  // O rótulo começa pelo ano inicial com quatro dígitos ("2025-26", "2025"),
  // então a ordem alfabética é a ordem cronológica.
  const anteriores = alcancaram
    .filter((t) => t.temporada < doCalendario)
    .sort((a, b) => b.temporada.localeCompare(a.temporada))

  return anteriores[0]?.temporada ?? doCalendario
}
