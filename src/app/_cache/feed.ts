import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { lerFeed } from '@/modules/entrega/lista-secreta'
import type { ConteudoFeed } from '@/modules/entrega/tipos-feed'

/**
 * A LISTA DO DIA, LIDA UMA VEZ — não uma vez por visita.
 *
 * O feed é o mesmo para todo assinante da data; o que muda por pessoa (nível,
 * preferências, acompanhados) continua dinâmico na página. Por isso o cache
 * guarda só o snapshot, e a página continua sem `'use cache'`: quem chama
 * esta função já passou pelo portão de nível (paywall.test.ts).
 *
 * Duas tags: `feed-<data>` para quem publica um dia, `feed` para quem
 * publica vários (a demo). A tag por data obriga a construir o wrapper por
 * chamada — `unstable_cache` fixa as tags na construção.
 *
 * `null` NUNCA é confiado. `revalidateTag(…, 'max')` serve o valor velho uma
 * vez; se o velho fosse "ainda não publicado", o primeiro assinante depois
 * da publicação veria "Próxima lista às…". Antes da publicação cada visita
 * paga uma consulta — barata, e só nessa janela.
 *
 * `revalidate: 600`: nome e foto são apresentação atual (ver
 * `comIdentidadeAtual`) e mudam sem republicar; dez minutos é o atraso
 * aceito para eles.
 */
export const TAG_FEED = 'feed'
export const tagDoFeed = (dataReferencia: string) => `feed-${dataReferencia}`

type FeedLido = { conteudo: ConteudoFeed; geradoEm: Date }

export async function lerFeedCacheado(dataReferencia: string): Promise<FeedLido | null> {
  // A distinção entre "computou agora" e "veio do cache" é o que faz o null
  // nunca-confiado funcionar sem pagar duas consultas em toda visita: um
  // null CALCULADO agora já é verdade fresca (não tem o que reler); um null
  // que voltou do CACHE pode ser o valor velho que `revalidateTag(…, 'max')`
  // serve uma vez enquanto revalida em segundo plano — e "velho" aqui é
  // "ainda não publicado", o caso que este flag protege.
  //
  // O flag é marcado DEPOIS do await (W2-1). No caminho velho o Next dispara
  // o callback em segundo plano e roda a parte síncrona dele antes de
  // devolver o valor guardado (unstable-cache.js ~l.189 e ~l.219): marcado
  // na primeira linha, o flag já estaria true quando o null velho voltasse,
  // e a visita confiaria nele. Depois do await, só um cálculo que de fato
  // terminou antes do retorno conta como fresco.
  let computouAgora = false
  const emCache = await unstable_cache(
    async () => {
      const feed = await lerFeed(getDb(), dataReferencia)
      computouAgora = true
      return feed && { conteudo: feed.conteudo, geradoEmIso: feed.geradoEm.toISOString() }
    },
    ['feed', dataReferencia],
    { tags: [TAG_FEED, tagDoFeed(dataReferencia)], revalidate: 600 },
  )()

  if (emCache !== null) {
    return { conteudo: emCache.conteudo, geradoEm: new Date(emCache.geradoEmIso) }
  }
  return computouAgora ? null : lerFeed(getDb(), dataReferencia)
}
