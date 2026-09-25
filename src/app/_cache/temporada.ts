import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe, type ConfigTemporada } from '@/modules/dominio/temporada'
import {
  temporadaDoCalendarioComecou,
  temporadasComDados,
  temporadaParaExibirNoCalendario,
  type RulesetDeTemporada,
} from '@/modules/entrega/estatisticas/temporadas'
import { taxaDaTemporada, type TaxaDaTemporada } from '@/modules/entrega/resultados'

import { TAG_LATERAL } from './lateral'

/**
 * OS AGREGADOS DA TEMPORADA, UMA VEZ POR HORA — não uma vez por visita.
 *
 * `temporadasComDados` (GROUP BY sobre todos os jogos encerrados) e
 * `taxaDaTemporada` (CTE sobre apitos × jogos × estatísticas) mudam quando
 * um jogo fecha — poucas vezes por dia — e rodavam em toda abertura de
 * Estatísticas e Resultados. No hiato, Estatísticas é a tela principal
 * (auditoria 23/09). A tag é a da lateral: os mesmos crons que fecham a
 * rodada já a invalidam, e a lateral mostra esses mesmos números.
 *
 * Os argumentos são a chave do cache: por isso o calendário e o piso entram
 * soltos, e não o ruleset inteiro — o mesmo cuidado de `lerLateralCacheada`.
 * `_hoje` só entra na chave: é o que faz o cache virar o dia.
 */
const temporadaExibidaCacheada = unstable_cache(
  async (_hoje: string, config: ConfigTemporada, minimoJogos: number): Promise<string> =>
    temporadaParaExibirNoCalendario(getDb(), config, minimoJogos, new Date()),
  ['temporada-exibida'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

export function temporadaParaExibirCacheada(
  ruleset: RulesetDeTemporada,
  agora: Date,
): Promise<string> {
  return temporadaExibidaCacheada(
    dataDeReferencia(agora, ruleset.rodada.fuso),
    calendarioDoRuleset(ruleset),
    ruleset.temporada.minimo_jogos_para_exibir,
  )
}

export const taxaDaTemporadaCacheada = unstable_cache(
  async (ate: string, dias: number): Promise<TaxaDaTemporada> =>
    taxaDaTemporada(getDb(), ate, dias),
  ['taxa-da-temporada'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

const temporadasComDadosCacheadas = unstable_cache(
  async (_hoje: string, config: ConfigTemporada): Promise<string[]> =>
    (await temporadasComDados(getDb(), config)).map((t) => t.temporada),
  ['temporadas-com-dados'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

const calendarioComecouCacheado = unstable_cache(
  // Meio-dia UTC do rótulo: o dia da rodada não escorrega em borda de fuso.
  async (hoje: string, config: ConfigTemporada): Promise<boolean> =>
    temporadaDoCalendarioComecou(getDb(), config, new Date(`${hoje}T12:00:00.000Z`)),
  ['temporada-do-calendario-comecou'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

/** Em que temporada o app está, qual a tela mostra por padrão, e quais o seletor oferece. */
export type TemporadasDaTela = {
  /** A temporada a que a data de hoje pertence — a ÚNICA com portão de plano. */
  doCalendario: string
  /** O padrão das telas de consulta (`temporadaExibida`). */
  exibida: string
  /** Em ordem cronológica: é a ordem do seletor ("2025-26 | 2026-27"). */
  disponiveis: string[]
  /**
   * O HIATO de verdade: a exibida ainda é a anterior E a temporada do
   * calendário não tem jogo nenhum até hoje. Só aqui a temporada anterior é o
   * padrão das telas de apito (`temporadaDaTela`); na noite de estreia não.
   */
  emHiato: boolean
}

/**
 * O SELETOR DE TEMPORADA, pelo cache. Resultados e Lista mostram o seletor em
 * TODA visita — inclusive na temporada atual —, e o caminho de hoje não pode
 * ganhar um GROUP BY por visita: é o mesmo cache e a mesma tag da exibida.
 */
export async function temporadasDaTelaCacheadas(
  ruleset: RulesetDeTemporada,
  agora: Date,
): Promise<TemporadasDaTela> {
  const config = calendarioDoRuleset(ruleset)
  const hoje = dataDeReferencia(agora, ruleset.rodada.fuso)
  const doCalendario = temporadaDe(agora, config)
  const [exibida, comDados] = await Promise.all([
    temporadaParaExibirCacheada(ruleset, agora),
    temporadasComDadosCacheadas(hoje, config),
  ])
  // O rótulo começa pelo ano inicial com quatro dígitos: a ordem alfabética é a cronológica.
  const disponiveis = [...new Set([...comDados, doCalendario, exibida])].sort()
  // Só se pergunta quando a exibida está atrasada — no resto do ano é falso sem consulta.
  const emHiato = exibida !== doCalendario && !(await calendarioComecouCacheado(hoje, config))
  return { doCalendario, exibida, disponiveis, emHiato }
}

/** A taxa da temporada anterior: a mesma conta de `taxaDaTemporada`, sobre `apitos_retroativos`. */
export const taxaRetroativaCacheada = unstable_cache(
  async (ate: string, dias: number): Promise<TaxaDaTemporada> =>
    taxaDaTemporada(getDb(), ate, dias, 'apitos_retroativos'),
  ['taxa-retroativa'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)
