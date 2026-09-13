/**
 * GERADOR PURO DA TEMPORADA SIMULADA.
 *
 * Nada aqui toca banco, rede ou relógio: dias, elencos e semente entram como
 * argumento e o resultado é função só deles. É a mesma disciplina do motor,
 * pelo mesmo motivo — dá para testar a distribuição sem subir Postgres.
 *
 * Tudo é determinístico pela SEMENTE combinada com o DIA e com o nome: o dia
 * 23 tem os mesmos jogos e os mesmos números seja produzido hoje, daqui a uma
 * semana, dentro de uma janela de 49 dias ou pedido sozinho. É isso que deixa
 * o cron preencher lacunas sem reescrever nada — e a janela da spec §1
 * ("hoje − 49 dias") desliza um dia a cada execução, então o calendário não
 * pode depender de onde a janela começa.
 */
import type { Atributo, Nivel } from '../../motor/tipos'
import type { JogadorNaLista } from '../niveis/parser'
import { mediaDe, niveisDoJogador, semente } from './dados'

export const SEMENTE_TEMPORADA = 'ia-nba-demo-2025-26'

/** mulberry32 sobre o hash FNV de `dados.ts`. Determinístico por chave. */
export function criarSorteio(chave: string): () => number {
  let a = semente(chave) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function embaralhar<T>(lista: readonly T[], sorteio: () => number): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  }
  return copia
}

// ---------------------------------------------------------------------------
// CALENDÁRIO
// ---------------------------------------------------------------------------

export type JogoSim = { casa: string; visitante: string; horaLocal: string }
export type Calendario = Map<string, JogoSim[]>

const HORARIOS = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'] as const

/** Comprimento do ciclo de rodízio, em dias. */
const CICLO = 7

/**
 * Dia absoluto (dias desde 1970-01-01) a partir de `YYYY-MM-DD`, por
 * aritmética pura — `Date` fica de fora de propósito, para que a pureza deste
 * módulo seja visível sem precisar argumentar que `Date.UTC` não lê o relógio.
 * É o algoritmo `days_from_civil` de sempre.
 */
export function diaAbsoluto(dia: string): number {
  const [ano, mes, doMes] = dia.split('-').map(Number) as [number, number, number]
  const a = mes <= 2 ? ano - 1 : ano
  const era = Math.floor(a / 400)
  const anoDaEra = a - era * 400
  const doAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + doMes - 1
  const doEra = anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + doAno
  return era * 146097 + doEra - 719468
}

/**
 * CLASSE DE RODÍZIO de cada time — a chave da determinação por (semente, dia).
 *
 * Cada time recebe uma classe `r` em `[0, CICLO)` e joga nos dias do ciclo
 * `r`, `r+2` e `r+4`. Como as distâncias dentro desse conjunto são 2, 2 e 3
 * (nunca 1, nem no fecho do ciclo), NENHUM time joga em dias seguidos — e a
 * propriedade vale para qualquer dia do calendário, sem que a função precise
 * lembrar o que aconteceu ontem. É o que faz o dia 23 ser o dia 23 venha ele
 * de que janela vier.
 *
 * Os tamanhos das classes são PARES: um dia reúne três classes, três pares
 * somam par, e todo mundo que entra encontra adversário. Se sobrasse alguém,
 * ele perderia um dos três jogos da semana.
 */
function classesDeRodizio(siglas: readonly string[], sementeBase: string): Map<string, number> {
  const ordem = embaralhar(siglas, criarSorteio(`${sementeBase}|classes`))
  const tamanhos = new Array<number>(CICLO).fill(2 * Math.floor(ordem.length / (2 * CICLO)))
  let resto = ordem.length - tamanhos.reduce((a, v) => a + v, 0)
  for (let i = 0; resto > 0; i = (i + 1) % CICLO) {
    const passo = Math.min(2, resto)
    tamanhos[i] = tamanhos[i]! + passo
    resto -= passo
  }

  const classe = new Map<string, number>()
  let k = 0
  for (let c = 0; c < CICLO; c++) {
    for (let i = 0; i < tamanhos[c]!; i++) classe.set(ordem[k++]!, c)
  }
  return classe
}

/** O dia `c` do ciclo recebe as classes `c`, `c−2` e `c−4`. */
function jogamNoDia(dia: string, classe: ReadonlyMap<string, number>, siglas: readonly string[]): string[] {
  const c = ((diaAbsoluto(dia) % CICLO) + CICLO) % CICLO
  const doDia = new Set([c, (c + CICLO - 2) % CICLO, (c + CICLO - 4) % CICLO])
  return siglas.filter((s) => doDia.has(classe.get(s)!))
}

