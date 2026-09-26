import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { datasRetroativas, feedRetroativoDoDia } from '@/modules/entrega/retroativo/leitura'
import { ehTemporadaAnterior } from '@/modules/entrega/retroativo/temporada'
import type { ConteudoFeed } from '@/modules/entrega/tipos-feed'

/**
 * A TEMPORADA ANTERIOR, LIDA UMA VEZ POR HORA — não uma vez por visita.
 *
 * No hiato (lançamento ~02/10 até a primeira bola), a temporada anterior é o
 * PADRÃO de Resultados e da Lista: toda visita perguntava ao banco "quais
 * datas essa temporada tem" (UNION sobre `apitos_retroativos` e
 * `feed_retroativo`) e relia a Lista do dia. Esse dado só muda quando o
 * operador roda `motor:retroativo` — nunca por cron, nunca por visita.
 *
 * Por isso a revalidação é por TEMPO, não por evento: nenhuma rota do app
 * sabe da temporada anterior (os crons e as rotas públicas não podem nem
 * nomeá-la — `retroativo/__tests__/fronteiras.test.ts`), e o script roda
 * fora do Next, sem como chamar `revalidateTag`. Depois de uma rodada do
 * script, a tela reflete o dado novo em até `REVALIDAR_RETROATIVO` segundos
 * (runbook `temporada-retroativa.md`). A tag existe para uma invalidação
 * manual futura, sem mudar a forma do cache.
 *
 * Só temporada ANTERIOR, aberta a todo plano (spec 25/09, decisão 6): nada
 * daqui é dado pago, e o cache pode ser compartilhado entre níveis.
 *
 * Os valores guardados são só strings e JSON (a Lista é `jsonb`): atravessam
 * o `unstable_cache` sem reidratação. O recap, os greens e o Fire Live NÃO
 * entram: trazem `Date` aninhado. No hiato eles rodam em TODA visita padrão
 * a Resultados (que abre a última data da temporada anterior), pelo índice
 * `(temporada, data_referencia)` — o mesmo custo por visita que o caminho ao
 * vivo já tem com `recapDaNoite`, `greensDoDia` e `conferirFireLive`.
 */
export const TAG_RETROATIVO = 'retroativo'
const REVALIDAR_RETROATIVO = 3600

/** As datas com apito ou Lista da temporada — as setas e o seletor de data andam por elas. */
export const datasRetroativasCacheadas = unstable_cache(
  async (temporada: string): Promise<string[]> => datasRetroativas(getDb(), temporada),
  ['datas-retroativas'],
  { tags: [TAG_RETROATIVO], revalidate: REVALIDAR_RETROATIVO },
)

/** A Lista daquele dia como teria saído — chave (temporada, data), o índice das tabelas. */
export const feedRetroativoCacheado = unstable_cache(
  async (temporada: string, dataReferencia: string): Promise<ConteudoFeed | null> =>
    feedRetroativoDoDia(getDb(), temporada, dataReferencia),
  ['feed-retroativo'],
  { tags: [TAG_RETROATIVO], revalidate: REVALIDAR_RETROATIVO },
)

/**
 * A TEMPORADA ANTERIOR que a tela deve abrir — ou null, e aí é o caminho de
 * hoje, com todos os portões de plano.
 *
 * `temporada` já vem resolvida (escolha válida ou o padrão). Só é anterior o
 * que não é a temporada do calendário, e só abre com dado retroativo — sem
 * nenhuma data não há o que mostrar, e o caminho de hoje explica o vazio
 * melhor (o hiato, "sem lista"). As datas só são lidas quando a temporada já
 * é anterior: a temporada atual não ganha nem a leitura do cache.
 */
export async function temporadaAnteriorComDados(
  temporada: string,
  doCalendario: string,
): Promise<{ temporada: string; datas: string[] } | null> {
  if (!ehTemporadaAnterior(temporada, doCalendario)) return null
  const datas = await datasRetroativasCacheadas(temporada)
  return datas.length === 0 ? null : { temporada, datas }
}
