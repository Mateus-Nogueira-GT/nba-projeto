import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, type ConfigTemporada } from '@/modules/dominio/temporada'
import {
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
