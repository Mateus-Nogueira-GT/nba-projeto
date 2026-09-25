import { NIVEIS, type Atributo, type JogoHistorico, type Nivel } from '../../motor/tipos'

/**
 * REGRAS DA TEMPORADA ANTERIOR (spec 25/09) — puras, sem banco.
 *
 * Na temporada anterior o jogador conta pelo time em que JOGOU (decisão 2),
 * e a hierarquia do time é remontada com o nível que o CJ deu a cada um
 * (decisão 3). O motor não sabe de nada disso: recebe `Fatos` como sempre.
 */

/** Time do jogador na data: o do último jogo dele até ela, inclusive. */
export function timeNaData(
  jogos: readonly { data: string; timeId: string | null }[],
  ate: string,
): string | null {
  let melhor: { data: string; timeId: string } | null = null
  for (const j of jogos) {
    if (j.timeId === null || j.data > ate) continue
    if (melhor === null || j.data > melhor.data) melhor = { data: j.data, timeId: j.timeId }
  }
  return melhor?.timeId ?? null
}

export type EntradaHierarquia = { jogadorId: string; nivel: Nivel; posicaoCj: number }

/** Nível do jogador primeiro; no mesmo nível, a posição dele na lista do CJ. */
export function ordenarHierarquia(entradas: readonly EntradaHierarquia[]): Map<string, number> {
  const ordenadas = [...entradas].sort(
    (a, b) =>
      NIVEIS.indexOf(a.nivel) - NIVEIS.indexOf(b.nivel) ||
      a.posicaoCj - b.posicaoCj ||
      a.jogadorId.localeCompare(b.jogadorId),
  )
  return new Map(ordenadas.map((e, i) => [e.jogadorId, i + 1] as const))
}

const CAMPO: Record<Atributo, 'pontos' | 'rebotes' | 'assistencias'> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistencias',
}

/**
 * Média por atributo sobre o histórico JÁ recortado até a véspera: só jogo em
 * que o jogador entrou em quadra, os N mais recentes quando a janela tem
 * tamanho.
 *
 * NÃO é exatamente a regra de `recalcularMedias`: aqui `jogou` é
 * `entrouEmQuadra` (minutos > 0 OU algum evento na linha, saldo em quadra
 * inclusive), e lá conta só `minutos > 0`. A diferença só aparece numa linha com produção e minuto
 * ausente/zero (dado parcial do provedor) — registrada para quem for unificar.
 */
export function mediasAte(
  historico: readonly JogoHistorico[],
  tamanhoJanela: number | null,
): Partial<Record<Atributo, number>> {
  const jogados = historico
    .filter((h) => h.jogou)
    .sort((a, b) => b.data.localeCompare(a.data))
  const recorte = tamanhoJanela === null ? jogados : jogados.slice(0, tamanhoJanela)
  if (recorte.length === 0) return {}
  const medias: Partial<Record<Atributo, number>> = {}
  for (const atributo of Object.keys(CAMPO) as Atributo[]) {
    const soma = recorte.reduce((s, h) => s + h[CAMPO[atributo]], 0)
    medias[atributo] = Number((soma / recorte.length).toFixed(2))
  }
  return medias
}