/**
 * Regras do calendário (spec §1): ninguém joga em dias seguidos; nenhum dia
 * fica vazio; cada time faz três jogos por semana — o teto que o descanso
 * obrigatório impõe dentro de um ciclo de sete dias. Com 30 times isso dá 6 ou
 * 7 jogos por rodada.
 *
 * A ordem em que as siglas chegam não conta: elas são deduplicadas e
 * ordenadas antes de qualquer sorteio. O chamador monta a lista de um `SELECT`
 * ou de um `Map`, e a lista de níveis do CJ é documento vivo — sem isso haveria
 * um segundo botão, invisível, ao lado da semente.
 */
export function gerarCalendario(opcoes: {
  siglas: readonly string[]
  dias: readonly string[]
  semente: string
}): Calendario {
  const siglas = [...new Set(opcoes.siglas)].sort()
  const classe = classesDeRodizio(siglas, opcoes.semente)
  const calendario: Calendario = new Map()

  for (const dia of opcoes.dias) {
    const sorteio = criarSorteio(`${opcoes.semente}|calendario|${dia}`)
    const escalados = embaralhar(jogamNoDia(dia, classe, siglas), sorteio)

    const jogos: JogoSim[] = []
    for (let i = 0; i + 1 < escalados.length; i += 2) {
      const a = escalados[i]!
      const b = escalados[i + 1]!
      const aEmCasa = sorteio() < 0.5
      jogos.push({
        casa: aEmCasa ? a : b,
        visitante: aEmCasa ? b : a,
        horaLocal: HORARIOS[Math.floor(sorteio() * HORARIOS.length)]!,
      })
    }
    calendario.set(dia, jogos)
  }

  return calendario
}

// ---------------------------------------------------------------------------
// ELENCOS
// ---------------------------------------------------------------------------

export type JogadorSim = {
  nome: string
  nivel: Nivel
  posicaoHierarquia: number
  niveis: Record<Atributo, Nivel>
  medias: { ppg: number; rpg: number; apg: number }
}

/** Por sigla, na ordem da hierarquia do CJ. Quem não tem sigla fica de fora. */
export function elencosDaLista(jogadores: readonly JogadorNaLista[]): Map<string, JogadorSim[]> {
  const elencos = new Map<string, JogadorSim[]>()
  for (const j of jogadores) {
    if (j.timeSigla === null) continue
    const lista = elencos.get(j.timeSigla) ?? []
    lista.push({
      nome: j.nomeNaLista,
      nivel: j.nivel,
      posicaoHierarquia: j.posicaoHierarquia,
      niveis: niveisDoJogador(j.nomeNaLista, j.nivel),
      medias: mediaDe(j.nomeNaLista, j.nivel),
    })
    elencos.set(j.timeSigla, lista)
  }
  for (const lista of elencos.values()) lista.sort((a, b) => a.posicaoHierarquia - b.posicaoHierarquia)
  return elencos
}

// ---------------------------------------------------------------------------
// DESFALQUES
// ---------------------------------------------------------------------------

/** Abaixo disso o time não teria nem os cinco em quadra mais um banco. */
export const MINIMO_EM_QUADRA = 6
const CHANCE_FORA_TOPO = 0.06
const CHANCE_FORA_RESTO = 0.03

/**
 * Quem está fora em cada time que joga no dia. O topo da hierarquia cai com
 * mais frequência de propósito: é o desfalque em PREFIXO que abre a OPD, e
 * sem ele a regra nunca apareceria na demonstração.
 */
export function desfalquesDoDia(opcoes: {
  dia: string
  jogos: readonly JogoSim[]
  elencos: Map<string, JogadorSim[]>
  semente: string
}): Map<string, string[]> {
  const fora = new Map<string, string[]>()
  for (const jogo of opcoes.jogos) {
    for (const sigla of [jogo.casa, jogo.visitante]) {
      const elenco = opcoes.elencos.get(sigla) ?? []
      const sorteio = criarSorteio(`${opcoes.semente}|desfalques|${opcoes.dia}|${sigla}`)
      const nomes: string[] = []
      for (const j of elenco) {
        if (elenco.length - nomes.length <= MINIMO_EM_QUADRA) break
        const chance = j.posicaoHierarquia <= 3 ? CHANCE_FORA_TOPO : CHANCE_FORA_RESTO
        if (sorteio() < chance) nomes.push(j.nome)
      }
      fora.set(sigla, nomes)
    }
  }
  return fora
}

