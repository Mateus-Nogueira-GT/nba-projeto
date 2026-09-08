import type { BlocoAtributo, Ruleset } from './ruleset/schema'
import type { Atributo, Nivel } from './tipos'

/**
 * CONSULTA POR ATRIBUTO — a fronteira entre pontos e o resto.
 *
 * PONTOS lê os blocos homologados do topo do ruleset (`oscilacao`, `confianca`,
 * `odds`, `push`), que não mudaram uma vírgula. Os demais atributos leem
 * `por_atributo`, porque as escalas são incomparáveis: 25 é uma linha de pontos
 * plausível e uma linha de assistências impossível. Antes disto, um jogador
 * classificado em rebotes teria recebido linhas de 20 a 35 REBOTES — o motor
 * era genérico por atributo em tudo, menos nas tabelas.
 *
 * Atributo sem tabela devolve vazio em toda parte: sem linha, sem confiança,
 * sem odd, sem green. É o comportamento de hoje, preservado por construção.
 */

const VAZIO: number[] = []

export function parametrosOpd(atributo: Atributo, ruleset: Ruleset) {
  return atributo === 'PONTOS' ? ruleset.opd : (bloco(atributo, ruleset)?.opd ?? ruleset.opd)
}

export function nivelMinimoOscilacao(nivel: Nivel, atributo: Atributo, ruleset: Ruleset) {
  return (
    (atributo === 'PONTOS'
      ? undefined
      : bloco(atributo, ruleset)?.oscilacao?.nivel_minimo_apito?.[nivel]) ??
    ruleset.oscilacao.nivel_minimo_apito[nivel]
  )
}

function bloco(atributo: Atributo, ruleset: Ruleset): BlocoAtributo | undefined {
  return ruleset.por_atributo[atributo]
}

/**
 * De onde vieram os números deste atributo. `null` = atributo sem tabela.
 * A UI usa isto para avisar que a tela está mostrando modelo de demonstração.
 */
export function origemDoAtributo(
  atributo: Atributo,
  ruleset: Ruleset,
): 'homologado' | 'demonstracao' | null {
  if (atributo === 'PONTOS') return 'homologado'
  return bloco(atributo, ruleset)?.origem ?? null
}

/** Delta de oscilação. A exceção nominal do documento só vale para pontos. */
export function deltaOscilacao(
  nivel: Nivel,
  atributo: Atributo,
  identidades: string | readonly string[],
  ruleset: Ruleset,
): number | undefined {
  if (atributo === 'PONTOS') {
    const chaves = typeof identidades === 'string' ? [identidades] : identidades
    const excecoes = ruleset.oscilacao.excecoes_por_jogador
    const deltas = new Set(
      chaves.filter((chave) => Object.hasOwn(excecoes, chave)).map((chave) => excecoes[chave]!),
    )
    if (deltas.size > 1) throw new Error('Exceções de oscilação conflitantes para o mesmo jogador.')
    return deltas.values().next().value ?? ruleset.oscilacao.delta[nivel]
  }
  return bloco(atributo, ruleset)?.oscilacao?.delta[nivel]
}

/** Linhas disponíveis para (nível, atributo), em ordem crescente. */
export function linhasDoNivel(nivel: Nivel, atributo: Atributo, ruleset: Ruleset): number[] {
  const base =
    atributo === 'PONTOS'
      ? ruleset.confianca.base[nivel]
      : bloco(atributo, ruleset)?.confianca?.base[nivel]

  if (base === undefined) return VAZIO

  return Object.keys(base)
    .map(Number)
    .sort((a, b) => a - b)
}

export function confiancaBase(
  nivel: Nivel,
  atributo: Atributo,
  linha: number,
  ruleset: Ruleset,
): number | undefined {
  const tabela =
    atributo === 'PONTOS'
      ? ruleset.confianca.base[nivel]
      : bloco(atributo, ruleset)?.confianca?.base[nivel]
  return tabela?.[String(linha)]
}

export function bonusConfianca(
  nivel: Nivel,
  atributo: Atributo,
  nivelApito: number,
  ruleset: Ruleset,
): number {
  const tabela =
    atributo === 'PONTOS'
      ? ruleset.confianca.bonus_por_nivel_apito[nivel]
      : bloco(atributo, ruleset)?.confianca?.bonus_por_nivel_apito[nivel]
  return tabela?.[String(nivelApito)] ?? 0
}

/** Faixa da tabela estática — o fallback de quando as casas não cobrem. */
export function faixaEstatica(
  nivel: Nivel,
  atributo: Atributo,
  linha: number,
  ruleset: Ruleset,
): [number, number] | undefined {
  const tabela =
    atributo === 'PONTOS'
      ? ruleset.odds.tabela_estatica[nivel]
      : bloco(atributo, ruleset)?.odds?.[nivel]
  return tabela?.[String(linha)]
}

/** Marcos de green. Vazio para atributo sem tabela — nenhum push sai. */
export function marcosDoNivel(nivel: Nivel, atributo: Atributo, ruleset: Ruleset): number[] {
  const marcos =
    atributo === 'PONTOS'
      ? ruleset.push.marcos_green[nivel]
      : bloco(atributo, ruleset)?.marcos_green?.[nivel]
  return marcos ?? VAZIO
}
