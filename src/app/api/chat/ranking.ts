import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { lerRankingDoDia } from '@/modules/entrega/sugestao/leitura'
import type { RankingDoDia } from '@/modules/entrega/sugestao/tipos'
import type { Ruleset } from '@/modules/motor/ruleset/schema'

/**
 * A tag do ranking estatístico. Quem fecha uma rodada a invalida — é o mesmo
 * contrato da lateral, e o teste de fonte dos crons cobra os dois.
 */
export const TAG_RANKING = 'ranking-sugestao'

/**
 * O RANKING DO DIA, LIDO UMA VEZ POR HORA — não uma vez por mensagem.
 *
 * É o mesmo ranking para todos os assinantes: com 10 mil deles conversando,
 * agregar os últimos dez jogos de cada jogador a cada pergunta pagaria o mesmo
 * custo dez mil vezes pelo mesmo número. `unstable_cache` aqui é o mesmo
 * padrão da lateral, e o único lugar desta feature onde Next aparece — os
 * módulos de `entrega` não importam `next/cache`, e o dependency-cruiser cobra.
 *
 * Medido em 19/09: `revalidateTag(tag, 'max')` é stale-while-revalidate, então
 * a primeira leitura após uma rodada fechar ainda serve o ranking anterior.
 * Para um ranking de dez jogos isso é aceitável.
 */
const lerCacheado = unstable_cache(
  async (dataReferencia: string, ruleset: Ruleset): Promise<RankingDoDia> =>
    lerRankingDoDia(getDb(), ruleset, dataReferencia),
  ['ranking-sugestao'],
  { tags: [TAG_RANKING], revalidate: 3600 },
)

/**
 * O ranking para esta mensagem, ou `undefined` se a leitura falhar.
 *
 * Degradar é obrigatório: a sugestão estatística é um acréscimo ao assistente,
 * e um erro de banco nela não pode derrubar a resposta a "onde vejo minha
 * assinatura?". Sem ranking, o chat responde exatamente como antes da
 * ADR-0012.
 */
export async function rankingDoDia(
  dataReferencia: string,
  ruleset: Ruleset,
): Promise<RankingDoDia | undefined> {
  try {
    return await lerCacheado(dataReferencia, ruleset)
  } catch {
    return undefined
  }
}
