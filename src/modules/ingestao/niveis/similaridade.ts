import { normalizarTexto } from './times'

/** Distância de edição, com corte: acima do limite não interessa o valor exato. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(atual[j - 1]! + 1, anterior[j]! + 1, anterior[j - 1]! + custo)
    }
    anterior = atual
  }

  return anterior[b.length]!
}

function proximidade(a: string, b: string): number {
  const maior = Math.max(a.length, b.length)
  return maior === 0 ? 1 : 1 - levenshtein(a, b) / maior
}

/**
 * Pontua o quanto um nome do provedor casa com um nome da lista do CJ.
 *
 * A lista tem grafia livre e frequentemente só o sobrenome: "Wembayama",
 * "Cooper Fllag", "Edjecombe", "chmaphagnie", "Strahwther", "Brunson".
 * Por isso o sobrenome pesa mais que o nome completo.
 */
export function pontuar(nomeNaLista: string, nomeDoProvedor: string): number {
  const a = normalizarTexto(nomeNaLista)
  const b = normalizarTexto(nomeDoProvedor)
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 1

  const tokensA = a.split(' ')
  const tokensB = b.split(' ')
  const sobrenomeA = tokensA[tokensA.length - 1]!
  const sobrenomeB = tokensB[tokensB.length - 1]!

  const completo = proximidade(a, b)
  const sobrenome = proximidade(sobrenomeA, sobrenomeB)

  // Nome da lista contido no do provedor (ex.: "Brunson" -> "Jalen Brunson").
  const contido = tokensA.every((t) => tokensB.includes(t)) ? 1 : 0

  return Math.max(completo, sobrenome * 0.95, contido * 0.9)
}

export type Candidato = {
  idExterno: string
  nomeCompleto: string
  timeSiglaProvedor: string | null
  ativo: boolean
  score: number
}

export type Sugestao = {
  nomeNaLista: string
  candidatos: Candidato[]
  /** Um único candidato claramente à frente dos demais. */
  inequivoco: boolean
}

export type OpcoesSugestao = {
  /** Abaixo disso o candidato nem é oferecido. */
  scoreMinimo: number
  /** Folga sobre o segundo colocado para o primeiro ser considerado inequívoco. */
  folgaInequivoca: number
  maximoCandidatos: number
}

export const OPCOES_PADRAO: OpcoesSugestao = {
  scoreMinimo: 0.55,
  folgaInequivoca: 0.15,
  maximoCandidatos: 5,
}

export function sugerir(
  nomeNaLista: string,
  jogadoresDoProvedor: { idExterno: string; nomeCompleto: string; timeSiglaProvedor: string | null; ativo: boolean }[],
  opcoes: OpcoesSugestao = OPCOES_PADRAO,
): Sugestao {
  const candidatos = jogadoresDoProvedor
    .map((j) => ({ ...j, score: pontuar(nomeNaLista, j.nomeCompleto) }))
    .filter((c) => c.score >= opcoes.scoreMinimo)
    .sort((a, b) => b.score - a.score)
    .slice(0, opcoes.maximoCandidatos)

  const primeiro = candidatos[0]
  const segundo = candidatos[1]
  const inequivoco =
    primeiro !== undefined &&
    (segundo === undefined || primeiro.score - segundo.score >= opcoes.folgaInequivoca)

  return { nomeNaLista, candidatos, inequivoco }
}
