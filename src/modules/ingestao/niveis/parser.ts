import type { Atributo, Nivel } from '../../motor/tipos'
import { normalizarTexto, siglaDoTime } from './times'

export type JogadorNaLista = {
  nomeNaLista: string
  posicaoHierarquia: number
  nivel: Nivel
  atributo: Atributo
  timeNaLista: string
  timeSigla: string | null
  linhaNoArquivo: number
}

export type ProblemaDeParse = {
  linhaNoArquivo: number
  conteudo: string
  motivo: string
}

export type ResultadoParse = {
  jogadores: JogadorNaLista[]
  timesEncontrados: string[]
  timesSemSigla: string[]
  /** Linhas que PARECIAM entrada mas não puderam ser lidas. Nunca descartadas. */
  problemas: ProblemaDeParse[]
}

const FIM = /^\*\*lista secreta\*\*/

/**
 * Os três cabeçalhos de seção do documento, já normalizados.
 * `normalizarTexto` tira acento, baixa a caixa e troca pontuação por espaço:
 * "**Lista de Níveis(Rebotes)**" vira "lista de niveis rebotes".
 */
const SECOES: ReadonlyArray<readonly [RegExp, Atributo]> = [
  [/^lista de niveis pontos$/, 'PONTOS'],
  [/^lista de niveis rebotes$/, 'REBOTES'],
  [/^assistencias$/, 'ASSISTENCIAS'],
]

function secaoDaLinha(normalizada: string): Atributo | null {
  for (const [regex, atributo] of SECOES) {
    if (regex.test(normalizada)) return atributo
  }
  return null
}

/**
 * Prosa que a seção de rebotes intercala com os dados: o título da
 * classificação e as faixas de média, cada um aparecendo em versão simples E
 * em negrito. Não são time nem jogador.
 *
 * A rede de segurança é `timesSemSigla`: se uma linha de prosa escapar desta
 * lista, ela vira "time sem sigla" e o teste do arquivo real falha. Nada some
 * em silêncio — é a mesma garantia que o parser já dá para linha ilegível.
 */
const DEFINICAO: readonly RegExp[] = [
  /^classificacao de jogadores/,
  /^(mvp|all star|alls star|suporte|randola)\b.*\b(media|em diante)\b/,
]

function ehLinhaDeDefinicao(normalizada: string): boolean {
  return DEFINICAO.some((r) => r.test(normalizada))
}

/**
 * Typo específico do documento, não normalização esperta: "Suporye" aparece
 * várias vezes na seção de REBOTES (y e t são vizinhas no teclado). Curadoria
 * explícita, como o MAPA de times.ts trata "Phenix suns" — nunca fuzzy match,
 * que erraria em silêncio uma palavra nova amanhã.
 */
const TYPOS_DE_NIVEL: ReadonlyArray<readonly [RegExp, string]> = [[/\bsuporye\b/g, 'suporte']]

/**
 * Só quatro níveis existem. Os qualificadores de posição — "principal",
 * "secundário/a", "primário", "terciário/a", "quaternário/a", "terceira
 * opção", e o ordinal nu ("Suporte 4") — são redundantes com a posição
 * ordinal e NÃO têm efeito no motor — nenhuma regra os consulta. O documento
 * de 21/09 introduziu as variantes de terceiro/quarto lugar e a flexão de
 * gênero; nenhuma delas existia na versão anterior.
 */
