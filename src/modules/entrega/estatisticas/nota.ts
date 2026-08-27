/**
 * NOTA DA PARTIDA — desempenho de um jogador em UM jogo, de 3 a 10.
 *
 * Dado CANÔNICO da aba de consulta: nasce do box score que a liga registrou e
 * não participa de estratégia nenhuma. O motor não a conhece, e ela nunca
 * decide apito — por isso as constantes moram aqui e não no ruleset (o
 * ruleset é a estratégia do CJ, regra 1 do projeto).
 *
 * NOME: "nota da partida". Nunca "nível" — `nível do jogador` e `nível do
 * apito` são outra coisa no vocabulário do CJ, e confundir os três numa tela
 * que mostra os dois seria o pior lugar possível para essa ambiguidade.
 */

export type LinhaDeBox = {
  /** Null quando o provedor não registrou — sem minutos não há nota. */
  minutos: number | null
  pontos: number
  cestasC: number
  cestasT: number
  lanceC: number
  lanceT: number
  rebotesOf: number
  rebotesDef: number
  roubos: number
  assistencias: number
  bloqueios: number
  faltas: number
  turnovers: number
}

/** Abaixo disto o desempenho não é comparável — ver `notaDaPartida`. */
export const MINUTOS_MINIMOS = 5

/**
 * Escala: game score 10 (titular mediano) vira 6,5; 30 (jogão) vira 9,5.
 * Números escolhidos para a nota cair na faixa que o público já reconhece de
 * outros apps de placar, não porque tenham significado estatístico próprio.
 */
const BASE = 6.5
const REFERENCIA = 10
const ESCALA = 0.15
const PISO = 3
const TETO = 10

/**
 * Game Score de John Hollinger — fórmula PÚBLICA, não invenção nossa nem
 * regra do CJ. Condensa a linha inteira num número só, penalizando arremesso
 * errado e turnover.
 */
export function gameScore(linha: LinhaDeBox): number {
  return (
    linha.pontos +
    0.4 * linha.cestasC -
    0.7 * linha.cestasT -
    0.4 * (linha.lanceT - linha.lanceC) +
    0.7 * linha.rebotesOf +
    0.3 * linha.rebotesDef +
    linha.roubos +
    0.7 * linha.assistencias +
    0.7 * linha.bloqueios -
    0.4 * linha.faltas -
    linha.turnovers
  )
}

/**
 * `null` quando não há nota a dar: sem minutos registrados, ou com menos de
 * `MINUTOS_MINIMOS` em quadra. A tela imprime "—" — dar 3,0 a quem entrou nos
 * 40 segundos finais seria afirmar um desempenho ruim que ninguém observou.
 */
export function notaDaPartida(linha: LinhaDeBox): number | null {
  if (linha.minutos === null || linha.minutos < MINUTOS_MINIMOS) return null

  const bruta = BASE + (gameScore(linha) - REFERENCIA) * ESCALA
  const presa = Math.min(TETO, Math.max(PISO, bruta))
  return Math.round(presa * 10) / 10
}
