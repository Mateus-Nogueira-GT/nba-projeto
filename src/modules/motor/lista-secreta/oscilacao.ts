import { deltaOscilacao, nivelMinimoOscilacao } from '../atributos'
import type { Ruleset } from '../ruleset/schema'
import { NIVEIS_APITO, valorDoAtributo } from '../tipos'
import type { Atributo, JogadorFato, Nivel, NivelApito } from '../tipos'

/**
 * Limiar de oscilação: o jogador está "abaixo" quando faz <= (média - delta).
 *
 * A notação "<=5 abaixo" do documento é ambígua, mas o exemplo do LeBron resolve:
 * média 25,7 com delta 5 dá limiar 20,7, e o documento diz "20 ou menos".
 * Ou seja, o <= se aplica ao PLACAR, não ao déficit.
 *
 * A média entra com precisão cheia, sem arredondar.
 *
 * O delta é POR ATRIBUTO: quem tira 10 rebotes não cai 6 num jogo ruim. Sem
 * tabela para o atributo, não há limiar — e o jogador não apita nele.
 */
export function limiarOscilacao(
  media: number,
  nivel: Nivel,
  atributo: Atributo,
  jogadorId: string | readonly string[],
  ruleset: Ruleset,
): number | null {
  const delta = deltaOscilacao(nivel, atributo, jogadorId, ruleset)
  if (delta === undefined) return null
  return media - delta
}

/** Conta jogos consecutivos abaixo, do mais recente para o mais antigo. */
function contarSequencia(
  jogador: JogadorFato,
  atributo: Atributo,
  media: number,
  limiar: number,
  ruleset: Ruleset,
): number {
  const maximo = NIVEIS_APITO[NIVEIS_APITO.length - 1] ?? 1
  let sequencia = 0

  for (const jogo of jogador.historico) {
    if (!jogo.jogou) {
      // P2: jogo não disputado NÃO quebra a sequência — é como se a data não existisse.
      if (ruleset.oscilacao.dnp === 'ignora') continue
      break
    }

    const valor = valorDoAtributo(jogo, atributo)
    const abaixo =
      ruleset.oscilacao.criterio_sequencia === 'limiar' ? valor <= limiar : valor < media

    if (!abaixo) break

    sequencia += 1
    if (sequencia >= maximo) break
  }

  return sequencia
}

export type ResultadoOscilacao = { nivelApito: NivelApito; turbo: boolean }

export function avaliarOscilacao(
  jogador: JogadorFato,
  atributo: Atributo,
  ruleset: Ruleset,
): ResultadoOscilacao | null {
  const nivel = jogador.classificacoes[atributo]
  if (nivel === undefined) return null

  const media = jogador.medias[atributo]
  if (media === undefined) return null

  const limiar = limiarOscilacao(
    media,
    nivel,
    atributo,
    [
      jogador.id,
      ...(jogador.chavesEstrategia ?? (jogador.chaveEstrategia ? [jogador.chaveEstrategia] : [])),
    ],
    ruleset,
  )
  if (limiar === null) return null

  const sequencia = contarSequencia(jogador, atributo, media, limiar, ruleset)
  if (sequencia === 0) return null

  const nivelApito = sequencia as NivelApito

  // O mínimo é por atributo: em pontos, Suporte/Randola começam no nível 2.
  if (nivelApito < nivelMinimoOscilacao(nivel, atributo, ruleset)) return null

  // P9: MVP no nível 3 vai pro turbo E acumula o bônus de confiança.
  const turbo =
    ruleset.oscilacao.turbo.aplica_a.includes(nivel) &&
    nivelApito >= ruleset.oscilacao.turbo.exige_nivel

  return { nivelApito, turbo }
}