function traduzirNivel(bruto: string): Nivel | null {
  let n = normalizarTexto(bruto)
  for (const [typo, correto] of TYPOS_DE_NIVEL) n = n.replace(typo, correto)

  n = n
    .replace(/\bterceira opcao\b/g, '')
    .replace(
      /\b(principal|secundario|secundaria|primario|terciario|terciaria|quaternario|quaternaria|\d+)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (n === 'mvp') return 'MVP'
  if (n === 'all star' || n === 'allstar') return 'ALL_STAR'
  if (n === 'suporte' || n === 'suport') return 'SUPORTE'
  if (n === 'randola') return 'RANDOLA'
  return null
}

/** Tira o negrito de uma linha "**...**"; devolve a linha como está se não tiver. */
function semNegrito(linha: string): string {
  const l = linha.trim()
  if (l.startsWith('**') && l.endsWith('**')) return l.slice(2, -2).trim()
  return l
}

/**
 * REBOTES do Miami não numera os jogadores:
 *
 *   **Giannis \- MVP principal**
 *   **Adebayo \- MVP secundário**
 *
 * Sem ordinal, a linha cairia em `nomeDoTime` (o teste `^\d` falha) e viraria
 * time falso. O discriminador seguro: depois de tirar o negrito, a ÚLTIMA
 * peça separada por "-" traduz para um nível válido — nome de time nunca
 * termina em MVP/All star/Suporte/Randola.
 *
 * Numa lista onde a posição é o que a OPD consulta, a ordem de aparição é a
 * hierarquia: quem chamar isto atribui a posição pela ordem em que o jogador
 * aparece dentro do time, porque o documento não escreveu o ordinal.
 */
function jogadorSemOrdinal(linha: string): { nome: string; nivel: Nivel } | null {
  const limpa = semNegrito(linha)
  if (/^\d/.test(limpa)) return null // tem ordinal — é o caminho normal, não este

  const pedacos = limpa
    .split(/\s*\\?-\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (pedacos.length < 2) return null

  const nivel = traduzirNivel(pedacos[pedacos.length - 1]!)
  if (nivel === null) return null

  const nome = pedacos.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim()
  if (nome.length === 0) return null

  return { nome, nivel }
}

/** Linha de cabeçalho de time: só spans em negrito, sem entrada numerada. */
function nomeDoTime(linha: string): string | null {
  const limpa = linha.trim()
  if (!limpa.startsWith('**')) return null

  // "**Dallas** **Mavericks**" são DOIS spans na mesma linha — juntar os dois,
  // senão o time inteiro (9 jogadores) some sem aviso.
  const spans = [...limpa.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]!.trim())
  if (spans.length === 0) return null

  const nome = spans.join(' ').replace(/\s+/g, ' ').trim()
  if (nome.length === 0) return null

  // A seção de REBOTES escreve o jogador em negrito ("**1 \- Towns \- MVP**").
  // O teste de "é entrada numerada?" tem que rodar DEPOIS de tirar o negrito;
  // antes dele, o `**` da frente faz o `^\d` falhar e cada jogador vira time.
  if (/^\s*\d+\s*\\?-/.test(nome)) return null

  // Nem toda linha em negrito sem ordinal é time — ver jogadorSemOrdinal.
  if (jogadorSemOrdinal(linha) !== null) return null

  return nome
}

/**
 * Cabeçalho de time em texto puro, sem negrito — como a seção de
 * ASSISTÊNCIAS escreve ("New York Knicks", "Denver"). O discriminador
 * seguro já existe: `siglaDoTime()`. Uma linha que o mapa curado de
 * times.ts reconhece É um time; prosa solta que o mapa não conhece
 * continua prosa — nunca vira time por parecer nome de time.
 */
function nomeDoTimeSemNegrito(linha: string): string | null {
  const limpa = linha.trim()
  if (limpa.length === 0) return null
  if (limpa.startsWith('**')) return null // isso é cabeçalho em negrito, não este caso
  if (/^\d/.test(limpa)) return null // entrada numerada de jogador, não time
  if (siglaDoTime(limpa) === null) return null
  return limpa
}

/**
 * Lê a lista de níveis do documento do CJ.
 *
 * O arquivo é escrito à mão e usa TRÊS separadores diferentes entre os campos
 * (`\-`, `-`, `- \-`), às vezes duplicados. Por isso a leitura quebra a linha
 * em pedaços e usa posição — primeiro é ordinal, último é nível, o miolo é
 * nome — em vez de um regex rígido que descartaria linhas em silêncio.
 */
export function lerListaDeNiveis(conteudo: string): ResultadoParse {
  const linhas = conteudo.split('\n')
  const jogadores: JogadorNaLista[] = []
  const problemas: ProblemaDeParse[] = []
  const timesEncontrados: string[] = []
  const timesSemSigla: string[] = []

  let atributoAtual: Atributo | null = null
  let timeAtual: string | null = null
  let siglaAtual: string | null = null
  // Posição para entradas sem ordinal (REBOTES do Miami) — reinicia a cada time novo.
  let contadorSemOrdinal = 0

  for (const [indice, linhaBruta] of linhas.entries()) {
    const numero = indice + 1
    const linha = linhaBruta.trimEnd()
    const normalizada = normalizarTexto(linha)

    const secao = secaoDaLinha(normalizada)
    if (secao !== null) {
      atributoAtual = secao
      timeAtual = null
      siglaAtual = null
      contadorSemOrdinal = 0
      continue
    }

    if (atributoAtual === null) continue
    if (FIM.test(linha.trim().toLowerCase())) break
    if (linha.trim().length === 0) continue
    if (ehLinhaDeDefinicao(normalizada)) continue

    // ASSISTÊNCIAS escreve o time em texto puro; PONTOS e REBOTES, em negrito.
    const time = nomeDoTime(linha) ?? nomeDoTimeSemNegrito(linha)
    if (time !== null) {
      timeAtual = time
      siglaAtual = siglaDoTime(time)
      timesEncontrados.push(time)
      if (siglaAtual === null) timesSemSigla.push(time)
      contadorSemOrdinal = 0
      continue
    }

    // REBOTES do Miami: jogador sem ordinal, a posição vem da ordem de aparição.
    const semOrdinal = jogadorSemOrdinal(linha)
    if (semOrdinal !== null) {
      if (timeAtual === null) {
        problemas.push({
          linhaNoArquivo: numero,
          conteudo: linha.trim(),
          motivo: 'jogador antes de qualquer cabeçalho de time',
        })
        continue
      }
      contadorSemOrdinal += 1
      jogadores.push({
        nomeNaLista: semOrdinal.nome,
        posicaoHierarquia: contadorSemOrdinal,
        nivel: semOrdinal.nivel,
        atributo: atributoAtual,
        timeNaLista: timeAtual,
        timeSigla: siglaAtual,
        linhaNoArquivo: numero,
      })
      continue
    }

    // Entrada de jogador começa com o número da hierarquia.
    // A seção de REBOTES pode ter a entrada em negrito: **1 \- Nome \- Nível**
    if (!/^\s*(?:\*\*)?\d+/.test(linha)) continue

    // Remover negrito se a linha for **...**
    let linhaParaParse = linha.trim()
    if (linhaParaParse.startsWith('**') && linhaParaParse.endsWith('**')) {
      linhaParaParse = linhaParaParse.slice(2, -2).trim()
    }

    const pedacos = linhaParaParse
      .split(/\s*\\?-\s*/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    if (pedacos.length < 3) {
      problemas.push({
        linhaNoArquivo: numero,
        conteudo: linha.trim(),
        motivo: 'não foi possível separar ordinal, nome e nível',
      })
      continue
    }

    const posicao = Number(pedacos[0])
    const nivelBruto = pedacos[pedacos.length - 1]!
    const nome = pedacos.slice(1, -1).join(' ').replace(/\s+/g, ' ').trim()
    const nivel = traduzirNivel(nivelBruto)

    if (!Number.isInteger(posicao) || posicao <= 0) {
      problemas.push({
        linhaNoArquivo: numero,
        conteudo: linha.trim(),
        motivo: `posição de hierarquia inválida: "${pedacos[0]}"`,
      })
      continue
    }
    if (nivel === null) {
      problemas.push({
        linhaNoArquivo: numero,
        conteudo: linha.trim(),
        motivo: `nível não reconhecido: "${nivelBruto}"`,
      })
      continue
    }
    if (nome.length === 0) {
      problemas.push({
        linhaNoArquivo: numero,
        conteudo: linha.trim(),
        motivo: 'nome vazio',
      })
      continue
    }
    if (timeAtual === null) {
      problemas.push({
        linhaNoArquivo: numero,
        conteudo: linha.trim(),
        motivo: 'jogador antes de qualquer cabeçalho de time',
      })
      continue
    }

    jogadores.push({
      nomeNaLista: nome,
      posicaoHierarquia: posicao,
      nivel,
      atributo: atributoAtual,
      timeNaLista: timeAtual,
      timeSigla: siglaAtual,
      linhaNoArquivo: numero,
    })
  }

  return { jogadores, timesEncontrados, timesSemSigla, problemas }
}
