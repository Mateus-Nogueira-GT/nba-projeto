import { linhasDoNivel } from '../atributos'
import type { Ruleset } from '../ruleset/schema'
import type { Atributo, Nivel } from '../tipos'

/**
 * A SUGESTÃO ESTATÍSTICA — quem o assistente ranqueia quando pedem dica.
 *
 * FUNÇÃO PURA, e isso é o guardrail, não o estilo (ADR-0012). Pedir a um
 * modelo "avalie os melhores jogadores" faz ele CALCULAR, e calcular é onde
 * ele inventa número: a carga de 07/09 mediu isso. Aqui o motor calcula e
 * ordena; a IA recebe a lista pronta e só põe em palavras.
 *
 * A metodologia NIP continua sendo quem apita. Isto é uma segunda leitura,
 * exibida ao lado dela e marcada como tal — o `apitadoHoje` de cada item é o
 * que permite à tela e ao guardrail separarem as duas vozes.
 */

/** Um candidato ao ranking, com os jogos que a leitura já buscou. */
export type JogadorParaRanquear = {
  jogadorId: string
  nome: string
  timeSigla: string
  nivel: Nivel
  /**
   * O valor do atributo em cada jogo ENCERRADO, do mais RECENTE para o mais
   * antigo. O jogo em andamento não entra: box score parcial faria o ranking
   * dizer que o jogador está fraco porque ainda está no primeiro quarto.
   */
  jogos: number[]
  /**
   * O motor apitou este jogador NESTE atributo hoje. Por (jogador, atributo),
   * nunca por jogador: quem apita em pontos pode não apitar em rebotes, e
   * marcá-lo como apitado na lista de rebotes seria exatamente a confusão
   * entre as duas vozes que o guardrail existe para impedir.
   */
  apitadoHoje: boolean
}

/** Quantas vezes o jogador passou de uma linha, e em quantos jogos. */
export type TaxaNaLinha = { linha: number; bateu: number; de: number }

export type ItemRanqueado = {
  jogadorId: string
  nome: string
  timeSigla: string
  nivel: Nivel
  apitadoHoje: boolean
  /** Uma entrada por linha do nível, em ordem crescente de linha. */
  porLinha: TaxaNaLinha[]
}

/**
 * Bater a linha é ALCANÇÁ-LA: o produto escreve "20+", que se lê "20 ou mais".
 * Exigir superação faria o card prometer uma coisa e o ranking contar outra.
 */
function bateu(valor: number, linha: number): boolean {
  return valor >= linha
}

/**
 * Ordena os jogadores pela taxa da MENOR linha do nível — a aposta mais
 * conservadora de cada um.
 *
 * Por que a menor: cada nível tem linhas próprias (MVP em 20/25/30/35, RANDOLA
 * em 5/10), e comparar a taxa de um em 20 com a do outro em 5 é comparar
 * coisas diferentes. A menor linha é a única que existe em todos os níveis
 * como "o piso daquele jogador". A escolha mora no ruleset
 * (`sugestao_estatistica.ordenacao`) porque é definição de metodologia.
 *
 * Empate resolve pela linha seguinte, e depois pelo nome — para a ordem não
 * depender da ordem de chegada do banco.
 */
function compararPorMenorLinha(a: ItemRanqueado, b: ItemRanqueado): number {
  const maximo = Math.max(a.porLinha.length, b.porLinha.length)
  for (let i = 0; i < maximo; i += 1) {
    const taxaA = a.porLinha[i]
    const taxaB = b.porLinha[i]
    if (taxaA === undefined || taxaB === undefined) break
    const fracaoA = taxaA.de === 0 ? 0 : taxaA.bateu / taxaA.de
    const fracaoB = taxaB.de === 0 ? 0 : taxaB.bateu / taxaB.de
    if (fracaoA !== fracaoB) return fracaoB - fracaoA
  }
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

export function ranquearPorTaxaNaLinha(
  jogadores: readonly JogadorParaRanquear[],
  atributo: Atributo,
  ruleset: Ruleset,
): ItemRanqueado[] {
  const { janela_jogos, minimo_jogos } = ruleset.sugestao_estatistica

  const itens: ItemRanqueado[] = []
  for (const jogador of jogadores) {
    const linhas = linhasDoNivel(jogador.nivel, atributo, ruleset)
    // Sem linha não há o que contar. Silêncio é a resposta certa.
    if (linhas.length === 0) continue

    // Os mais RECENTES: a lista chega do mais novo para o mais antigo, então
    // a janela corta o fim.
    const janela = jogador.jogos.slice(0, janela_jogos)
    // Amostra curta não vira taxa: sem isto, "2 de 2" lideraria o ranking.
    if (janela.length < minimo_jogos) continue

    itens.push({
      jogadorId: jogador.jogadorId,
      nome: jogador.nome,
      timeSigla: jogador.timeSigla,
      nivel: jogador.nivel,
      apitadoHoje: jogador.apitadoHoje,
      porLinha: linhas.map((linha) => ({
        linha,
        bateu: janela.filter((valor) => bateu(valor, linha)).length,
        de: janela.length,
      })),
    })
  }

  return itens.sort(compararPorMenorLinha)
}
