import type { Nivel } from '../../motor/tipos'
import { normalizarTexto, siglaDoTime } from './times'

export type JogadorNaLista = {
  nomeNaLista: string
  posicaoHierarquia: number
  nivel: Nivel
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

const INICIO = /lista de niveis/
const FIM = /^\*\*lista secreta\*\*/

/**
 * Só quatro níveis existem. Os sufixos "principal"/"secundário" são redundantes
 * com a posição ordinal e NÃO têm efeito no motor — nenhuma regra os consulta.
 */
function traduzirNivel(bruto: string): Nivel | null {
  const n = normalizarTexto(bruto)
    .replace(/\b(principal|secundario|primario)\b/g, '')
    .trim()

  if (n === 'mvp') return 'MVP'
  if (n === 'all star' || n === 'allstar') return 'ALL_STAR'
  if (n === 'suporte' || n === 'suport') return 'SUPORTE'
  if (n === 'randola') return 'RANDOLA'
  return null
}

/** Linha de cabeçalho de time: só spans em negrito, sem entrada numerada. */
function nomeDoTime(linha: string): string | null {
  const limpa = linha.trim()
  if (!limpa.startsWith('**')) return null
  if (/^\s*\d+\s*\\?-/.test(limpa)) return null

  // "**Dallas** **Mavericks**" são DOIS spans na mesma linha — juntar os dois,
  // senão o time inteiro (9 jogadores) some sem aviso.
  const spans = [...limpa.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]!.trim())
  if (spans.length === 0) return null

  const nome = spans.join(' ').replace(/\s+/g, ' ').trim()
  return nome.length > 0 ? nome : null
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

  let dentro = false
  let timeAtual: string | null = null
  let siglaAtual: string | null = null

  for (const [indice, linhaBruta] of linhas.entries()) {
    const numero = indice + 1
    const linha = linhaBruta.trimEnd()
    const normalizada = normalizarTexto(linha)

    if (!dentro) {
      if (INICIO.test(normalizada)) dentro = true
      continue
    }
    if (FIM.test(linha.trim().toLowerCase())) break
    if (linha.trim().length === 0) continue

    const time = nomeDoTime(linha)
    if (time !== null) {
      timeAtual = time
      siglaAtual = siglaDoTime(time)
      timesEncontrados.push(time)
      if (siglaAtual === null) timesSemSigla.push(time)
      continue
    }

    // Entrada de jogador começa com o número da hierarquia.
    if (!/^\s*\d+/.test(linha)) continue

    const pedacos = linha
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
      timeNaLista: timeAtual,
      timeSigla: siglaAtual,
      linhaNoArquivo: numero,
    })
  }

  return { jogadores, timesEncontrados, timesSemSigla, problemas }
}