// ---------------------------------------------------------------------------
// BOX SCORE
// ---------------------------------------------------------------------------

export type LinhaBox = { nome: string; minutos: number; pontos: number; rebotes: number; assistencias: number }

/** Faixa de minutos por nível do jogador (spec §2). */
export const MINUTOS_ALVO: Record<Nivel, [number, number]> = {
  MVP: [34, 37],
  ALL_STAR: [30, 34],
  SUPORTE: [22, 28],
  RANDOLA: [10, 18],
}

/**
 * Espalhamento do jogo a jogo em torno da média-alvo, por nível do ATRIBUTO.
 * É desvio de simulação, não regra do CJ: nada aqui é lido pelo motor. Os
 * números foram escolhidos para que 10–45% dos jogos de um MVP fiquem abaixo
 * de média − delta (o teste de distribuição trava isso contra o ruleset).
 */
const SIGMA: Record<Atributo, Record<Nivel, number>> = {
  PONTOS: { MVP: 6, ALL_STAR: 5, SUPORTE: 4, RANDOLA: 3 },
  REBOTES: { MVP: 3, ALL_STAR: 2.5, SUPORTE: 2, RANDOLA: 2 },
  ASSISTENCIAS: { MVP: 2.5, ALL_STAR: 2, SUPORTE: 1.5, RANDOLA: 1.5 },
}

/**
 * CAUDA DE BAIXO ALONGADA (spec §2: "os desvios não são simétricos de
 * propósito").
 *
 * O sino simétrico deixava 15–19% dos jogos de um MVP abaixo de média − delta
 * e, com 16 MVPs na lista fazendo ~21 jogos em 49 dias, a temporada inteira
 * dependia de UM jogador emendar três jogos ruins: em 2 de cada 30 janelas de
 * 49 dias ninguém emendava, e a demonstração passava sete semanas sem um único
 * turbo — que é justamente a peça que o documento do CJ mais destaca.
 *
 * Multiplicar só a metade negativa por 1,5 leva a fração para 20–23% (a spec
 * fala em ~25–30%) e a nenhuma janela sem turbo em 30 testadas. Mais que isso
 * espalha demais: a média amostral de 24 jogos começa a sair da faixa do nível,
 * e um "MVP" com 22 ppg na aba de estatísticas lê-se como erro de dado.
 */
const CAUDA_BAIXA = 1.5

/**
 * Recentra a cauda: sem isso a temporada inteira ficaria abaixo da média-alvo.
 * `0,40625` é E[|metade negativa|] do sino base — exato para a soma de três
 * uniformes, não estimado: 2·E|S₃ − 1,5| / 2 com S₃ ~ Irwin-Hall(3).
 */
const COMPENSACAO_CAUDA = 0.40625 * (CAUDA_BAIXA - 1)

/** Soma de três uniformes centrada em zero — sino simples, desvio ≈ 1 — com a cauda de baixo alongada. */
function ruido(sorteio: () => number): number {
  const base = (sorteio() + sorteio() + sorteio() - 1.5) * 2
  return (base < 0 ? base * CAUDA_BAIXA : base) + COMPENSACAO_CAUDA
}

/**
 * Acoplamento entre minutos e produção. `0` seria "os minutos não importam";
 * `1`, "produção proporcional ao tempo em quadra". Fica no meio porque a
 * média-alvo do jogador JÁ embute o tempo que ele costuma jogar: o que sobra
 * para o fator explicar é só o desvio daquele jogo em relação ao próprio
 * padrão dele.
 */
const ACOPLAMENTO_MINUTOS = 0.4

/**
 * MINUTOS — a faixa do nível manda, e a soma do time NÃO fecha 240.
 *
 * Um time da NBA soma 240 minutos (48 × 5) entre os QUINZE do elenco. A lista
 * do CJ nomeia de 6 a 9 por time, e é só sobre esses que a simulação produz
 * linha: os minutos que faltam para 240 são de quem a lista não cita. Forçar
 * os 6 a 9 nomes a fechar 240 é aritmeticamente impossível sem estourar a
 * faixa — 29 dos 30 elencos não chegam a 240 nem somando o TETO de todo mundo,
 * e o resultado seria o MVP mediano jogando os 48 minutos do jogo inteiro.
 *
 * O que vai para a tela (coluna MIN do box, "minutos recentes" no card do
 * apito, média de minutos na ficha do jogador) é o minuto do JOGADOR. É esse
 * que precisa ser plausível. É a mesma fronteira que faz `semearPlacares`
 * aceitar placar baixo: a lista é um recorte do elenco, e o agregado do
 * recorte é menor que o do time inteiro.
 */
