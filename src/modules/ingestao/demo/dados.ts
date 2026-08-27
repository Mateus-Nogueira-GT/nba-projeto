import { ATRIBUTOS, NIVEIS } from '../../motor/tipos'
import type { Atributo, Nivel } from '../../motor/tipos'

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

/**
 * NOME DE EXIBIÇÃO — só a caixa alta inicial, nunca a grafia.
 *
 * O documento do CJ traz "stephen Curry" e "podzienki" em minúscula. Exibir
 * isso num produto lê-se como banco de dados quebrado, mas CORRIGIR a grafia
 * seria inventar identidade que o cliente não definiu: "Porzigins" e
 * "Kesller" continuam como ele escreveu — são pergunta para o CJ, não palpite
 * nosso (regra 3 do projeto).
 *
 * Só sobe a primeira letra de palavras INTEIRAMENTE minúsculas. Palavra com
 * maiúscula no meio já foi escrita com intenção e passa intacta — é o que
 * salva "LeBron" de virar "Lebron".
 */
export function nomeDeExibicao(nome: string): string {
  return nome
    .split(' ')
    .map((palavra) =>
      palavra.length > 0 && palavra === palavra.toLowerCase()
        ? palavra[0]!.toUpperCase() + palavra.slice(1)
        : palavra,
    )
    .join(' ')
}

/**
 * POSIÇÃO REAL dos jogadores nomeados pelo CJ.
 *
 * Fato canônico da NBA, não estratégia — a mesma fronteira que faz a aba de
 * estatísticas usar `jogadores.time_id` em vez da lista curada. O hash abaixo
 * é determinístico mas cego: escalava o Curry de pivô e o Giannis de armador,
 * e um cliente que conhece basquete lê isso como banco de dados errado.
 *
 * A grafia da chave é a do documento do CJ, minúscula — é por ela que o
 * jogador chega aqui. Quem não estiver na tabela cai no hash, que continua
 * servindo para os nomes que ninguém reconhece.
 */
const POSICAO_REAL: Record<string, Posicao> = {
  'stephen curry': 'G',
  shai: 'G',
  'jamal murray': 'G',
  brunson: 'G',
  'austin reaves': 'G',
  grimes: 'G',
  'luka doncic': 'G',
  giannis: 'F',
  jokic: 'C',
  tatum: 'F',
  'lebron james': 'F',
  butler: 'F',
  green: 'F',
  gordon: 'F',
  towns: 'C',
  porzigins: 'F',
  nurkic: 'C',
}

export function posicaoDe(nome: string): Posicao {
  return POSICAO_REAL[nome.toLowerCase()] ?? POSICOES[semente(nome) % POSICOES.length]!
}

/**
 * A RODADA DO DIA — rodízio round-robin (método do círculo).
 *
 * O histórico da demo repetia os MESMOS quatro confrontos todo dia: o GSW
 * enfrentava o BOS sete vezes seguidas, duas delas com placar idêntico. Uma
 * temporada assim não existe, e é a primeira coisa que um cliente nota ao
 * abrir a tela do time.
 *
 * Fixa o primeiro time e gira os demais: cada rodada emparelha os oito times
 * com adversários diferentes, sem repetir confronto dentro de sete rodadas.
 * Determinístico — mesma rodada, mesmos pares, sempre.
 */
