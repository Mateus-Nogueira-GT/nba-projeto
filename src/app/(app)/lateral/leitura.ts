import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import type { ConfigTemporada } from '@/modules/dominio/temporada'
import { lerLateral, type DadosDaLateral } from '@/modules/entrega/lateral'

/**
 * A tag do cache da lateral. Quem muda o dado revalida por ela — hoje o cron da
 * rodada, que é quem fecha o box score da noite e sincroniza a classificação.
 */
export const TAG_LATERAL = 'lateral'

/**
 * A lateral é lida UMA vez por processo a cada hora, não uma vez por usuário.
 *
 * O recap da última noite e a classificação mudam poucas vezes por dia, e a
 * lateral aparece em TODA tela de aba a partir de 1280 px: sem cache, cada
 * abertura de página custaria duas consultas agregadas a mais.
 *
 * Só DADO GRÁTIS entra aqui (identidade 05, §7): Resultados e classificação são
 * abertos a todos os níveis. É por isso que o cache pode ser compartilhado —
 * `paywall.test.ts` continua proibindo `'use cache'` nas PÁGINAS pagas, e esta
 * função não é página nem lê feed.
 */
export const lerLateralCacheada = unstable_cache(
  async (hoje: string, temporada: string, config: ConfigTemporada): Promise<DadosDaLateral> =>
    lerLateral(getDb(), { hoje, temporada, config }),
  ['lateral'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)
