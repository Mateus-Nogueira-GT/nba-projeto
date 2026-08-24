import type { Nivel } from '../../motor/tipos'

/**
 * DADOS DE DEMONSTRAÇÃO — determinísticos por construção.
 *
 * Nada aqui é estratégia: são FATOS inventados (médias, posições, box scores)
 * para que o motor real tenha o que avaliar enquanto os provedores da NBA não
 * estão contratados. As regras continuam vindo do ruleset; este módulo só
 * produz a matéria-prima.
 *
 * `Math.random()` está fora de questão: o seed precisa ser reexecutável e dar
 * exatamente o mesmo resultado, senão a demo muda sozinha entre execuções.
 */

/** Hash estável e pequeno de um nome. Mesmo nome, mesmo número, sempre. */
function semente(nome: string): number {
  let h = 2166136261
  for (const ch of nome.toLowerCase()) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const POSICOES = ['G', 'F', 'C'] as const
export type Posicao = (typeof POSICOES)[number]

export function posicaoDe(nome: string): Posicao {
  return POSICOES[semente(nome) % POSICOES.length]!
}

export type MediaDemo = { ppg: number; rpg: number; apg: number }

/**
 * Médias citadas NOMINALMENTE no documento do CJ. Onde ele deu o número, o
 * número é dele — assim os exemplos da aba teórica batem com os cards.
 */
const DO_DOCUMENTO: Record<string, Partial<MediaDemo>> = {
  shai: { ppg: 31 }, // "média de 31 ppg"
  jokic: { rpg: 12.9 }, // "média de 12.9 RPG"
  towns: { ppg: 20 }, // "média de 20 ppg"
  'jamal murray': { apg: 7 }, // "média de 7 apg"
  gordon: { ppg: 16 }, // "média de 16 ppg"
  fontenchhio: { ppg: 8.5 }, // "media de 8,5 pontos"
  'lebron james': { ppg: 25.7 }, // "média do lebron sendo 25,7 ppg"
}

const FAIXA_PPG: Record<Nivel, [number, number]> = {
  MVP: [27, 31],
  ALL_STAR: [18, 23],
  SUPORTE: [11, 16],
  RANDOLA: [5, 9],
}

/** Distribui um valor da semente dentro de [min, max], com uma casa decimal. */
function naFaixa(nome: string, sufixo: string, [min, max]: [number, number]): number {
  const passos = Math.round((max - min) * 10) + 1
  const v = min + ((semente(nome + sufixo) % passos) / 10)
  return Math.round(v * 10) / 10
}

export function mediaDe(nome: string, nivel: Nivel): MediaDemo {
  const chave = nome.toLowerCase().trim()
  const nominal = DO_DOCUMENTO[chave] ?? {}

  const rpgFaixa: [number, number] = nivel === 'MVP' ? [7, 12] : nivel === 'ALL_STAR' ? [5, 9] : [2, 6]
  const apgFaixa: [number, number] = nivel === 'MVP' ? [5, 9] : nivel === 'ALL_STAR' ? [3, 7] : [1, 4]

  return {
    ppg: nominal.ppg ?? naFaixa(nome, 'p', FAIXA_PPG[nivel]),
    rpg: nominal.rpg ?? naFaixa(nome, 'r', rpgFaixa),
    apg: nominal.apg ?? naFaixa(nome, 'a', apgFaixa),
  }
}

/**
 * Pontuações de 6 jogos, do MAIS RECENTE para o mais antigo — a ordem que o
 * motor usa para contar a sequência de oscilação.
 *
 * `jogosAbaixo` primeiros ficam em (limiar - 1); os seguintes voltam para a
 * média. O limiar é `média - delta`: quem decide o delta é o ruleset, não este
 * arquivo — ele só recebe o número já calculado.
 */
export function historicoOscilacao(media: number, delta: number, jogosAbaixo: number): number[] {
  const limiar = media - delta
  return Array.from({ length: 6 }, (_, i) =>
    i < jogosAbaixo ? Math.max(0, Math.round(limiar - 1)) : Math.round(media + 2),
  )
}