export function rodadaDoDia(times: readonly string[], rodada: number): [string, string][] {
  if (times.length < 2 || times.length % 2 !== 0) {
    throw new Error(`rodadaDoDia exige um número PAR de times (recebeu ${times.length})`)
  }
  const [fixo, ...giro] = times
  const n = giro.length
  const na = (i: number) => giro[(((i + rodada) % n) + n) % n]!

  const pares: [string, string][] = [[fixo!, na(0)]]
  for (let k = 1; k < times.length / 2; k++) pares.push([na(k), na(n - k)])
  return pares
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

/**
 * Distribui um valor da semente dentro de [min, max], com uma casa decimal.
 *
 * Exportada: além das médias abaixo, `semear.ts` reusa para os minutos
 * parciais do jogo AO VIVO — mesmo motivo de determinismo, contexto
 * diferente (ver `semearDemo`, bloco "1º quarto ao vivo").
 */
export function naFaixa(nome: string, sufixo: string, [min, max]: [number, number]): number {
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

export type OpcoesHistorico = {
  /**
   * Em que jogo a sequência abaixo COMEÇA, contando do mais recente.
   *
   * `0` = ele ainda está oscilando hoje, e a lista de hoje o sinaliza.
   * `1` = a oscilação terminou ontem: ele apitou na rodada passada e voltou à
   * média no jogo seguinte. Sem esse segundo caso, a aba de Resultados só teria
   * quem ainda está abaixo — e abriria com uma sequência de vermelhos, porque
   * o jogo conferido seria justamente mais um jogo ruim.
   */
  deslocamento?: number
  /**
   * Semente para variar os jogos ACIMA do limiar. Sem ela todo jogador faz
   * exatamente `média + 2` em toda partida, e a aba de estatísticas fica com
   * cara de planilha preenchida por fórmula. A variação nunca cruza o limiar:
   * ninguém apita por acidente.
   */
  variacao?: string
}

/**
 * Pontuações de 6 jogos, do MAIS RECENTE para o mais antigo — a ordem que o
 * motor usa para contar a sequência de oscilação.
 *
 * Os `jogosAbaixo` a partir de `deslocamento` ficam em (limiar - 1); os demais
 * ficam acima. O limiar é `média - delta`: quem decide o delta é o ruleset, não
 * este arquivo — ele só recebe o número já calculado.
 */
export function historicoOscilacao(
  media: number,
  delta: number,
  jogosAbaixo: number,
  opcoes: OpcoesHistorico = {},
): number[] {
  const limiar = media - delta
  const inicio = opcoes.deslocamento ?? 0
  const piso = Math.ceil(limiar + 1)

  const acima = (i: number): number => {
    if (opcoes.variacao === undefined) return Math.round(media + 2)
    const amplitude = Math.max(1, Math.round(delta))
    const desvio = (semente(`${opcoes.variacao}|${i}`) % (amplitude * 2 + 1)) - amplitude
    return Math.max(piso, Math.round(media + desvio))
  }

  return Array.from({ length: 6 }, (_, i) =>
    i >= inicio && i < inicio + jogosAbaixo ? Math.max(0, Math.round(limiar - 1)) : acima(i),
  )
}

/**
 * NÍVEL POR ATRIBUTO — inventado, e por isso mora aqui e não no ruleset.
 *
 * O CJ classificou só PONTOS. Enquanto ele não manda as listas de rebotes e
 * assistências, a demo deriva as duas da lista de pontos com um deslocamento
 * pela posição: pivô sobe em rebotes e cai em assistências, armador o
 * contrário, ala fica onde está.
 *
 * Isto NÃO é estratégia — é matéria-prima falsa, do mesmo naipe das médias e
 * dos box scores deste arquivo. Quando as listas reais chegarem, elas entram
 * pelo importador como qualquer versão de níveis e esta função morre.
 */
export function nivelDoAtributo(nome: string, nivelPontos: Nivel, atributo: Atributo): Nivel {
  if (atributo === 'PONTOS') return nivelPontos

  const posicao = posicaoDe(nome)
  // NIVEIS vai do melhor para o pior, então "subir de nível" é andar para trás.
  const deslocamento =
    atributo === 'REBOTES'
      ? { C: -1, F: 0, G: 1 }[posicao]
      : { G: -1, F: 0, C: 1 }[posicao]

  const indice = NIVEIS.indexOf(nivelPontos) + deslocamento
  return NIVEIS[Math.min(Math.max(indice, 0), NIVEIS.length - 1)]!
}

/** Os três níveis de um jogador, prontos para virar linha em `niveis`. */
export function niveisDoJogador(nome: string, nivelPontos: Nivel): Record<Atributo, Nivel> {
  return Object.fromEntries(
    ATRIBUTOS.map((a) => [a, nivelDoAtributo(nome, nivelPontos, a)]),
  ) as Record<Atributo, Nivel>
}

/**
 * Decompõe os pontos de um jogo da demo em arremessos coerentes:
 * 2·doisC + 3·tresC + lanceC = pontos, sempre, com tentativas plausíveis.
 *
 * Determinística de propósito — o seed é reexecutável, e o teste de soma
 * varre a identidade para qualquer placar. Não é modelo estatístico: é o
 * mínimo para as telas de FG%/2P%/3P%/LL% mostrarem número em vez de "—".
 */
export function decomporPontos(pontos: number): {
  doisC: number
  doisT: number
  tresC: number
  tresT: number
  lanceC: number
  lanceT: number
  cestasC: number
  cestasT: number
} {
  const tresC = Math.floor(pontos / 9)
  const resto = pontos - tresC * 3
  // Paridade preservada: somar 2 mantém resto − lanceC par e não-negativo.
  const lanceC = (resto % 2) + (resto >= 6 ? 2 : 0)
  const doisC = (resto - lanceC) / 2

  const doisT = doisC + Math.ceil(doisC / 2) + (doisC > 0 ? 1 : 0)
  const tresT = tresC + Math.max(tresC > 0 ? 1 : 0, tresC)
  const lanceT = lanceC + (lanceC > 0 ? 1 : 0)

  return {
    doisC,
    doisT,
    tresC,
    tresT,
    lanceC,
    lanceT,
    cestasC: doisC + tresC,
    cestasT: doisT + tresT,
  }
}

/**
 * COMPLEMENTO DO BOX SCORE — colunas que a lista de níveis não classifica
 * (roubos, tocos, turnovers, faltas) e a divisão de `rebotesTotal` em
 * ofensivo/defensivo.
 *
 * Antes desta função, `estatisticas_jogo` só recebia pontos, rebotes,
 * assistências e minutos: as demais colunas ficavam no default 0 da tabela
 * para todo jogador, em todo jogo — e `nota.ts` lê `rebotesOf`/`rebotesDef`,
 * NUNCA `rebotesTotal` (é a fórmula pública do Game Score). Um jogador com
 * REB 12 na tabela visível valia zero rebote na nota da própria linha
 * (achado da revisão).
 *
 * Determinística pela CHAVE (nome + contexto do jogo), nunca por sorteio —
 * mesmo motivo de `naFaixa`, acima: o seed precisa dar o mesmo resultado toda
 * vez que roda com a mesma entrada.
 */
export function boxComplementar(
  chave: string,
  rebotesTotal: number,
): {
  rebotesOf: number
  rebotesDef: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
} {
  // ~30% dos rebotes de um time são ofensivos na NBA — proporção usual do
  // jogo, não regra do CJ (rebote não é estratégia, é fato de partida).
  // `rebotesDef` é o COMPLEMENTO, nunca uma segunda conta: a soma bate com
  // `rebotesTotal` por construção, não por coincidência.
  const rebotesOf = Math.round(rebotesTotal * 0.3)
  const entre = (sufixo: string, min: number, max: number) =>
    min + (semente(`${chave}|${sufixo}`) % (max - min + 1))
  return {
    rebotesOf,
    rebotesDef: rebotesTotal - rebotesOf,
    roubos: entre('roubos', 0, 3),
    bloqueios: entre('bloqueios', 0, 2),
    turnovers: entre('turnovers', 1, 4),
    faltas: entre('faltas', 1, 4),
  }
}
