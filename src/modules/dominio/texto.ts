/**
 * Comparação aproximada de nomes — utilidade de texto, pura.
 *
 * Vive no domínio (L1) porque tem DOIS consumidores em camadas diferentes:
 *
 *   L0 ingestão — casar "chmaphagnie" da lista do CJ com o nome do provedor
 *   L3 entrega  — a busca da aba de estatísticas, onde o usuário digita torto
 *
 * Duplicar isso seria criar duas noções de "nome parecido" que divergem com o
 * tempo. O usuário que acha "Doncic" digitando "doncick" na busca precisa da
 * mesma régua que reconciliou o nome na importação.
 */

/** Sem acento, sem pontuação, minúsculo, espaço único. */
export function normalizarTexto(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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
 * Pontua o quanto dois nomes casam, de 0 a 1.
 *
 * A lista do CJ tem grafia livre e frequentemente só o sobrenome: "Wembayama",
 * "Cooper Fllag", "Edjecombe", "chmaphagnie", "Strahwther", "Brunson". Por isso
 * o sobrenome pesa mais que o nome completo.
 */
export function pontuar(consulta: string, alvo: string): number {
  const a = normalizarTexto(consulta)
  const b = normalizarTexto(alvo)
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 1

  const tokensA = a.split(' ')
  const tokensB = b.split(' ')
  const sobrenomeA = tokensA[tokensA.length - 1]!
  const sobrenomeB = tokensB[tokensB.length - 1]!

  const completo = proximidade(a, b)
  const sobrenome = proximidade(sobrenomeA, sobrenomeB)

  // Nome da consulta contido no do alvo (ex.: "Brunson" -> "Jalen Brunson").
  const contido = tokensA.every((t) => tokensB.includes(t)) ? 1 : 0

  return Math.max(completo, sobrenome * 0.95, contido * 0.9)
}

/**
 * Prefixo/infixo: a consulta aparece literalmente dentro do alvo.
 *
 * Separado de `pontuar` porque busca por nome PARCIAL é uma pergunta diferente
 * de busca por nome ERRADO. "brun" está contido em "Jalen Brunson", mas a
 * distância de edição entre os dois é enorme — quem confia só no Levenshtein
 * não acha ninguém digitando as quatro primeiras letras.
 */
export function contemTrecho(consulta: string, alvo: string): boolean {
  const a = normalizarTexto(consulta)
  if (a.length === 0) return false
  return normalizarTexto(alvo).includes(a)
}
