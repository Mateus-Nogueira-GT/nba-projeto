import { datasRetroativasCacheadas } from '@/app/_cache/retroativo'
import { temporadasDaTelaCacheadas } from '@/app/_cache/temporada'
import { temporadaDe, type ConfigTemporada } from '@/modules/dominio/temporada'
import { dataCalendarioValida } from '@/modules/entrega/retroativo/data'
import { ehTemporadaAnterior, temporadaDaUrl } from '@/modules/entrega/retroativo/temporada'
import type { RulesetDeTemporada } from '@/modules/entrega/estatisticas/temporadas'

/** A temporada de uma tela de Estatísticas, e o que o seletor e os links precisam dela. */
export type TemporadaDasEstatisticas = {
  temporada: string
  /**
   * Só a escolha VÁLIDA viaja nos links (jogador ↔ time ↔ jogo): a visita
   * padrão não muda nenhuma URL, e lixo na URL não se propaga.
   */
  escolhida: string | undefined
  /** Anterior à do CALENDÁRIO (não à exibida): só ela abre a profundidade para todo plano. */
  anterior: boolean
  /**
   * Anterior E com dado retroativo (`motor:retroativo` rodou nela): só aí
   * "Apitos da estratégia" lê `apitos_retroativos` e a hierarquia é
   * remontada pelo box. Uma temporada que foi publicada AO VIVO (2026-27 vista
   * de outubro de 2027) não tem linha retroativa: lê `apitos` e a lista do CJ,
   * como no dia em que foi publicada.
   */
  retroativa: boolean
  /** A temporada a que a data de hoje pertence — a única com portão de plano. */
  doCalendario: string
  /** As opções do seletor, em ordem cronológica. */
  disponiveis: string[]
}

type Params = Record<string, string | string[] | undefined>

/**
 * A temporada de Estatísticas: o padrão continua a EXIBIDA (a que tem dado —
 * no hiato, a passada; o caminho de hoje), e `?temporada=` troca dentro das
 * disponíveis (`temporadaDaUrl`). Pelo cache: o caminho da temporada atual
 * não ganha consulta por visita.
 */
export async function temporadaDasEstatisticas(
  params: Params,
  ruleset: RulesetDeTemporada,
  agora: Date,
): Promise<TemporadaDasEstatisticas> {
  const { doCalendario, exibida, disponiveis } = await temporadasDaTelaCacheadas(ruleset, agora)
  const temporada = temporadaDaUrl(params.temporada, { exibida, disponiveis })
  const valida = typeof params.temporada === 'string' && disponiveis.includes(params.temporada)
  const anterior = ehTemporadaAnterior(temporada, doCalendario)
  // Só se pergunta pelas datas numa temporada anterior, e pelo cache: a
  // temporada atual não ganha leitura nenhuma por visita.
  const retroativa = anterior && (await datasRetroativasCacheadas(temporada)).length > 0
  return {
    temporada,
    escolhida: valida ? temporada : undefined,
    anterior,
    retroativa,
    doCalendario,
    disponiveis,
  }
}

/**
 * `?data=` de uma tela da temporada anterior: só vale se for um dia de
 * verdade DAQUELA temporada — senão, nenhum, e a tela usa o último dia dela.
 * Não escolhe temporada: a temporada já veio de `temporadaDasEstatisticas`.
 */
export function diaDaTemporada(
  valor: string | string[] | undefined,
  temporada: string,
  calendario: ConfigTemporada,
): string | null {
  if (typeof valor !== 'string' || !dataCalendarioValida(valor)) return null
  return temporadaDe(new Date(`${valor}T12:00:00.000Z`), calendario) === temporada ? valor : null
}
