import { arredondar } from '../../motor/arredondamento'
import { faixaDaConfianca } from '../../motor/confianca'
import type { Ruleset } from '../../motor/ruleset/schema'
import { valorDoAtributo } from '../../motor/tipos'
import type { Apito, Fatos, JogadorFato } from '../../motor/tipos'
import type { ItemFeed } from '../tipos-feed'

/**
 * O ITEM DA LISTA DA TEMPORADA ANTERIOR — irmão de `enriquecer`
 * (lista-secreta.ts), puro.
 *
 * Mesma forma de `ItemFeed` para que a tela da Lista desenhe um dia de
 * 2025-26 sem saber que ele é retroativo. O que muda é de onde vem cada campo:
 *
 * - `ultimos5` e `mediaTemporada` saem dos FATOS que o motor usou (média até a
 *   véspera, só da temporada do dia), não de `medias_jogador`, que é a média
 *   de hoje e olharia o futuro;
 * - `oddFaixa` é sempre null: não há odd coletada de uma rodada que já passou,
 *   e inventar uma seria pior que omitir;
 * - sem `narrativa`: a temporada anterior não chama LLM.
 *
 * Nome, foto e time chegam prontos no mapa — quem monta é o executor, com o
 * time que o jogador JOGOU no dia (o `TimeFato` que o contém).
 */

export type IdentidadeItem = {
  nome: string
  fotoUrl: string | null
  timeSigla: string
  timeNome: string
  posicao: string | null
}

/** Quantos jogos as barrinhas do card mostram — o mesmo `5` de `jogosRecentes` na Lista ao vivo. */
const JOGOS_NO_CARD = 5

/**
 * A média do fato vem com precisão cheia; o feed ao vivo carrega a de
 * `medias_jogador`, `numeric(5,2)`. Mesmas duas casas para o JSON ter a mesma
 * forma nas duas temporadas. É apresentação, não regra: o motor já decidiu
 * com a precisão cheia.
 */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function montarItensRetroativos(
  apitos: Apito[],
  fatos: Fatos,
  nomes: Map<string, IdentidadeItem>,
  ruleset: Ruleset,
): ItemFeed[] {
  const fatoPorJogador = new Map<string, JogadorFato>()
  for (const time of fatos.times) {
    for (const j of time.jogadores) fatoPorJogador.set(j.id, j)
  }

  return apitos.map((a): ItemFeed => {
    const fato = fatoPorJogador.get(a.jogadorId)
    const identidade = nomes.get(a.jogadorId)
    const media = fato?.medias[a.atributo]
    const linhaOuAlvo = a.linha ?? a.alvo1Q
    // DNP não é jogo nas barrinhas: o card mostra o que ele FEZ em quadra.
    const recentes = (fato?.historico ?? []).filter((h) => h.jogou).slice(0, JOGOS_NO_CARD)
    // Mesma conta que a tela imprime: arredonda primeiro, gradua depois.
    const exibido = a.confianca === null ? null : arredondar(a.confianca, ruleset)

    return {
      chave: a.chaveDeduplicacao,
      jogoId: a.jogoId,
      jogadorId: a.jogadorId,
      nome: identidade?.nome ?? fato?.nome ?? a.jogadorId,
      timeSigla: identidade?.timeSigla ?? '—',
      timeNome: identidade?.timeNome ?? '—',
      fotoUrl: identidade?.fotoUrl ?? null,
      atributo: a.atributo,
      nivelJogador: a.nivelJogador,
      nivelApito: a.nivelApito,
      turbo: a.turbo,
      modoFire: a.modoFire,
      opdOrigemNivel: a.opdOrigemNivel,
      linha: a.linha,
      confianca: a.confianca,
      grauConfianca: faixaDaConfianca(exibido, ruleset)?.grau ?? null,
      alvo1Q: a.alvo1Q,
      metodo: a.metodo,
      posicao: identidade?.posicao ?? null,
      // Sem linha e sem alvo não há o que conferir: vazio, não "0 de 5" —
      // a mesma regra de `naLinha`.
      ultimos5:
        linhaOuAlvo === null
          ? []
          : recentes.map((h) => {
              const valor = valorDoAtributo(h, a.atributo)
              return { valor, bateu: valor >= linhaOuAlvo }
            }),
      mediaTemporada: media === undefined ? null : duasCasas(media),
      oddFaixa: null,
    }
  })
}