function minutosDoTime(emQuadra: readonly JogadorSim[], sorteio: () => number): number[] {
  return emQuadra.map((j) => {
    const [min, max] = MINUTOS_ALVO[j.nivel]
    return Math.round(min + sorteio() * (max - min))
  })
}

/** Meio da faixa de minutos do nível — o "normal" contra o qual o jogo é medido. */
function minutosNormais(nivel: Nivel): number {
  const [min, max] = MINUTOS_ALVO[nivel]
  return (min + max) / 2
}

export function boxScoreDoTime(opcoes: {
  chave: string
  elenco: readonly JogadorSim[]
  fora: readonly string[]
}): LinhaBox[] {
  const emQuadra = opcoes.elenco.filter((j) => !opcoes.fora.includes(j.nome))
  if (emQuadra.length === 0) return []
  const minutos = minutosDoTime(emQuadra, criarSorteio(`${opcoes.chave}|minutos`))

  return emQuadra.map((j, i) => {
    const sorteio = criarSorteio(`${opcoes.chave}|${j.nome}`)
    // Mais minutos que o seu normal, mais produção — e menos, menos. O sorteio
    // dos minutos é uniforme na faixa, então o fator fica CENTRADO em 1 e a
    // temporada inteira continua em cima da média-alvo de cada jogador.
    const fator = 1 + ACOPLAMENTO_MINUTOS * (minutos[i]! / minutosNormais(j.nivel) - 1)
    const valor = (media: number, sigma: number) => Math.max(0, Math.round(media * fator + ruido(sorteio) * sigma))
    return {
      nome: j.nome,
      minutos: minutos[i]!,
      pontos: valor(j.medias.ppg, SIGMA.PONTOS[j.nivel]),
      rebotes: valor(j.medias.rpg, SIGMA.REBOTES[j.niveis.REBOTES]),
      assistencias: valor(j.medias.apg, SIGMA.ASSISTENCIAS[j.niveis.ASSISTENCIAS]),
    }
  })
}

/** Uma cesta. Só um lado é somado, então o resultado nunca volta a empatar. */
export const CESTA_DE_DESEMPATE = 2

/**
 * DESEMPATE — a NBA não empata, a demo também não.
 *
 * Age sobre as linhas que VÃO PARA O BANCO (as já filtradas), porque é a soma
 * delas que vira placar (`semearPlacares`): decidir sobre o box cru decidiria
 * sobre um placar que não existe. A cesta vai para o maior pontuador do lado
 * sorteado, e o sorteio vem da chave do jogo — mesma chave, mesma escolha, em
 * qualquer banco, inclusive no script que repara o passado.
 *
 * Regra de simulação, não de estratégia: não muda apito nenhum e não entra no
 * ruleset. Nunca muta a entrada: devolve cópias.
 */
export function desempatar<T extends { pontos: number }>(
  casa: readonly T[],
  visitante: readonly T[],
  sorteio: () => number,
): { casa: T[]; visitante: T[]; desempatou: 'casa' | 'visitante' | null } {
  const soma = (lado: readonly T[]) => lado.reduce((total, l) => total + l.pontos, 0)
  const copia = { casa: casa.map((l) => ({ ...l })), visitante: visitante.map((l) => ({ ...l })) }
  if (soma(casa) !== soma(visitante)) return { ...copia, desempatou: null }

  const sorteado: 'casa' | 'visitante' = sorteio() < 0.5 ? 'casa' : 'visitante'
  const outro = sorteado === 'casa' ? 'visitante' : 'casa'
  const lado = copia[sorteado].length > 0 ? sorteado : outro
  if (copia[lado].length === 0) return { ...copia, desempatou: null }

  // `>` estrito: em empate de pontos, a primeira linha — estável entre execuções.
  const maior = copia[lado].reduce((m, l) => (l.pontos > m.pontos ? l : m))
  maior.pontos += CESTA_DE_DESEMPATE
  return { ...copia, desempatou: lado }
}
